/**
 * Effective Pro status. Admins always have Pro. A Pro plan with no expiry is
 * permanent; with an expiry it's active until that instant.
 *
 * Pass `now` explicitly from server components (calling Date.now() during a
 * React render violates the purity rule); the loop passes new Date().
 */
export function isProUser(
  user: { role: string; plan: string; proExpiresAt: Date | null },
  now: Date,
): boolean {
  if (user.role === "admin") return true;
  if (user.plan !== "pro") return false;
  return user.proExpiresAt == null || user.proExpiresAt.getTime() > now.getTime();
}
