/**
 * Integration test for the chat->Studio bridge (no AI involved).
 * Run `npm run mock:plugin` in another terminal first, then:
 *   npx tsx scripts/test-bridge.ts
 *
 * Enqueues real tool calls through Postgres and asserts the mock plugin
 * answers them with the expected shapes, including the error path.
 */
import { eq } from "drizzle-orm";
import { createStandaloneDb } from "../src/server/db/standalone";
import * as schema from "../src/server/db/schema";
import {
  awaitToolResult,
  enqueueToolCall,
} from "../src/server/bridge/queue-core";

async function main() {
  const { db, close } = createStandaloneDb();
  let failures = 0;

  const user = await db.query.users.findFirst();
  if (!user) throw new Error("No user in the database — sign in once first.");

  const [session] = await db
    .insert(schema.chatSessions)
    .values({ userId: user.id, title: "[bridge test]" })
    .returning();
  const [req] = await db
    .insert(schema.aiRequests)
    .values({ sessionId: session.id, userId: user.id, modelId: "bridge-test" })
    .returning();

  const call = async (
    tool: string,
    args: Record<string, unknown>,
    expectOk: boolean,
    check?: (value: unknown) => boolean,
  ) => {
    const id = await enqueueToolCall(db, {
      aiRequestId: req.id,
      sessionId: session.id,
      userId: user.id,
      tool,
      args,
      deadlineMs: 15_000,
    });
    const result = await awaitToolResult(db, id);
    const okMatches = result.ok === expectOk;
    const checkPasses = !check || (result.ok && check(result.value));
    const pass = okMatches && checkPasses;
    if (!pass) failures++;
    console.log(
      `${pass ? "PASS" : "FAIL"}  ${tool}  ->  ${JSON.stringify(result).slice(0, 140)}`,
    );
    return result;
  };

  console.log(`Testing bridge as user @${user.username} …\n`);

  await call(
    "list_children",
    { parent: "ref:workspace" },
    true,
    (v) => Array.isArray((v as { items?: unknown[] }).items) &&
      (v as { items: unknown[] }).items.length >= 2, // Baseplate + SpawnLocation
  );
  const created = await call(
    "create_instance",
    { className: "Part", parent: "ref:workspace", name: "BridgeTestPart" },
    true,
    (v) => typeof (v as { ref?: string }).ref === "string",
  );
  if (created.ok) {
    const ref = (created.value as { ref: string }).ref;
    await call(
      "set_property",
      { target: ref, name: "Anchored", value: true },
      true,
    );
    await call("delete_instance", { target: ref }, true);
  }
  await call(
    "write_script",
    {
      parent: "ref:server_script_service",
      name: "BridgeTest",
      scriptType: "Script",
      source: 'print("hello from the bridge test")',
    },
    true,
    (v) => (v as { lineCount?: number }).lineCount === 1,
  );
  // Error path: unknown ref must come back as a structured not_found error.
  await call("get_properties", { target: "ref:i_doesnotexist" }, false);

  // Cleanup — cascades to ai_requests and tool_call_queue rows.
  await db
    .delete(schema.chatSessions)
    .where(eq(schema.chatSessions.id, session.id));
  await close();

  console.log(failures === 0 ? "\nAll bridge tests passed." : `\n${failures} FAILURES`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
