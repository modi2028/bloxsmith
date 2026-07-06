import "server-only";
import { eq } from "drizzle-orm";
import { db, schema } from "@/server/db";
import { decryptSecret, encryptSecret } from "@/server/crypto";

/**
 * Zoho Mail integration for the admin webmail. Admins never see Zoho
 * credentials — mailboxes are connected once by a super admin via OAuth, the
 * refresh token is AES-encrypted in mail_accounts, and every mailbox call is
 * proxied server-side with a short-lived access token.
 *
 * Env (optional until webmail is used):
 *   ZOHO_CLIENT_ID / ZOHO_CLIENT_SECRET — from https://api-console.zoho.com
 *     ("Server-based Applications", redirect URI <site>/api/admin/mail/callback)
 *   ZOHO_ACCOUNTS_BASE — default https://accounts.zoho.com (use .eu/.in if the
 *     Zoho org lives in another region)
 *   ZOHO_MAIL_BASE — default https://mail.zoho.com
 */

export const ZOHO_SCOPES =
  "ZohoMail.accounts.READ,ZohoMail.folders.READ,ZohoMail.messages.ALL";

export function zohoConfig() {
  const clientId = process.env.ZOHO_CLIENT_ID;
  const clientSecret = process.env.ZOHO_CLIENT_SECRET;
  return {
    clientId,
    clientSecret,
    configured: !!clientId && !!clientSecret,
    accountsBase: process.env.ZOHO_ACCOUNTS_BASE || "https://accounts.zoho.com",
    mailBase: process.env.ZOHO_MAIL_BASE || "https://mail.zoho.com",
  };
}

/** The mailbox slots the site knows about. */
export const MAIL_SLOTS: Record<
  string,
  { address: string; minRole: "admin" | "super_admin"; label: string }
> = {
  support: {
    address: "support@bloxsmith.online",
    minRole: "admin",
    label: "Support",
  },
};

// ---------------------------------------------------------------------------
// OAuth
// ---------------------------------------------------------------------------

/** Pending OAuth connects, keyed by state token (single-node, 10 min TTL). */
const pendingConnects = new Map<
  string,
  { slot: string; userId: string; expiresAt: number }
>();

export function rememberConnect(state: string, slot: string, userId: string) {
  const now = Date.now();
  for (const [k, v] of pendingConnects) {
    if (v.expiresAt < now) pendingConnects.delete(k);
  }
  pendingConnects.set(state, { slot, userId, expiresAt: now + 10 * 60_000 });
}

export function takeConnect(state: string) {
  const entry = pendingConnects.get(state);
  pendingConnects.delete(state);
  if (!entry || entry.expiresAt < Date.now()) return null;
  return entry;
}

export async function exchangeCode(
  code: string,
  redirectUri: string,
): Promise<{ accessToken: string; refreshToken: string }> {
  const cfg = zohoConfig();
  const res = await fetch(`${cfg.accountsBase}/oauth/v2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: cfg.clientId!,
      client_secret: cfg.clientSecret!,
      redirect_uri: redirectUri,
      code,
    }),
  });
  const data = (await res.json().catch(() => ({}))) as {
    access_token?: string;
    refresh_token?: string;
    error?: string;
  };
  if (!res.ok || !data.access_token || !data.refresh_token) {
    throw new Error(`Zoho token exchange failed: ${data.error ?? res.status}`);
  }
  return { accessToken: data.access_token, refreshToken: data.refresh_token };
}

// Short-lived access tokens per mailbox (Zoho tokens last ~1h).
const accessTokens = new Map<string, { token: string; expiresAt: number }>();

async function getAccessToken(
  account: typeof schema.mailAccounts.$inferSelect,
): Promise<string> {
  const cached = accessTokens.get(account.id);
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.token;

  const cfg = zohoConfig();
  const refreshToken = decryptSecret(account.refreshTokenEnc);
  const res = await fetch(`${cfg.accountsBase}/oauth/v2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: cfg.clientId!,
      client_secret: cfg.clientSecret!,
      refresh_token: refreshToken,
    }),
  });
  const data = (await res.json().catch(() => ({}))) as {
    access_token?: string;
    expires_in?: number;
    error?: string;
  };
  if (!res.ok || !data.access_token) {
    throw new Error(`Zoho token refresh failed: ${data.error ?? res.status}`);
  }
  accessTokens.set(account.id, {
    token: data.access_token,
    expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000,
  });
  return data.access_token;
}

// ---------------------------------------------------------------------------
// Mail API
// ---------------------------------------------------------------------------

/** Raw Zoho Mail API call for a connected mailbox. */
export async function zohoApi(
  account: typeof schema.mailAccounts.$inferSelect,
  path: string,
  init?: { method?: string; body?: unknown },
): Promise<unknown> {
  const cfg = zohoConfig();
  const token = await getAccessToken(account);
  const res = await fetch(`${cfg.mailBase}/api${path}`, {
    method: init?.method ?? "GET",
    headers: {
      Authorization: `Zoho-oauthtoken ${token}`,
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
    },
    body: init?.body ? JSON.stringify(init.body) : undefined,
  });
  const data = (await res.json().catch(() => ({}))) as {
    data?: unknown;
    status?: { code?: number; description?: string };
  };
  // Zoho can wrap failures in an HTTP 200 — trust the body status too.
  const bodyCode = data.status?.code;
  if (!res.ok || (typeof bodyCode === "number" && bodyCode >= 300)) {
    throw new Error(
      `Zoho API ${path} failed (${res.ok ? bodyCode : res.status}): ${
        data.status?.description ?? "unknown error"
      }`,
    );
  }
  return data.data ?? data;
}

/** Resolve the Zoho account id + verify the mailbox address after connect. */
export async function findZohoAccount(
  accessToken: string,
  expectedAddress: string,
): Promise<string> {
  const cfg = zohoConfig();
  const res = await fetch(`${cfg.mailBase}/api/accounts`, {
    headers: { Authorization: `Zoho-oauthtoken ${accessToken}` },
  });
  const data = (await res.json().catch(() => ({}))) as {
    data?: {
      accountId?: string;
      primaryEmailAddress?: string;
      incomingUserName?: string;
      emailAddress?: { mailId?: string }[];
    }[];
  };
  const accounts = data.data ?? [];
  const want = expectedAddress.toLowerCase();
  const match = accounts.find(
    (a) =>
      a.primaryEmailAddress?.toLowerCase() === want ||
      a.incomingUserName?.toLowerCase() === want ||
      (a.emailAddress ?? []).some((e) => e.mailId?.toLowerCase() === want),
  );
  if (!match?.accountId) {
    throw new Error(
      `The Zoho account you signed in with doesn't own ${expectedAddress}. ` +
        `Sign in to Zoho as that mailbox and try again.`,
    );
  }
  return match.accountId;
}

export async function saveMailAccount(params: {
  address: string;
  zohoAccountId: string;
  refreshToken: string;
  minRole: "admin" | "super_admin";
}) {
  const refreshTokenEnc = encryptSecret(params.refreshToken);
  await db
    .insert(schema.mailAccounts)
    .values({
      address: params.address,
      zohoAccountId: params.zohoAccountId,
      refreshTokenEnc,
      minRole: params.minRole,
    })
    .onConflictDoUpdate({
      target: schema.mailAccounts.address,
      set: {
        zohoAccountId: params.zohoAccountId,
        refreshTokenEnc,
        minRole: params.minRole,
        updatedAt: new Date(),
      },
    });
  // Invalidate any cached access token for a re-connected mailbox.
  const row = await db.query.mailAccounts.findFirst({
    where: eq(schema.mailAccounts.address, params.address),
  });
  if (row) accessTokens.delete(row.id);
}
