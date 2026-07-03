import { NextResponse } from "next/server";
import { env } from "@/server/env";
import { SESSION_COOKIE, destroySession } from "@/server/auth/session";

export async function POST() {
  await destroySession();
  // 303 so the redirect after a form POST becomes a GET.
  const response = NextResponse.redirect(new URL("/", env.APP_URL), 303);
  response.cookies.delete(SESSION_COOKIE);
  return response;
}
