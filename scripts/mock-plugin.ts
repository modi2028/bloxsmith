/**
 * Mock Studio plugin — DEV ONLY.
 *
 * Polls the tool-call queue exactly like the real Luau plugin will (Phase 4),
 * executes calls against an in-memory fake DataModel, and posts results back.
 * Lets us exercise the full chat -> model -> queue -> "Studio" -> model loop
 * before the real plugin exists.
 *
 *   npm run mock:plugin
 *
 * WARNING: claims pending tool calls for ALL users on this database.
 */
import { and, asc, eq, gt, isNull, sql } from "drizzle-orm";
import { createStandaloneDb } from "../src/server/db/standalone";
import * as schema from "../src/server/db/schema";
import { completeToolCall } from "../src/server/bridge/queue-core";
import { CONTRACT_VERSION } from "../src/lib/tool-contract";

const POLL_MS = 500;

type FakeInstance = {
  ref: string;
  className: string;
  name: string;
  props: Record<string, unknown>;
  children: string[];
  source?: string;
};

class ToolError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

/** In-memory stand-in for one place's DataModel, keyed by chat session. */
class FakeStudio {
  private instances = new Map<string, FakeInstance>();
  private counter = 0;

  constructor() {
    const roots = [
      "workspace",
      "replicated_storage",
      "server_script_service",
      "server_storage",
      "starter_gui",
      "starter_player",
      "lighting",
    ];
    for (const root of roots) {
      this.instances.set(`ref:${root}`, {
        ref: `ref:${root}`,
        className: "ServiceRoot",
        name: root,
        props: {},
        children: [],
      });
    }
    const baseplate = this.mint("Part", "Baseplate", "ref:workspace", {
      Anchored: true,
      Size: { $type: "Vector3", value: [512, 20, 512] },
    });
    this.mint("SpawnLocation", "SpawnLocation", "ref:workspace", {});
    void baseplate;
  }

  private mint(
    className: string,
    name: string,
    parentRef: string,
    props: Record<string, unknown>,
  ): FakeInstance {
    const parent = this.get(parentRef);
    const ref = `ref:i_${(++this.counter).toString(36)}`;
    const inst: FakeInstance = { ref, className, name, props, children: [] };
    this.instances.set(ref, inst);
    parent.children.push(ref);
    return inst;
  }

  private get(ref: string): FakeInstance {
    const inst = this.instances.get(ref);
    if (!inst) throw new ToolError("not_found", `${ref} no longer exists`);
    return inst;
  }

  handle(tool: string, args: Record<string, unknown>): unknown {
    switch (tool) {
      case "get_selection":
        return { items: [] };
      case "list_children": {
        const parent = this.get(args.parent as string);
        return {
          items: parent.children.map((childRef) => {
            const c = this.get(childRef);
            return {
              ref: c.ref,
              className: c.className,
              name: c.name,
              childCount: c.children.length,
            };
          }),
        };
      }
      case "get_properties": {
        const inst = this.get(args.target as string);
        return {
          properties: {
            Name: inst.name,
            ClassName: inst.className,
            ...inst.props,
          },
        };
      }
      case "create_instance": {
        const inst = this.mint(
          args.className as string,
          (args.name as string) ?? (args.className as string),
          args.parent as string,
          (args.properties as Record<string, unknown>) ?? {},
        );
        return { ref: inst.ref };
      }
      case "set_property": {
        const inst = this.get(args.target as string);
        inst.props[args.name as string] = args.value;
        return {};
      }
      case "write_script": {
        const source = args.source as string;
        const lineCount = source.split("\n").length;
        if (args.target) {
          const inst = this.get(args.target as string);
          inst.source = source;
          return { ref: inst.ref, lineCount };
        }
        const inst = this.mint(
          args.scriptType as string,
          args.name as string,
          args.parent as string,
          {},
        );
        inst.source = source;
        return { ref: inst.ref, lineCount };
      }
      case "delete_instance": {
        const target = args.target as string;
        this.get(target); // throws not_found if missing
        this.instances.delete(target);
        for (const inst of this.instances.values()) {
          inst.children = inst.children.filter((c) => c !== target);
        }
        return {};
      }
      case "run_luau":
        return { output: ["(mock) executed without error"] };
      default:
        throw new ToolError("internal", `Mock cannot handle tool: ${tool}`);
    }
  }
}

async function main() {
  const { db } = createStandaloneDb();
  const studios = new Map<string, FakeStudio>();

  console.log(
    "Mock Studio plugin running — polling the tool-call queue every " +
      `${POLL_MS}ms. DEV ONLY: handles calls for ALL users. Ctrl+C to stop.`,
  );

  for (;;) {
    const pending = await db.query.toolCallQueue.findMany({
      where: and(
        eq(schema.toolCallQueue.status, "pending"),
        gt(schema.toolCallQueue.deadlineAt, new Date()),
      ),
      orderBy: asc(schema.toolCallQueue.createdAt),
      limit: 10,
    });

    // SAFEGUARD: never race a real Studio plugin. Skip calls for any user
    // whose plugin token polled within the last 15s — the real plugin owns
    // those. (Racing splits refs between two executors and breaks builds.)
    const liveUsers = await db
      .select({ userId: schema.pluginTokens.userId })
      .from(schema.pluginTokens)
      .where(
        and(
          isNull(schema.pluginTokens.revokedAt),
          sql`${schema.pluginTokens.lastSeenAt} > now() - interval '15 seconds'`,
        ),
      );
    const liveUserIds = new Set(liveUsers.map((u) => u.userId));

    for (const row of pending) {
      if (liveUserIds.has(row.userId)) {
        console.log(
          `[mock] skipping ${row.tool} — user's real Studio plugin is connected`,
        );
        continue;
      }
      // Optimistic claim — skip if someone else got it first.
      const [claimed] = await db
        .update(schema.toolCallQueue)
        .set({ status: "claimed", claimedAt: new Date() })
        .where(
          and(
            eq(schema.toolCallQueue.id, row.id),
            eq(schema.toolCallQueue.status, "pending"),
          ),
        )
        .returning({ id: schema.toolCallQueue.id });
      if (!claimed) continue;

      // Simulate Studio latency.
      await new Promise((r) => setTimeout(r, 150 + Math.random() * 250));

      let studio = studios.get(row.sessionId);
      if (!studio) {
        studio = new FakeStudio();
        studios.set(row.sessionId, studio);
      }

      const started = Date.now();
      try {
        const value = studio.handle(
          row.tool,
          row.args as Record<string, unknown>,
        );
        await completeToolCall(db, {
          userId: row.userId,
          envelope: {
            v: CONTRACT_VERSION,
            id: row.id,
            ok: true,
            value,
            durationMs: Date.now() - started,
          },
        });
        console.log(`[mock] ${row.tool} -> ok (${Date.now() - started}ms)`);
      } catch (err) {
        const code = err instanceof ToolError ? err.code : "internal";
        const message = err instanceof Error ? err.message : String(err);
        await completeToolCall(db, {
          userId: row.userId,
          envelope: {
            v: CONTRACT_VERSION,
            id: row.id,
            ok: false,
            error: {
              code: code as "not_found" | "internal",
              message,
            },
            durationMs: Date.now() - started,
          },
        });
        console.log(`[mock] ${row.tool} -> error ${code}: ${message}`);
      }
    }

    await new Promise((r) => setTimeout(r, POLL_MS));
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
