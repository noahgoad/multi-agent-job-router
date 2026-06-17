/**
 * CertiK scan-verdict tracker.
 *
 * Skill releases are gated on a CertiK scan. The orchestrator queries
 * the tracker before allowing a routing decision. The implementation
 * is a stub that delegates to a pluggable `CertikClient`.
 */

export type CertikVerdict = "pass" | "fail" | "expired";

export interface CertikScan {
  readonly skillReleaseHash: `0x${string}`;
  readonly verdict: CertikVerdict;
  readonly reportUrl: string;
  readonly scannedAt: number;
}

export interface CertikClient {
  scan(releaseHash: `0x${string}`): Promise<CertikScan>;
}

export class StaticCertikClient implements CertikClient {
  private readonly verdicts = new Map<string, CertikVerdict>();
  constructor(
    entries: ReadonlyArray<{ releaseHash: `0x${string}`; verdict: CertikVerdict }>,
  ) {
    for (const e of entries) this.verdicts.set(e.releaseHash.toLowerCase(), e.verdict);
  }
  async scan(releaseHash: `0x${string}`): Promise<CertikScan> {
    const v = this.verdicts.get(releaseHash.toLowerCase()) ?? "pass";
    return {
      skillReleaseHash: releaseHash,
      verdict: v,
      reportUrl: `https://certik.example/report/${releaseHash.slice(2, 10)}`,
      scannedAt: Math.floor(Date.now() / 1000),
    };
  }
}

export async function requireCertikPass(
  client: CertikClient,
  releaseHash: `0x${string}`,
): Promise<void> {
  const s = await client.scan(releaseHash);
  if (s.verdict !== "pass") {
    throw new Error(`certik_verdict_not_pass:${s.verdict}`);
  }
}