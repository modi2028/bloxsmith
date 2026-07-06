import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getSuperAdminForApi, auditAdmin } from "@/server/auth/admin";
import { env } from "@/server/env";
import {
  MAIL_SLOTS,
  exchangeCode,
  findZohoAccount,
  saveMailAccount,
  takeConnect,
} from "@/server/mail/zoho";

function back(param: string) {
  const url = new URL("/admin/mail", env.APP_URL);
  const [k, v] = param.split("=");
  url.searchParams.set(k!, v ?? "1");
  return NextResponse.redirect(url);
}

/** GET /api/admin/mail/callback — Zoho OAuth redirect target. */
export async function GET(request: NextRequest) {
  const superAdmin = await getSuperAdminForApi();
  if (!superAdmin) return back("mail_error=forbidden");

  const params = request.nextUrl.searchParams;
  const code = params.get("code");
  const state = params.get("state");
  if (!code || !state) return back("mail_error=invalid_response");

  const pending = takeConnect(state);
  const slot = pending ? MAIL_SLOTS[pending.slot] : undefined;
  if (!pending || !slot || pending.userId !== superAdmin.id) {
    return back("mail_error=expired");
  }

  try {
    const { accessToken, refreshToken } = await exchangeCode(
      code,
      new URL("/api/admin/mail/callback", env.APP_URL).toString(),
    );
    const zohoAccountId = await findZohoAccount(accessToken, slot.address);
    await saveMailAccount({
      address: slot.address,
      zohoAccountId,
      refreshToken,
      minRole: slot.minRole,
    });
    await auditAdmin({
      actorUserId: superAdmin.id,
      action: "mail.connect",
      targetType: "mailbox",
      targetId: slot.address,
    });
    return back("connected=1");
  } catch (err) {
    console.error("Zoho connect failed:", err);
    return back("mail_error=connect_failed");
  }
}
