import "server-only";
import { randomUUID } from "node:crypto";

/**
 * One-click consent for Creator Store insertions. The agent loop pauses on
 * the FIRST use of an asset id in a project and waits for the user to Allow
 * or Deny in the chat; one approval covers every later copy of that asset in
 * the same project. In-memory, like the run registry (single-node).
 */

const approvedBySession = new Map<string, Set<number>>();

type Pending = {
  userId: string;
  sessionId: string;
  assetId: number;
  resolve: (approved: boolean) => void;
  timer: ReturnType<typeof setTimeout>;
};
const pending = new Map<string, Pending>();

const APPROVAL_TIMEOUT_MS = 5 * 60_000;

export function isAssetApproved(sessionId: string, assetId: number): boolean {
  return approvedBySession.get(sessionId)?.has(assetId) ?? false;
}

export function markAssetApproved(sessionId: string, assetId: number) {
  let set = approvedBySession.get(sessionId);
  if (!set) {
    set = new Set();
    approvedBySession.set(sessionId, set);
  }
  set.add(assetId);
}

/**
 * Register a pending approval and wait for the user's answer (or timeout /
 * run abort — both count as a decline).
 */
export function waitForAssetApproval(params: {
  userId: string;
  sessionId: string;
  assetId: number;
  signal?: AbortSignal;
}): { approvalId: string; promise: Promise<boolean> } {
  const approvalId = randomUUID();
  const promise = new Promise<boolean>((resolve) => {
    const finish = (approved: boolean) => {
      const entry = pending.get(approvalId);
      if (!entry) return;
      clearTimeout(entry.timer);
      pending.delete(approvalId);
      resolve(approved);
    };
    const timer = setTimeout(() => finish(false), APPROVAL_TIMEOUT_MS);
    pending.set(approvalId, {
      userId: params.userId,
      sessionId: params.sessionId,
      assetId: params.assetId,
      resolve: finish,
      timer,
    });
    params.signal?.addEventListener("abort", () => finish(false), {
      once: true,
    });
  });
  return { approvalId, promise };
}

/** Resolve a pending approval; only the owning user can answer. */
export function resolveAssetApproval(
  approvalId: string,
  userId: string,
  approved: boolean,
): boolean {
  const entry = pending.get(approvalId);
  if (!entry || entry.userId !== userId) return false;
  if (approved) markAssetApproved(entry.sessionId, entry.assetId);
  entry.resolve(approved);
  return true;
}
