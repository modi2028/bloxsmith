import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, sep } from "node:path";

/**
 * Every route under /api/admin must prove the caller is an admin.
 *
 * This is the failure that does not announce itself: an unguarded admin route
 * behaves perfectly for the admin who wrote it and is a hole for everyone
 * else. The check is a file scan rather than a runtime test because the thing
 * worth pinning is that a NEW route cannot be added without a guard — and a
 * new route is exactly what a runtime test would not know to call.
 */
const ADMIN_API = join(process.cwd(), "src/app/api/admin");
const GUARDS = /getAdminForApi|getSuperAdminForApi/;
const HANDLER = /export\s+async\s+function\s+(GET|POST|PATCH|PUT|DELETE)\b/g;

function routeFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...routeFiles(full));
    else if (entry === "route.ts") out.push(full);
  }
  return out;
}

describe("admin API authorization", () => {
  const files = routeFiles(ADMIN_API);

  it("finds admin routes to check", () => {
    assert.ok(files.length > 0, "no admin routes found — has the path moved?");
  });

  for (const file of files) {
    const rel = file.slice(file.indexOf("src")).split(sep).join("/");
    const src = readFileSync(file, "utf8");

    it(`${rel} guards every handler`, () => {
      const handlers = [...src.matchAll(HANDLER)].map((m) => m[1]);
      assert.ok(handlers.length > 0, "route file exports no handler");
      assert.ok(
        GUARDS.test(src),
        `no admin guard — every handler in an /api/admin route must call getAdminForApi or getSuperAdminForApi`,
      );
      // One guard call per handler, at minimum: a file with two handlers and
      // a single guard has an unguarded one.
      const guardCalls = (src.match(new RegExp(GUARDS.source, "g")) ?? []).length;
      assert.ok(
        guardCalls >= handlers.length,
        `${handlers.length} handler(s) but only ${guardCalls} guard reference(s) — one of ${handlers.join(", ")} may be unguarded`,
      );
    });
  }
});
