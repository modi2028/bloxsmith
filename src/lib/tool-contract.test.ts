import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { toolArgSchemas, validateToolArgs } from "./tool-contract";

/**
 * Every tool offered to a model must have a contract schema. A tool that is
 * advertised but missing here is rejected at call time as "Unknown tool",
 * which the model relays to the user as the feature being unavailable — a
 * failure that looks like a product bug, not a validation one. web_search
 * shipped that way once.
 *
 * tools.ts is server-only, so it can't be imported here; the names are read
 * from source instead.
 */
describe("tool contract covers every advertised tool", () => {
  const source = readFileSync(
    join(process.cwd(), "src/server/ai/tools.ts"),
    "utf8",
  );
  const advertised = [...source.matchAll(/^\s*name:\s*"([a-z_]+)"/gm)].map(
    (m) => m[1]!,
  );

  it("found the tool definitions", () => {
    // Guards the regex itself: if it silently matched nothing, this suite
    // would pass while checking absolutely nothing.
    assert.ok(
      advertised.length >= 8,
      `only found ${advertised.length} tools in tools.ts — has the file moved?`,
    );
  });

  it("has a schema for each", () => {
    for (const name of advertised) {
      assert.ok(
        name in toolArgSchemas,
        `"${name}" is offered to models but has no schema in toolArgSchemas`,
      );
    }
  });

  it("accepts a well-formed web_search call", () => {
    const ok = validateToolArgs("web_search", { query: "neon city", limit: 5 });
    assert.equal(ok.ok, true);
  });

  it("rejects a malformed web_search call", () => {
    assert.equal(validateToolArgs("web_search", {}).ok, false);
    assert.equal(
      validateToolArgs("web_search", { query: "x", limit: 99 }).ok,
      false,
    );
  });
});
