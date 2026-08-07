import { redirect } from "next/navigation";
import { BRAND } from "@/lib/brand";
import { getSessionUser } from "@/server/auth/session";
import { LoginScreen } from "@/components/landing/LoginScreen";

export const metadata = {
  title: `Sign in — ${BRAND.name}`,
  description: `Sign in to ${BRAND.name} with your Roblox account.`,
};

/**
 * A real sign-in page.
 *
 * Previously "logging in" was a bare redirect route with no page behind it,
 * so there was nothing to design — the OAuth hand-off happened from a button
 * on the landing page. This gives it a surface of its own, and somewhere to
 * land back on when sign-in fails.
 */
export default async function LoginPage() {
  // Already signed in? There is nothing here for you.
  const user = await getSessionUser();
  if (user) redirect("/");

  return <LoginScreen />;
}
