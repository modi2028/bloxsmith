import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { getSuperAdminForApi, auditAdmin } from "@/server/auth/admin";
import { hashToken } from "@/server/crypto";
import { db, schema } from "@/server/db";
import { clientIp, rateLimit } from "@/server/security/ratelimit";

/** Extra confirmation required, same as the other dangerous switches. */
const CONFIRM_CODE = "Bloxsmith-Admin";

const bodySchema = z
  .object({
    proDays: z.number().int().min(0).max(3650),
    credits: z.number().min(0).max(1000),
    /** How long the code stays redeemable. */
    validDays: z.number().int().min(1).max(365).default(90),
    confirm: z.string(),
  })
  .refine((v) => v.proDays > 0 || v.credits > 0, {
    message: "The code must grant Pro days and/or credits",
  });

/**
 * POST /api/admin/codes — super admin only: mint a redemption code (Pro
 * and/or credits) for the shop's redeem box.
 *
 * Security: super admin + allowlist + the admin confirmation code, rate
 * limited, audit-logged, and the plaintext code is returned exactly once —
 * only its SHA-256 hash is stored (long UUID-based codes, ~122 bits entropy).
 */
export async function POST(request: NextRequest) {
  const superAdmin = await getSuperAdminForApi();
  if (!superAdmin) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const rl = rateLimit(`codes:${superAdmin.id}`, 10, 60 * 60_000);
  if (!rl.ok) {
    return Response.json(
      { error: "Code-generation limit reached — try again later." },
      { status: 429 },
    );
  }

  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await request.json());
  } catch {
    return Response.json(
      { error: "The code must grant Pro days and/or credits." },
      { status: 400 },
    );
  }

  if (body.confirm !== CONFIRM_CODE) {
    return Response.json(
      { error: "Wrong admin code — nothing was created." },
      { status: 403 },
    );
  }

  // Long UUID code, stored uppercase to match the redeem route's normalization.
  const code = `BLOX-${randomUUID().toUpperCase()}`;
  const expiresAt = new Date(Date.now() + body.validDays * 86_400_000);

  const [row] = await db
    .insert(schema.redemptionCodes)
    .values({
      codeHash: hashToken(code),
      credits: body.credits,
      grantsPro: body.proDays > 0,
      proDays: body.proDays > 0 ? body.proDays : null,
      expiresAt,
      createdBy: superAdmin.id,
    })
    .returning({ id: schema.redemptionCodes.id });

  await auditAdmin({
    actorUserId: superAdmin.id,
    action: "codes.create",
    targetType: "redemption_code",
    targetId: row!.id,
    after: {
      proDays: body.proDays || null,
      credits: body.credits || null,
      validDays: body.validDays,
    },
    ip: clientIp(request),
  });

  return Response.json({
    code,
    grants: {
      proDays: body.proDays || null,
      credits: body.credits || null,
    },
    expiresAt: expiresAt.toISOString(),
  });
}
