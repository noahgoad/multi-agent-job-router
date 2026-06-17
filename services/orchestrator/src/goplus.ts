/**
 * GoPlus transaction-target checker.
 *
 * Any task that proposes a token transfer, address interaction, or
 * approval is gated on a GoPlus scan. The check returns a structured
 * verdict; a `risky` verdict aborts the task and the worker is asked
 * to retry with a different target or abort entirely.
 *
 * The implementation here is a stub that delegates to a pluggable
 * `GoplusClient`. Production deployments inject a real HTTP client
 * pointed at `GOPLUS_BASE_URL`.
 */

export type GoplusVerdict = "safe" | "risky" | "unknown";

export interface GoplusCheck {
  readonly target: `0x${string}`;
  readonly verdict: GoplusVerdict;
  readonly reason: string;
  readonly checkedAt: number;
}

export interface GoplusClient {
  checkAddress(
    chainId: number,
    address: `0x${string}`,
  ): Promise<GoplusCheck>;
}

export class StaticGoplusClient implements GoplusClient {
  private readonly denylist = new Set<string>();
  constructor(denylist: ReadonlyArray<string> = []) {
    for (const a of denylist) this.denylist.add(a.toLowerCase());
  }
  async checkAddress(
    _chainId: number,
    address: `0x${string}`,
  ): Promise<GoplusCheck> {
    const target = address.toLowerCase() as `0x${string}`;
    if (this.denylist.has(target)) {
      return {
        target,
        verdict: "risky",
        reason: "address_on_denylist",
        checkedAt: Math.floor(Date.now() / 1000),
      };
    }
    return {
      target,
      verdict: "safe",
      reason: "no_known_risk",
      checkedAt: Math.floor(Date.now() / 1000),
    };
  }
}

export async function guardTransactionTarget(
  client: GoplusClient,
  chainId: number,
  address: `0x${string}`,
): Promise<GoplusCheck> {
  return client.checkAddress(chainId, address);
}