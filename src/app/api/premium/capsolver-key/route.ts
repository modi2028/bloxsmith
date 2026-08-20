import type { NextRequest } from "next/server";
import { z } from "zod";
import { clientIp, rateLimit } from "@/server/security/ratelimit";

// ─────────────────────────────────────────────────────────────────────────────
// Leventia premium: Capsolver shared key hand-off.
//
// The desktop app never carries a Capsolver key itself. After it validates a
// license directly against Supabase (electron/ipc/store.ts, store:revalidate-
// license), it POSTs the license key here. This endpoint independently checks
// that key against Supabase — via rpc_check_premium, a READ-ONLY function that
// reports validity/plan and does NOT touch the license's HWID binding — and
// only then hands back the shared Capsolver key from CAPSOLVER_SHARED_KEY.
//
// Why not just trust the desktop app's own check? Because a client-side "yes
// I'm premium" is trivially spoofable — anyone could skip the real check and
// ask for the key directly. Re-validating here, server-side, is what makes the
// gate real.
//
// Why not reuse rpc_activate (the same RPC the app itself calls to validate)?
// That RPC binds/transfers the license's HWID as a side effect — calling it a
// second time from a stateless server with no real device HWID risks either a
// false rejection or, worse, reads as a legitimate device change and steals
// the binding from the user's actual install. rpc_check_premium exists
// specifically to avoid that: it only reads status/expiry/role, never writes.
// ─────────────────────────────────────────────────────────────────────────────

const bodySchema = z.object({
  key: z.string().trim().min(1).max(128),
});

const SUPABASE_URL = (process.env.LVNT_SUPABASE_URL ?? "").replace(/\/$/, "");
const SUPABASE_KEY = process.env.LVNT_SUPABASE_KEY ?? "";
const CAPSOLVER_SHARED_KEY = process.env.CAPSOLVER_SHARED_KEY ?? "";

async function checkPremium(key: string): Promise<boolean> {
  if (!SUPABASE_URL || !SUPABASE_KEY) return false;
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/rpc_check_premium`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ p_key: key.toUpperCase() }),
  });
  if (!res.ok) return false;
  const rows = (await res.json()) as Array<{ valid: boolean; is_premium: boolean }>;
  return rows[0]?.valid === true && rows[0]?.is_premium === true;
}

export async function POST(request: NextRequest) {
  if (!CAPSOLVER_SHARED_KEY || !SUPABASE_URL || !SUPABASE_KEY) {
    // Not configured yet — fail closed, no key handed out.
    return Response.json({ key: null });
  }

  // A license key is a low-entropy-ish secret guessed via this endpoint would
  // just get you Capsolver credits, not account access — but still throttle.
  const ip = clientIp(request);
  const rl = rateLimit(`capsolver-key:${ip}`, 20, 60_000);
  if (!rl.ok) {
    return Response.json({ error: "Rate limited" }, { status: 429 });
  }

  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await request.json());
  } catch {
    return Response.json({ key: null });
  }

  const premium = await checkPremium(body.key).catch(() => false);
  if (!premium) return Response.json({ key: null });

  return Response.json({ key: CAPSOLVER_SHARED_KEY });
}
