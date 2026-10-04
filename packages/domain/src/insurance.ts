export type Role =
  | "CUSTOMER"
  | "UNDERWRITER"
  | "ADJUSTER"
  | "FINANCE"
  | "FINANCE_APPROVER"
  | "ADMIN"
  | "DEVELOPER";
export interface Actor {
  id: string;
  tenantId: string;
  partyId: string;
  role: Role;
  name: string;
  email: string;
}
export class DomainError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 409,
  ) {
    super(message);
  }
}
export function requireRole(actor: Actor, ...roles: Role[]): void {
  if (!roles.includes(actor.role))
    throw new DomainError(
      "FORBIDDEN",
      "This action is not permitted for your role.",
      403,
    );
}
export function money(value: string): bigint {
  if (!/^(0|[1-9]\d{0,17})$/.test(value))
    throw new DomainError(
      "INVALID_MONEY",
      "Amount must be a nonnegative integer in minor units.",
      422,
    );
  return BigInt(value);
}
export function roundRatio(
  amount: bigint,
  numerator: bigint,
  denominator: bigint,
): bigint {
  if (amount < 0n || numerator < 0n || denominator <= 0n)
    throw new DomainError("INVALID_FACTOR", "Invalid rating factor.", 422);
  return (amount * numerator * 2n + denominator) / (denominator * 2n);
}
export interface Coverage {
  code: string;
  name: string;
  limitMinor: string;
  deductibleMinor: string;
  premiumMinor?: string;
}
export interface RatingInput {
  basePremiumMinor: string;
  age: number;
  assetValueMinor: string;
  coverages: Coverage[];
}
export function rate(input: RatingInput) {
  if (!Number.isInteger(input.age) || input.age < 18 || input.age > 100)
    throw new DomainError(
      "AGE_INELIGIBLE",
      "Applicant age must be between 18 and 100.",
      422,
    );
  const base = money(input.basePremiumMinor),
    asset = money(input.assetValueMinor);
  if (asset <= 0n)
    throw new DomainError(
      "INVALID_RISK",
      "Insured asset value is required.",
      422,
    );
  const ageFactor = input.age < 25 ? 125n : 100n;
  const ratedBase = roundRatio(base, ageFactor, 100n);
  const coverPremium = input.coverages.reduce(
    (sum, c) => sum + money(c.premiumMinor ?? "0"),
    0n,
  );
  const premium = ratedBase + coverPremium,
    tax = roundRatio(premium, 8n, 100n),
    fee = 500n;
  return {
    totalMinor: (premium + tax + fee).toString(),
    premiumMinor: premium.toString(),
    taxMinor: tax.toString(),
    feeMinor: fee.toString(),
    referred: input.age > 70,
    breakdown: [
      { name: "Base premium", amountMinor: base.toString() },
      {
        name: "Age factor",
        factor: `${ageFactor}/100`,
        amountMinor: ratedBase.toString(),
      },
      { name: "Additional coverages", amountMinor: coverPremium.toString() },
      { name: "Tax (sandbox 8%)", amountMinor: tax.toString() },
      { name: "Platform fee", amountMinor: fee.toString() },
    ],
    engineVersion: "sandbox-rating-v1",
  };
}
export interface Posting {
  account: string;
  side: "DEBIT" | "CREDIT";
  amountMinor: string;
}
export function assertBalanced(postings: Posting[]): void {
  if (postings.length < 2)
    throw new DomainError(
      "UNBALANCED_JOURNAL",
      "A journal requires at least two postings.",
    );
  let balance = 0n;
  for (const p of postings) {
    const n = money(p.amountMinor);
    if (n <= 0n)
      throw new DomainError("ZERO_POSTING", "Posting amount must be positive.");
    balance += p.side === "DEBIT" ? n : -n;
  }
  if (balance !== 0n)
    throw new DomainError(
      "UNBALANCED_JOURNAL",
      "Journal debits and credits must balance.",
    );
}
export function claimPayable(
  requested: string,
  limit: string,
  deductible: string,
  committed: string,
): string {
  const available = money(limit) - money(committed),
    loss = money(requested) - money(deductible);
  return (
    available <= 0n || loss <= 0n ? 0n : loss < available ? loss : available
  ).toString();
}
export function transition(
  status: string,
  allowed: readonly string[],
  next: string,
): string {
  if (!allowed.includes(status))
    throw new DomainError(
      "INVALID_TRANSITION",
      `Action is unavailable while the resource is ${status}.`,
    );
  return next;
}
export function fourEyes(proposer: string, approver: string): void {
  if (proposer === approver)
    throw new DomainError(
      "SEPARATION_OF_DUTIES",
      "A different authorized person must approve this action.",
      403,
    );
}
