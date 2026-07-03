"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function SettingsForm({
  initialNickname,
}: {
  initialNickname: string | null;
}) {
  const [nickname, setNickname] = useState(initialNickname ?? "");
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">(
    "idle",
  );
  const router = useRouter();

  const save = async () => {
    setState("saving");
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nickname }),
      });
      if (!res.ok) throw new Error();
      setState("saved");
      router.refresh();
      setTimeout(() => setState("idle"), 2000);
    } catch {
      setState("error");
    }
  };

  return (
    <div className="rounded-2xl border border-line bg-surface-raised p-5">
      <label
        htmlFor="nickname"
        className="mb-1.5 block text-sm font-medium text-foreground"
      >
        What should the AI call you?
      </label>
      <p className="mb-3 text-xs text-muted">
        Used in greetings and by the AI while building with you. Leave empty to
        use your Roblox display name.
      </p>
      <div className="flex gap-2">
        <input
          id="nickname"
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
          maxLength={40}
          placeholder="e.g. Birk"
          className="min-w-0 flex-1 rounded-lg border border-line-strong bg-surface px-3.5 py-2 text-sm placeholder:text-faint focus:border-ember/60 focus:outline-none"
        />
        <button
          type="button"
          onClick={save}
          disabled={state === "saving"}
          className="rounded-lg bg-gradient-to-br from-ember to-ember-strong px-4 py-2 text-sm font-semibold text-stone-950 transition hover:brightness-110 disabled:opacity-50"
        >
          {state === "saving" ? "Saving…" : state === "saved" ? "Saved ✓" : "Save"}
        </button>
      </div>
      {state === "error" && (
        <p className="mt-2 text-xs text-red-400">
          Could not save — try again.
        </p>
      )}
    </div>
  );
}
