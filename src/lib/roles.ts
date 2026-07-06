/**
 * Role helpers, safe for client and server. Two admin tiers:
 *   admin       — credits, bans, model bans, chat review, support mailbox
 *   super_admin — everything admins can do, plus managing admins
 */
export function isAdminRole(role: string | null | undefined): boolean {
  return role === "admin" || role === "super_admin";
}

export function isSuperAdmin(role: string | null | undefined): boolean {
  return role === "super_admin";
}
