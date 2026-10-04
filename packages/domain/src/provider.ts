export interface ProviderRequest {
  amountMinor: string;
  currency: string;
  subjectReference: string;
  resourceReference: string;
  productVersionId?: string;
  risk?: unknown;
  requestedEffectiveAt?: string;
}
export interface ProviderEvidence {
  status: "SUCCEEDED" | "DECLINED";
  reference: string;
  amountMinor: string;
  currency: string;
  requestHash: string;
  effectiveAt?: string;
  expiresAt?: string;
}
export interface EffectProvider {
  execute(
    key: string,
    request: ProviderRequest,
    allowCreate?: boolean,
  ): Promise<ProviderEvidence>;
}
