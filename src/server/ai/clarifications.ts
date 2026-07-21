import "server-only";
import { randomUUID } from "node:crypto";

/**
 * Clarifying questions. When a request is too vague to build well ("make an
 * obby"), the model asks ONE multiple-choice question and the run pauses
 * here until the user picks. In-memory, like the run registry (single-node).
 *
 * A question must never strand a build: if nobody answers within the timeout
 * the loop is told to pick the most obvious option and carry on, so the user
 * always ends up with something rather than a hung run.
 */

type Pending = {
  userId: string;
  resolve: (answer: string | null) => void;
  timer: ReturnType<typeof setTimeout>;
};

const pending = new Map<string, Pending>();

const ANSWER_TIMEOUT_MS = 10 * 60_000;

export function waitForClarification(params: {
  userId: string;
  signal?: AbortSignal;
}): { clarificationId: string; promise: Promise<string | null> } {
  const clarificationId = randomUUID();
  const promise = new Promise<string | null>((resolve) => {
    const finish = (answer: string | null) => {
      const entry = pending.get(clarificationId);
      if (!entry) return;
      clearTimeout(entry.timer);
      pending.delete(clarificationId);
      resolve(answer);
    };
    const timer = setTimeout(() => finish(null), ANSWER_TIMEOUT_MS);
    pending.set(clarificationId, {
      userId: params.userId,
      resolve: finish,
      timer,
    });
    params.signal?.addEventListener("abort", () => finish(null), {
      once: true,
    });
  });
  return { clarificationId, promise };
}

/** Answer a pending question; only the user who was asked can reply. */
export function resolveClarification(
  clarificationId: string,
  userId: string,
  answer: string,
): boolean {
  const entry = pending.get(clarificationId);
  if (!entry || entry.userId !== userId) return false;
  entry.resolve(answer);
  return true;
}
