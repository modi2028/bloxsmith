import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getSuperAdminForApi } from "@/server/auth/admin";
import { generateToken } from "@/server/crypto";
import { env } from "@/server/env";
import {
  MAIL_SLOTS,
  ZOHO_SCOPES,
  rememberConnect,
  zohoConfig,
} from "@/server/mail/zoho";

/**
 * GET /api/admin/mail/connect?slot=support|management
 * Super admin only: starts the one-time Zoho OAuth flow that connects a
 * mailbox to the webmail. Admins using the webmail afterwards never touch
 * Zoho credentials.
 */
export async function GET(request: NextRequest) {
  const superAdmin = await getSuperAdminForApi();
  if (!superAdmin) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const cfg = zohoConfig();
  if (!cfg.configured) {
    return Response.json(
      {
        error:
          "Zoho isn't configured — set ZOHO_CLIENT_ID and ZOHO_CLIENT_SECRET first.",
      },
      { status: 400 },
    );
  }

  const slot = request.nextUrl.searchParams.get("slot") ?? "";
  if (!MAIL_SLOTS[slot]) {
    return Response.json({ error: "Unknown mailbox slot" }, { status: 400 });
  }

  const state = generateToken(24);
  rememberConnect(state, slot, superAdmin.id);

  const url = new URL(`${cfg.accountsBase}/oauth/v2/auth`);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", cfg.clientId!);
  url.searchParams.set("scope", ZOHO_SCOPES);
  url.searchParams.set(
    "redirect_uri",
    new URL("/api/admin/mail/callback", env.APP_URL).toString(),
  );
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("state", state);
  return NextResponse.redirect(url);
}
