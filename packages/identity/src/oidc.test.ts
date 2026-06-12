import { describe, expect, it } from "vitest";
import { DevOidcProvider, claimsHaveMfa } from "./oidc.js";

describe("DevOidcProvider", () => {
  it("refuses to construct in production", () => {
    expect(() => new DevOidcProvider(true)).toThrow(/never run in production/);
  });

  it("verifies a well-formed dev token", async () => {
    const provider = new DevOidcProvider(false);
    const r = await provider.verifyToken(`dev:${JSON.stringify({ sub: "u1", amr: ["pwd", "mfa"] })}`);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.sub).toBe("u1");
  });

  it("rejects a token without the dev prefix", async () => {
    const r = await new DevOidcProvider(false).verifyToken("Bearer abc");
    expect(r.ok).toBe(false);
  });

  it("rejects a dev token missing sub", async () => {
    const r = await new DevOidcProvider(false).verifyToken(`dev:${JSON.stringify({ email: "x" })}`);
    expect(r.ok).toBe(false);
  });

  it("rejects an unparseable dev token", async () => {
    const r = await new DevOidcProvider(false).verifyToken("dev:{not json");
    expect(r.ok).toBe(false);
  });
});

describe("claimsHaveMfa", () => {
  it("is true only when amr includes mfa", () => {
    expect(claimsHaveMfa({ sub: "u", amr: ["pwd", "mfa"] })).toBe(true);
    expect(claimsHaveMfa({ sub: "u", amr: ["pwd"] })).toBe(false);
    expect(claimsHaveMfa({ sub: "u" })).toBe(false);
  });
});
