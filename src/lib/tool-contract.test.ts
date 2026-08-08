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

// --- build_model ------------------------------------------------------------

describe("build_model", () => {

const onePart = {
  name: "Trunk",
  size: [2, 10, 2],
  position: [0, 5, 0],
};

it("build_model accepts a minimal model", () => {
  const r = validateToolArgs("build_model", {
    name: "Tree",
    parent: "ref:workspace",
    parts: [onePart],
  });
  assert.equal(r.ok, true);
});

it("build_model defaults nothing it cannot default — size and position are required", () => {
  for (const missing of ["size", "position", "name"]) {
    const part: Record<string, unknown> = { ...onePart };
    delete part[missing];
    const r = validateToolArgs("build_model", {
      name: "Tree",
      parent: "ref:workspace",
      parts: [part],
    });
    assert.equal(r.ok, false, `${missing} should be required`);
  }
});

it("build_model rejects a vector given as anything but three numbers", () => {
  for (const bad of [[1, 2], [1, 2, 3, 4], "1,2,3", [1, 2, "3"]]) {
    const r = validateToolArgs("build_model", {
      name: "Tree",
      parent: "ref:workspace",
      parts: [{ ...onePart, position: bad }],
    });
    assert.equal(r.ok, false, `${JSON.stringify(bad)} should be rejected`);
  }
});

it("build_model catches a geometric property passed as a string", () => {
  const r = validateToolArgs("build_model", {
    name: "Tree",
    parent: "ref:workspace",
    parts: [{ ...onePart, properties: { CFrame: "0,0,0" } }],
  });
  assert.equal(r.ok, false);
  // Naming the part matters: the model has to know WHICH of sixty parts.
  assert.match(r.ok === false ? r.error : "", /Trunk/);
});

it("build_model is capped so one call cannot run away", () => {
  const parts = Array.from({ length: 151 }, (_, i) => ({
    ...onePart,
    name: `P${i}`,
  }));
  const r = validateToolArgs("build_model", {
    name: "Tree",
    parent: "ref:workspace",
    parts,
  });
  assert.equal(r.ok, false);
});

it("build_model accepts csg steps and rejects unknown actions", () => {
  const base = { name: "House", parent: "ref:workspace", parts: [onePart] };
  assert.equal(
    validateToolArgs("build_model", {
      ...base,
      csg: [{ action: "subtract", base: "Trunk", parts: ["Hole"] }],
    }).ok,
    true,
  );
  assert.equal(
    validateToolArgs("build_model", {
      ...base,
      csg: [{ action: "intersect", parts: ["Hole"] }],
    }).ok,
    false,
  );
});

it("build_model rejects colour channels outside 0-1", () => {
  const r = validateToolArgs("build_model", {
    name: "Tree",
    parent: "ref:workspace",
    parts: [{ ...onePart, color: [255, 0, 0] }],
  });
  assert.equal(r.ok, false);
});
});

describe("generate_model", () => {
  it("accepts a bare prompt", () => {
    assert.equal(
      validateToolArgs("generate_model", { prompt: "stone gargoyle statue" }).ok,
      true,
    );
  });

  it("only allows the two schemas Roblox actually ships", () => {
    for (const schema of ["Body1", "Car5"]) {
      assert.equal(
        validateToolArgs("generate_model", { prompt: "a car", schema }).ok,
        true,
      );
    }
    // A hallucinated schema would fail inside Studio seconds later with a
    // useless message; reject it here instead.
    assert.equal(
      validateToolArgs("generate_model", { prompt: "a car", schema: "Car4" }).ok,
      false,
    );
  });

  it("rejects a position that is not three numbers", () => {
    assert.equal(
      validateToolArgs("generate_model", {
        prompt: "a car",
        position: [0, 5],
      }).ok,
      false,
    );
  });
});
