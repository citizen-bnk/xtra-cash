import {
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";
import { createHmac, timingSafeEqual } from "crypto";
import { z } from "zod";
export const providerEvent = z
  .object({
    eventId: z.string().min(8).max(150),
    movementId: z.string().min(1).max(100),
    providerReference: z.string().min(1).max(150),
    amountCents: z.number().int().positive(),
    currency: z.literal("ZAR"),
    status: z.enum(["PENDING", "SUCCEEDED", "FAILED", "RETURNED"]),
    failureCode: z.string().max(100).optional(),
  })
  .strict();
export type MoneyEvent = z.infer<typeof providerEvent>;
/** Contract for a bank-approved integration bridge, not a built-in Stitch integration.
 * The bridge must enforce idempotency, verify its upstream events and normalise finality.
 * No mock fallback exists on this money path. */
@Injectable()
export class MoneyConnector {
  readiness() {
    const missing: string[] = [];
    for (const k of [
      "MONEY_CONNECTOR_URL",
      "MONEY_CONNECTOR_TOKEN",
      "MONEY_WEBHOOK_SECRET",
      "IDENTITY_ENCRYPTION_KEY",
      "MONEY_PROGRAMME_REFERENCE",
    ])
      if (!process.env[k]) missing.push(k);
    if (
      (process.env.IDENTITY_ENCRYPTION_KEY?.length ?? 0) < 32 &&
      !missing.includes("IDENTITY_ENCRYPTION_KEY")
    )
      missing.push("IDENTITY_ENCRYPTION_KEY");
    if (
      (process.env.MONEY_WEBHOOK_SECRET?.length ?? 0) < 32 &&
      !missing.includes("MONEY_WEBHOOK_SECRET")
    )
      missing.push("MONEY_WEBHOOK_SECRET");
    try {
      const u = new URL(process.env.MONEY_CONNECTOR_URL!);
      if (
        u.protocol !== "https:" ||
        u.username ||
        u.password ||
        u.search ||
        u.hash ||
        u.pathname !== "/" ||
        u.hostname === "localhost" ||
        /^\d+\.\d+\.\d+\.\d+$/.test(u.hostname)
      )
        missing.push("MONEY_CONNECTOR_URL_HTTPS_ORIGIN");
    } catch {
      missing.push("MONEY_CONNECTOR_URL_HTTPS_ORIGIN");
    }
    if (process.env.MONEY_PROGRAMME_ENABLED !== "true")
      missing.push("MONEY_PROGRAMME_ENABLED");
    if (
      process.env.ENABLE_SIMULATION === "true" ||
      process.env.DEMO_MODE === "true" ||
      process.env.ENABLE_DEMO_LOGIN !== "false"
    )
      missing.push("DISABLE_DEMO_AND_SIMULATION");
    return {
      enabled: missing.length === 0,
      agreementsEnabled: process.env.PERSONAL_AGREEMENTS_ENABLED === "true",
      missing: [...new Set(missing)],
      provider: "BANK_APPROVED_BRIDGE",
      currency: "ZAR",
    };
  }
  requireReady() {
    if (!this.readiness().enabled)
      throw new ServiceUnavailableException(
        "Banking connection is awaiting activation. No funds have been moved.",
      );
  }
  async call(path: string, body: unknown) {
    this.requireReady();
    const r = await fetch(new URL(path, process.env.MONEY_CONNECTOR_URL!), {
      method: "POST",
      redirect: "error",
      headers: {
        authorization: `Bearer ${process.env.MONEY_CONNECTOR_TOKEN}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    });
    if (!r.ok)
      throw new ServiceUnavailableException(
        "Banking provider response unavailable; the instruction will be checked again.",
      );
    return r.json();
  }
  verifySignature(raw: Buffer, timestamp: string, signature: string) {
    const secret = process.env.MONEY_WEBHOOK_SECRET;
    if (
      !secret ||
      secret.length < 32 ||
      !/^\d{10}$/.test(timestamp) ||
      Math.abs(Date.now() - Number(timestamp) * 1000) > 300000
    )
      throw new UnauthorizedException("Invalid provider signature");
    const expected = Buffer.from(
      createHmac("sha256", secret)
        .update(timestamp + ".")
        .update(raw)
        .digest("hex"),
    );
    const given = Buffer.from(signature || "");
    if (given.length !== expected.length || !timingSafeEqual(given, expected))
      throw new UnauthorizedException("Invalid provider signature");
  }
}
