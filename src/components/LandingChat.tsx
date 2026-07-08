"use client";

import { useState } from "react";
import { ChatComposer } from "./ChatComposer";
import type { ChatModel } from "./ModelPicker";

const SUGGESTIONS = [
  "Make a combat system",
  "Make a plot system",
  "Make a round system",
];

/**
 * The real chat composer on the landing page. Visitors can type, pick a
 * model, and press send; sending takes them to Roblox sign-in.
 */
export function LandingChat({ models }: { models: ChatModel[] }) {
  const [seed, setSeed] = useState<string>();
  const [modelId, setModelId] = useState(
    () =>
      models.find((m) => m.isDefault && !m.locked)?.id ??
      models.find((m) => !m.locked)?.id ??
      models[0]?.id ??
      "",
  );

  return (
    <div className="mx-auto w-full max-w-2xl text-left">
      <ChatComposer
        key={seed ?? "blank"}
        onSend={() => {
          window.location.href = "/api/auth/roblox/login";
        }}
        busy={false}
        models={models}
        modelId={modelId}
        onModelChange={setModelId}
        initialText={seed}
      />
      <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
        {SUGGESTIONS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setSeed(s)}
            className="glass-chip rounded-full border border-white/10 px-4 py-1.5 text-[13px] text-muted transition hover:border-ember/50 hover:text-foreground"
          >
            {s}
          </button>
        ))}
      </div>
      <p className="mt-3 text-center text-xs text-faint">
        Press send and sign in with Roblox. Your first builds are on us.
      </p>
    </div>
  );
}
