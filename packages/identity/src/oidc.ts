import type { Result } from "@oxford/core";
import { ok, err, unauthenticated } from "@oxford/core";

// OIDC relying-party seam (ADR-0011). Oxford HIS is an OIDC RELYING PARTY, never
// an identity store and never its own crypto. Today the provider is a
// self-hosted in-region IdP; an in-region MANAGED IdP (leaning Oracle Cloud
// Kuwait, ADR-0007) can be slotted in behind this interface without a rewrite.

/** Verified claims from the IdP. `amr` carries the authentication methods so we
 *  can tell whether MFA was satisfied (docs/02 §2: MFA for clinical/financial). */
export interface OidcClaims {
  readonly sub: string;
  readonly email?: string;
  /** Authentication Methods References, e.g. ["pwd", "mfa"]. */
  readonly amr?: readonly string[];
}

export interface OidcProvider {
  /** Verify a bearer token (signature, issuer, audience, expiry via JWKS). */
  verifyToken(token: string): Promise<Result<OidcClaims, ReturnType<typeof unauthenticated>>>;
}

/** True if the authentication methods include a multi-factor step. */
export function claimsHaveMfa(claims: OidcClaims): boolean {
  return (claims.amr ?? []).includes("mfa");
}

/**
 * Development-only provider. Tokens are `dev:<json-claims>` — NO cryptographic
 * verification. It refuses to construct in production so it can never be the
 * relying party for real PHI (mirrors the KeyProvider guard, ADR-0012).
 */
export class DevOidcProvider implements OidcProvider {
  constructor(isProduction: boolean) {
    if (isProduction) {
      throw new Error("DevOidcProvider must never run in production — wire the real OIDC provider");
    }
  }

  async verifyToken(
    token: string,
  ): Promise<Result<OidcClaims, ReturnType<typeof unauthenticated>>> {
    if (!token.startsWith("dev:")) {
      return err(unauthenticated("invalid dev token", "auth.token.invalid"));
    }
    try {
      const parsed: unknown = JSON.parse(token.slice("dev:".length));
      if (
        typeof parsed !== "object" ||
        parsed === null ||
        typeof (parsed as { sub?: unknown }).sub !== "string"
      ) {
        return err(unauthenticated("dev token missing sub", "auth.token.invalid"));
      }
      return ok(parsed as OidcClaims);
    } catch {
      return err(unauthenticated("dev token not parseable", "auth.token.invalid"));
    }
  }
}
