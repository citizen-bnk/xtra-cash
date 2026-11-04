import { createHmac } from "crypto";
import { MoneyConnector } from "./money-connector";
describe("Bank connector activation and callbacks", () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
  });
  const configured = () => {
    Object.assign(process.env, {
      MONEY_CONNECTOR_URL: "https://approved-bank-bridge.example",
      MONEY_CONNECTOR_TOKEN: "test-token",
      MONEY_WEBHOOK_SECRET: "private-test-webhook-secret-over-32",
      IDENTITY_ENCRYPTION_KEY: "private-test-encryption-key-over-32",
      MONEY_PROGRAMME_REFERENCE: "TEST-CONTRACT",
      MONEY_PROGRAMME_ENABLED: "true",
      ENABLE_DEMO_LOGIN: "false",
      ENABLE_SIMULATION: "false",
      DEMO_MODE: "false",
    });
  };
  it("blocks live money whenever public demos or simulation remain enabled", () => {
    configured();
    const c = new MoneyConnector();
    expect(c.readiness().enabled).toBe(true);
    process.env.ENABLE_DEMO_LOGIN = "true";
    expect(c.readiness().enabled).toBe(false);
    expect(() => c.requireReady()).toThrow();
  });
  it("requires an explicit dedicated encryption key and a secure bridge origin", () => {
    configured();
    delete process.env.IDENTITY_ENCRYPTION_KEY;
    expect(new MoneyConnector().readiness().enabled).toBe(false);
    configured();
    process.env.MONEY_CONNECTOR_URL = "http://localhost:4000";
    expect(new MoneyConnector().readiness().enabled).toBe(false);
  });
  it("rejects expired, altered and missing callback signatures", () => {
    configured();
    const c = new MoneyConnector(),
      raw = Buffer.from('{"test":true}'),
      timestamp = String(Math.floor(Date.now() / 1000));
    const signature = createHmac("sha256", process.env.MONEY_WEBHOOK_SECRET!)
      .update(timestamp + ".")
      .update(raw)
      .digest("hex");
    expect(() => c.verifySignature(raw, timestamp, signature)).not.toThrow();
    expect(() =>
      c.verifySignature(Buffer.from("changed"), timestamp, signature),
    ).toThrow();
    expect(() =>
      c.verifySignature(raw, String(Number(timestamp) - 600), signature),
    ).toThrow();
    expect(() => c.verifySignature(raw, timestamp, "")).toThrow();
  });
});
