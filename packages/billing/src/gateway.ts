import type { PaymentMethod } from "./types.js";

// Payment gateway seam (ADR-0036). KNET + card processing goes through this port;
// the billing ledger never embeds a gateway SDK. A dev/test StubPaymentGateway
// stands in until the IN-REGION, residency-reviewed processor is selected (the
// real adapter lands behind this port with a residency ADR). No cash (ADR-0034):
// the port only carries KNET/card.

export interface GatewayChargeRequest {
  /** Our reference for the charge (e.g. the invoice id). */
  readonly reference: string;
  readonly amountFils: number;
  readonly method: PaymentMethod;
}

export type GatewayOutcome =
  | { readonly captured: true; readonly gatewayRef: string }
  | { readonly captured: false; readonly reason: string };

export interface PaymentGatewayPort {
  /** Authorize + capture a charge. */
  charge(req: GatewayChargeRequest): Promise<GatewayOutcome>;
  /** Refund a previously captured charge. */
  refund(req: GatewayChargeRequest): Promise<GatewayOutcome>;
}

/**
 * Dev/test stub gateway — deterministically "captures" KNET/card charges and
 * refunds, returning a synthetic gateway reference. `declineNext()` forces the
 * next operation to decline (for adversarial tests). NOT for production: the real
 * in-region processor replaces it behind PaymentGatewayPort (ADR-0036).
 */
export class StubPaymentGateway implements PaymentGatewayPort {
  private declineFlag = false;
  private seq = 0;

  /** Force the next charge/refund to be declined. */
  declineNext(): void {
    this.declineFlag = true;
  }

  async charge(req: GatewayChargeRequest): Promise<GatewayOutcome> {
    return this.run("CHG", req);
  }
  async refund(req: GatewayChargeRequest): Promise<GatewayOutcome> {
    return this.run("RFND", req);
  }

  private run(prefix: string, req: GatewayChargeRequest): GatewayOutcome {
    if (this.declineFlag) {
      this.declineFlag = false;
      return { captured: false, reason: "stub_declined" };
    }
    this.seq += 1;
    return { captured: true, gatewayRef: `${prefix}-${req.method.toUpperCase()}-${this.seq}` };
  }
}
