"use client";

import { useCallback, useEffect, useState } from "react";
import { formatCredits } from "@/lib/credits-format";

type AdminUser = {
  id: string;
  username: string;
  displayName: string | null;
  robloxUserId: number;
  role: "user" | "admin" | "super_admin";
  plan: "free" | "pro" | "max";
  proExpiresAt: string | null;
  disabled: boolean;
  bannedModels: string[];
  balance: number;
};

async function act(body: unknown): Promise<string | null> {
  const res = await fetch("/api/admin/users", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (res.ok) return null;
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  return data.error ?? "Action failed";
}

export function AdminUsers({
  viewerIsSuper = false,
  modelIds = [],
}: {
  /** Super admins can additionally promote/demote admins. */
  viewerIsSuper?: boolean;
  /** Enabled model ids, shown as hints in the model-ban prompt. */
  modelIds?: string[];
}) {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchUsers = async (query: string): Promise<AdminUser[]> => {
    const res = await fetch(
      `/api/admin/users${query ? `?q=${encodeURIComponent(query)}` : ""}`,
    );
    const data = (await res.json().catch(() => ({ users: [] }))) as {
      users: AdminUser[];
    };
    return data.users ?? [];
  };

  const load = useCallback(async (query: string) => {
    setLoading(true);
    setUsers(await fetchUsers(query));
    setLoading(false);
  }, []);

  // Initial load — state is only touched after the fetch resolves, so this
  // doesn't set state synchronously inside the effect.
  useEffect(() => {
    let cancelled = false;
    fetchUsers("").then((list) => {
      if (cancelled) return;
      setUsers(list);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const run = async (id: string, body: unknown) => {
    setBusyId(id);
    setError(null);
    const err = await act(body);
    if (err) setError(err);
    await load(q);
    setBusyId(null);
  };

  const adjustCredits = (u: AdminUser) => {
    const input = window.prompt(
      `Adjust credits for @${u.username} (current ${formatCredits(u.balance)}). Decimals allowed; use a negative number to subtract:`,
      "5",
    );
    if (input == null) return;
    const delta = Number(input);
    if (!Number.isFinite(delta) || delta === 0) {
      setError("Enter a non-zero number.");
      return;
    }
    void run(u.id, { action: "credits", userId: u.id, delta });
  };

  const setPlan = (u: AdminUser, plan: "free" | "pro" | "max") => {
    if (plan === "free") {
      void run(u.id, { action: "plan", userId: u.id, plan: "free" });
      return;
    }
    const label = plan === "max" ? "Max" : "Pro";
    const input = window.prompt(
      `Grant ${label} to @${u.username} for how many days? Leave blank for permanent.`,
      "30",
    );
    if (input === null) return;
    const days = input.trim() === "" ? undefined : Number(input);
    if (days !== undefined && (!Number.isInteger(days) || days <= 0)) {
      setError("Enter a positive number of days, or leave blank.");
      return;
    }
    void run(u.id, { action: "plan", userId: u.id, plan, days });
  };

  const editModelBans = (u: AdminUser) => {
    const input = window.prompt(
      `Model ids @${u.username} is BANNED from, comma-separated (empty = no bans).\nAvailable: ${modelIds.join(", ") || "—"}`,
      u.bannedModels.join(", "),
    );
    if (input == null) return;
    const models = input
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    void run(u.id, { action: "modelBans", userId: u.id, models });
  };

  const setRole = (u: AdminUser, role: "admin" | "user") => {
    if (
      !window.confirm(
        role === "admin"
          ? `Make @${u.username} an admin? They also need their Roblox id (${u.robloxUserId}) added to ADMIN_ROBLOX_USER_IDS in Railway to get in.`
          : `Remove admin from @${u.username}?`,
      )
    )
      return;
    void run(u.id, { action: "role", userId: u.id, role });
  };

  const toggleBan = (u: AdminUser) => {
    if (
      !window.confirm(
        `${u.disabled ? "Unban" : "Ban"} @${u.username}? ${
          u.disabled ? "" : "This signs them out and revokes their plugin."
        }`,
      )
    )
      return;
    void run(u.id, { action: "ban", userId: u.id, banned: !u.disabled });
  };

  return (
    <div>
      <div className="mb-3 flex gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && load(q)}
          placeholder="Search username or Roblox id…"
          className="min-w-0 flex-1 rounded-lg border border-line-strong bg-surface px-3.5 py-2 text-sm placeholder:text-faint focus:border-ember/60 focus:outline-none"
        />
        <button
          type="button"
          onClick={() => load(q)}
          className="rounded-lg border border-line-strong bg-surface px-4 py-2 text-sm transition hover:border-ember/60"
        >
          Search
        </button>
      </div>
      {error && <p className="mb-3 text-sm text-red-400">{error}</p>}

      <div className="overflow-x-auto rounded-xl border border-line">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-line bg-surface/60 text-xs text-muted">
            <tr>
              <th className="px-3 py-2 font-medium">User</th>
              <th className="px-3 py-2 font-medium">Plan</th>
              <th className="px-3 py-2 font-medium">Credits</th>
              <th className="px-3 py-2 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={4} className="px-3 py-6 text-center text-muted">
                  Loading…
                </td>
              </tr>
            ) : users.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-3 py-6 text-center text-muted">
                  No users found.
                </td>
              </tr>
            ) : (
              users.map((u) => (
                <tr
                  key={u.id}
                  className={`border-b border-line/60 ${u.disabled ? "opacity-50" : ""}`}
                >
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">@{u.username}</span>
                      {u.role === "super_admin" && (
                        <span className="rounded-full border border-ember/50 px-1.5 py-px text-[10px] font-semibold uppercase text-ember">
                          super admin
                        </span>
                      )}
                      {u.role === "admin" && (
                        <span className="rounded-full border border-line px-1.5 py-px text-[10px] uppercase text-faint">
                          admin
                        </span>
                      )}
                      {u.bannedModels.length > 0 && (
                        <span
                          className="rounded-full border border-red-900/60 px-1.5 py-px text-[10px] uppercase text-red-400"
                          title={`Banned from: ${u.bannedModels.join(", ")}`}
                        >
                          {u.bannedModels.length} model ban
                          {u.bannedModels.length > 1 ? "s" : ""}
                        </span>
                      )}
                      {u.disabled && (
                        <span className="rounded-full border border-red-900/60 px-1.5 py-px text-[10px] uppercase text-red-400">
                          banned
                        </span>
                      )}
                    </div>
                    <span className="text-xs text-faint">
                      id {u.robloxUserId}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    {u.plan === "max" ? (
                      <span className="titanium font-semibold">Max</span>
                    ) : (
                      <span
                        className={
                          u.plan === "pro" ? "text-ember" : "text-muted"
                        }
                      >
                        {u.plan === "pro" ? "Pro" : "Free"}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 tabular-nums">
                    {formatCredits(u.balance)}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-1.5">
                      <button
                        type="button"
                        disabled={busyId === u.id}
                        onClick={() => adjustCredits(u)}
                        className="rounded border border-line px-2 py-1 text-xs transition hover:border-ember/60 disabled:opacity-40"
                      >
                        ± Credits
                      </button>
                      {u.plan !== "pro" && (
                        <button
                          type="button"
                          disabled={busyId === u.id}
                          onClick={() => setPlan(u, "pro")}
                          className="rounded border border-line px-2 py-1 text-xs transition hover:border-ember/60 disabled:opacity-40"
                        >
                          Give Pro
                        </button>
                      )}
                      {u.plan !== "max" && (
                        <button
                          type="button"
                          disabled={busyId === u.id}
                          onClick={() => setPlan(u, "max")}
                          className="rounded border border-line px-2 py-1 text-xs transition hover:border-ember/60 disabled:opacity-40"
                        >
                          Give Max
                        </button>
                      )}
                      {u.plan !== "free" && (
                        <button
                          type="button"
                          disabled={busyId === u.id}
                          onClick={() => setPlan(u, "free")}
                          className="rounded border border-line px-2 py-1 text-xs transition hover:border-red-500/60 disabled:opacity-40"
                        >
                          Remove plan
                        </button>
                      )}
                      <button
                        type="button"
                        disabled={busyId === u.id}
                        onClick={() => editModelBans(u)}
                        className="rounded border border-line px-2 py-1 text-xs transition hover:border-ember/60 disabled:opacity-40"
                      >
                        Model bans
                      </button>
                      <a
                        href={`/admin/users/${u.id}`}
                        className="rounded border border-line px-2 py-1 text-xs transition hover:border-ember/60"
                      >
                        Chats
                      </a>
                      {viewerIsSuper && u.role !== "super_admin" && (
                        <button
                          type="button"
                          disabled={busyId === u.id}
                          onClick={() =>
                            setRole(u, u.role === "admin" ? "user" : "admin")
                          }
                          className="rounded border border-ember/40 px-2 py-1 text-xs text-ember transition hover:bg-ember-soft disabled:opacity-40"
                        >
                          {u.role === "admin" ? "Remove admin" : "Make admin"}
                        </button>
                      )}
                      {u.role !== "super_admin" && (
                        <button
                          type="button"
                          disabled={busyId === u.id}
                          onClick={() => toggleBan(u)}
                          className={`rounded border px-2 py-1 text-xs transition disabled:opacity-40 ${
                            u.disabled
                              ? "border-line hover:border-ember/60"
                              : "border-red-900/60 text-red-400 hover:bg-red-950/30"
                          }`}
                        >
                          {u.disabled ? "Unban" : "Ban"}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
