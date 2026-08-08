import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { looksLikeMeshRequest } from "./mesh-intent";

describe("looksLikeMeshRequest", () => {
  it("catches the request that started this — a sword mesh", () => {
    // Sol hand-built this out of parts because the prompt said not to
    // generate "anything build_model can make". A sword is such a thing.
    assert.equal(looksLikeMeshRequest("make me a sword mesh"), true);
  });

  it("catches the ways people ask for one", () => {
    for (const t of [
      "can you make a 3d model of a dragon",
      "generate a castle",
      "I want a mesh of a car",
      "AI generate a gargoyle statue",
      "use cube 3d to make a tree",
      "make a 3D object for the centrepiece",
      "generate me a sword",
    ]) {
      assert.equal(looksLikeMeshRequest(t), true, t);
    }
  });

  it("leaves ordinary build requests alone", () => {
    for (const t of [
      "build me an obby",
      "make a shop with a buy button",
      "add a sword tool to StarterPack",
      "make the baseplate bigger",
      "give me a leaderboard",
    ]) {
      assert.equal(looksLikeMeshRequest(t), false, t);
    }
  });

  it("does not fire when they are working on a mesh that already exists", () => {
    // A generation is slow and rate-limited; spending one on someone who
    // wanted an edit is worse than missing the hint.
    for (const t of [
      "resize the mesh I already have",
      "script the mesh so it spins",
      "change the texture on that mesh",
      "delete the 3d model in workspace",
      "import a mesh I uploaded",
    ]) {
      assert.equal(looksLikeMeshRequest(t), false, t);
    }
  });

  it("ignores a long brief, which is a build not a one-shot generation", () => {
    assert.equal(
      looksLikeMeshRequest(`generate a sword ${"and lots more detail ".repeat(30)}`),
      false,
    );
  });
});
