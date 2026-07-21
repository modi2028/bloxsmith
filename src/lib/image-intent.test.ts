import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { looksLikeImageRequest, parseImageCommand } from "./image-intent";

describe("image intent detection", () => {
  it("catches plain-language picture requests", () => {
    for (const text of [
      "make me a thumbnail for my obby",
      "can you make a picture of a dragon",
      "generate a logo for my game",
      "I want a poster of a haunted mansion",
      "draw artwork of a neon city",
      "give me an icon for the shop",
      "design a banner with a volcano",
    ]) {
      assert.equal(looksLikeImageRequest(text), true, text);
    }
  });

  it("never hijacks a build request", () => {
    for (const text of [
      // Studio words veto, even with an image noun present.
      "add an ImageLabel to the shop gui",
      "make a thumbnail system for my game",
      "create a part that shows a picture",
      "build me a thumbnail viewer",
      "write a script that loads an image",
      "insert a decal with my logo on it",
      "make a leaderboard",
      "add a spawn point",
      // No image noun at all.
      "make me an obby",
      "create a round system with a timer",
    ]) {
      assert.equal(looksLikeImageRequest(text), false, text);
    }
  });

  it("ignores empty and very long messages", () => {
    assert.equal(looksLikeImageRequest("   "), false);
    assert.equal(
      looksLikeImageRequest("make me a thumbnail " + "x".repeat(500)),
      false,
    );
  });

  it("parses the /image command and its aliases", () => {
    assert.equal(parseImageCommand("/image a neon tower"), "a neon tower");
    assert.equal(parseImageCommand("/img  a red car "), "a red car");
    assert.equal(parseImageCommand("/pic a sunset"), "a sunset");
    assert.equal(parseImageCommand("image of a tower"), null);
    assert.equal(parseImageCommand("/image"), null);
  });
});
