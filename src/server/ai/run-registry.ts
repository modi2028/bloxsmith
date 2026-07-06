import "server-only";

/**
 * Live agent runs, keyed by user id (one concurrent run per user). Generation
 * is detached from the HTTP connection — closing the tab no longer kills a
 * build — so stopping is an explicit act: the Stop button calls
 * /api/chat/stop, which aborts the controller registered here.
 * In-process state, like the rate limiter (single-node deployment).
 */
const controllers = new Map<string, AbortController>();

export function registerRun(userId: string): AbortController {
  const controller = new AbortController();
  controllers.set(userId, controller);
  return controller;
}

export function unregisterRun(userId: string, controller: AbortController) {
  if (controllers.get(userId) === controller) controllers.delete(userId);
}

/** Abort the user's active run. Returns false when nothing is running. */
export function abortRun(userId: string): boolean {
  const controller = controllers.get(userId);
  if (!controller) return false;
  controller.abort();
  return true;
}
