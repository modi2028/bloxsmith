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

describe("double-encoded property wrappers", () => {
  it("repairs the exact failure seen in Studio: Material as a JSON string", () => {
    const r = validateToolArgs("set_property", {
      target: "ref:i_abc",
      name: "Material",
      value: '{"$type": "Enum", "enum": "Material", "item": "Neon"}',
    });
    assert.equal(r.ok, true);
    assert.deepEqual(r.ok === true ? r.args.value : null, {
      $type: "Enum",
      enum: "Material",
      item: "Neon",
    });
  });

  it("repairs them inside create_instance properties", () => {
    const r = validateToolArgs("create_instance", {
      className: "Part",
      parent: "ref:workspace",
      properties: {
        Size: '{"$type":"Vector3","value":[1,2,3]}',
        Name: "Blade",
      },
    });
    assert.equal(r.ok, true);
    const props = r.ok === true
      ? (r.args.properties as Record<string, unknown>)
      : {};
    assert.deepEqual(props.Size, { $type: "Vector3", value: [1, 2, 3] });
    // A property that really is a string must come through untouched.
    assert.equal(props.Name, "Blade");
  });

  it("repairs them deep inside a build_model parts array", () => {
    const r = validateToolArgs("build_model", {
      name: "Sword",
      parent: "ref:workspace",
      parts: [
        {
          name: "Blade",
          size: [1, 8, 0.2],
          position: [0, 4, 0],
          properties: {
            Material: '{"$type":"Enum","enum":"Material","item":"Metal"}',
          },
        },
      ],
    });
    assert.equal(r.ok, true);
    const parts = r.ok === true
      ? (r.args.parts as { properties: Record<string, unknown> }[])
      : [];
    assert.deepEqual(parts[0]!.properties.Material, {
      $type: "Enum",
      enum: "Material",
      item: "Metal",
    });
  });

  it("leaves ordinary strings and near-misses alone", () => {
    for (const value of [
      "Neon",
      "{not json at all",
      '{"type":"Enum"}',
      '{"$typo":"Enum"}',
      "",
    ]) {
      const r = validateToolArgs("set_property", {
        target: "ref:i_abc",
        name: "Text",
        value,
      });
      assert.equal(r.ok, true, JSON.stringify(value));
      assert.equal(r.ok === true ? r.args.value : null, value);
    }
  });

  it("still catches a geometric property that is a plain string", () => {
    // The repair must not accidentally launder the mistake the existing
    // guard exists to catch.
    const r = validateToolArgs("set_property", {
      target: "ref:i_abc",
      name: "Position",
      value: "0, 5, 0",
    });
    assert.equal(r.ok, false);
  });
});

describe("generate_ugc / build_ugc", () => {
  it("accepts a bare subject", () => {
    assert.equal(
      validateToolArgs("generate_ugc", { subject: "weathered stone gargoyle" })
        .ok,
      true,
    );
  });

  it("holds polycount to what the transport and Roblox can carry", () => {
    // Out of range is a 400 from Meshy a minute later; catch it here.
    assert.equal(
      validateToolArgs("generate_ugc", { subject: "a chest", polycount: 8000 })
        .ok,
      true,
    );
    // 50k is OUR ceiling, not Meshy's: the geometry crosses the wire as JSON
    // and a colour per vertex makes 300k about 13MB. Pin the boundary, not
    // just some number far past it.
    assert.equal(
      validateToolArgs("generate_ugc", { subject: "a chest", polycount: 50_000 })
        .ok,
      true,
    );
    for (const polycount of [99, 50_001, 300_000, 5000.5]) {
      assert.equal(
        validateToolArgs("generate_ugc", { subject: "a chest", polycount }).ok,
        false,
        String(polycount),
      );
    }
  });

  it("build_ugc requires well-formed geometry", () => {
    const ok = validateToolArgs("build_ugc", {
      name: "Gargoyle",
      vertices: [[0, 0, 0], [1, 0, 0], [0, 1, 0]],
      triangles: [[0, 1, 2]],
    });
    assert.equal(ok.ok, true);

    // A vertex that is not three numbers, or a negative index, would reach
    // AddVertex/AddTriangle in Studio and take the whole build down.
    assert.equal(
      validateToolArgs("build_ugc", {
        name: "X",
        vertices: [[0, 0]],
        triangles: [[0, 1, 2]],
      }).ok,
      false,
    );
    assert.equal(
      validateToolArgs("build_ugc", {
        name: "X",
        vertices: [[0, 0, 0]],
        triangles: [[-1, 0, 1]],
      }).ok,
      false,
    );
  });
});
