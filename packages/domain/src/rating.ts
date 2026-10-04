import { z } from "zod";
import { DomainError, money, roundRatio, type Coverage } from "./insurance.js";
const minor = z.string().regex(/^\d{1,18}$/),
  ratio = z.string().regex(/^[1-9]\d{0,8}$/);
export const ratingRules = z
  .object({
    version: z.string().min(3).max(100),
    effectiveFrom: z.iso.datetime({ offset: true }),
    effectiveUntil: z.iso.datetime({ offset: true }),
    ageFactors: z
      .array(
        z
          .object({
            minAge: z.number().int().min(18).max(100),
            maxAge: z.number().int().min(18).max(100),
            numerator: ratio,
            denominator: ratio,
          })
          .strict(),
      )
      .min(1)
      .max(20),
    assetRateBps: z.number().int().min(0).max(10000),
    taxBps: z.number().int().min(0).max(10000),
    feeMinor: minor,
    referAboveAge: z.number().int().min(18).max(100),
  })
  .strict()
  .superRefine((r, ctx) => {
    if (new Date(r.effectiveUntil) <= new Date(r.effectiveFrom))
      ctx.addIssue({
        code: "custom",
        message: "Rating effective period is invalid.",
      });
    for (let age = 18; age <= 100; age++)
      if (
        r.ageFactors.filter((f) => age >= f.minAge && age <= f.maxAge)
          .length !== 1
      )
        ctx.addIssue({
          code: "custom",
          message: "Age factors must cover18–100 exactly once.",
        });
  });
export type RatingRules = z.infer<typeof ratingRules>;
export const sandboxRules: RatingRules = {
  version: "sandbox-rating-v1",
  effectiveFrom: "2020-01-01T00:00:00Z",
  effectiveUntil: "2100-01-01T00:00:00Z",
  ageFactors: [
    { minAge: 18, maxAge: 24, numerator: "125", denominator: "100" },
    { minAge: 25, maxAge: 100, numerator: "1", denominator: "1" },
  ],
  assetRateBps: 0,
  taxBps: 800,
  feeMinor: "500",
  referAboveAge: 70,
};
export function rateConfigured(
  input: {
    basePremiumMinor: string;
    age: number;
    assetValueMinor: string;
    coverages: Coverage[];
  },
  definition: unknown,
  at = new Date(),
) {
  const rules = ratingRules.parse(definition);
  if (
    at < new Date(rules.effectiveFrom) ||
    at >= new Date(rules.effectiveUntil)
  )
    throw new DomainError(
      "RATING_NOT_EFFECTIVE",
      "No effective approved rating version is available.",
      422,
    );
  const factor = rules.ageFactors.find(
    (f) => input.age >= f.minAge && input.age <= f.maxAge,
  );
  if (!factor)
    throw new DomainError(
      "INELIGIBLE",
      "Applicant outside supported rating ages.",
      422,
    );
  const base =
      money(input.basePremiumMinor) +
      roundRatio(
        money(input.assetValueMinor),
        BigInt(rules.assetRateBps),
        10000n,
      ),
    rated = roundRatio(
      base,
      BigInt(factor.numerator),
      BigInt(factor.denominator),
    );
  const additions = input.coverages.reduce(
      (sum, c) => sum + money(c.premiumMinor ?? "0"),
      0n,
    ),
    premium = rated + additions,
    tax = roundRatio(premium, BigInt(rules.taxBps), 10000n),
    fee = money(rules.feeMinor);
  if (premium + tax + fee > 999999999999999999n || premium <= 0n)
    throw new DomainError(
      "RATING_AMOUNT_INVALID",
      "The configured premium exceeds the supported monetary range.",
      422,
    );
  return {
    totalMinor: (premium + tax + fee).toString(),
    premiumMinor: premium.toString(),
    taxMinor: tax.toString(),
    feeMinor: fee.toString(),
    referred: input.age > rules.referAboveAge,
    breakdown: [
      {
        name: "Rated premium",
        amountMinor: premium.toString(),
        factor: `${factor.numerator}/${factor.denominator}`,
      },
      { name: "Configured tax", amountMinor: tax.toString() },
      { name: "Configured fee", amountMinor: fee.toString() },
    ],
    engineVersion: rules.version,
    ratingRules: rules,
  };
}
