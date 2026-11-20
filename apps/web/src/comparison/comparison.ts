/**
 * The tools on the comparison page, validated, and the rules that put each tool
 * in a category. The page renders them as tables, and its Markdown for LLMs
 * renders them as Markdown tables.
 */
import {
  array,
  assert,
  type InferType,
  nullOr,
  object,
  optional,
  regex,
  String,
  union,
} from "@evolu/common";

import comparisonJson from "./comparison.json" with { type: "json" };

const ComparisonCriterionValue = union(
  "meets",
  "partial",
  "misses",
  "n/a",
  "unclear",
);
export type ComparisonCriterionValue = InferType<
  typeof ComparisonCriterionValue
>;

const ComparisonEvidence = object({
  value: String,
  evidence: String,
  source: String,
});
export interface ComparisonEvidence extends InferType<
  typeof ComparisonEvidence
> {}

const ComparisonCriterion = object({
  value: ComparisonCriterionValue,
  evidence: String,
  source: String,
});
export interface ComparisonCriterion extends InferType<
  typeof ComparisonCriterion
> {}

const ComparisonCriteria = object({
  offline: ComparisonCriterion,
  devicePrimary: ComparisonCriterion,
  fullHistory: ComparisonCriterion,
  anyServer: ComparisonCriterion,
  e2ee: ComparisonCriterion,
  postQuantum: ComparisonCriterion,
  keysNotAccounts: ComparisonCriterion,
  openSource: ComparisonCriterion,
});
export interface ComparisonCriteria extends InferType<
  typeof ComparisonCriteria
> {}

const LocalFirstClaim = nullOr(
  object({
    quote: String,
    /** An English translation of a quote in another language. */
    translation: optional(String),
    source: String,
  }),
);
export type LocalFirstClaim = InferType<typeof LocalFirstClaim>;

/**
 * What a tool's authors say about its maturity, or `pre-1.0` when they call it
 * that without a release.
 */
export const ComparisonMaturityLabel = /*#__PURE__*/ union(
  "stable",
  "beta",
  "alpha",
  "experimental",
  "maintenance",
  "unclear",
  "pre-1.0",
);
export type ComparisonMaturityLabel = InferType<typeof ComparisonMaturityLabel>;

const versionPattern = /^(\d+)\.(\d+)(?:\.(\d+))?(-.+)?$/u;

/** A release version such as `1.2.3`, `0.9`, or `1.0.0-rc.1`. */
export const ComparisonVersion = /*#__PURE__*/ regex(
  "ComparisonVersion",
  versionPattern,
)(String);
export type ComparisonVersion = InferType<typeof ComparisonVersion>;

const ComparisonTool = object({
  name: String,
  url: String,
  localFirstClaim: LocalFirstClaim,
  criteria: ComparisonCriteria,
  maturity: object({
    label: ComparisonMaturityLabel,
    note: nullOr(String),
    source: String,
  }),
  latestVersion: nullOr(ComparisonVersion),
  conflicts: ComparisonEvidence,
});
export interface ComparisonTool extends InferType<typeof ComparisonTool> {}

const DiscontinuedTool = object({
  name: String,
  url: String,
  whatItWas: String,
  ended: object({ date: String, summary: String, source: String }),
  successor: nullOr(String),
  localFirstClaim: LocalFirstClaim,
  criteria: ComparisonCriteria,
  conflicts: ComparisonEvidence,
});
export interface DiscontinuedTool extends InferType<typeof DiscontinuedTool> {}

const Comparison = object({
  checkedOn: regex("IsoDate", /^\d{4}-\d{2}-\d{2}$/u)(String),
  tools: array(ComparisonTool),
  discontinued: array(DiscontinuedTool),
});
interface Comparison extends InferType<typeof Comparison> {}

export const comparison: Comparison =
  /*#__PURE__*/ Comparison.orThrow(comparisonJson);

// A function, so the exported date can carry a /*#__PURE__*/ annotation: the
// lint rule doesn't allow one on a property access of a call result.
const isoDateToText = (isoDate: string): string =>
  new Intl.DateTimeFormat("en-US", {
    dateStyle: "long",
    timeZone: "UTC",
  }).format(new Date(`${isoDate}T00:00:00Z`));

/** The date the tools were last checked, such as `November 20, 2026`. */
export const comparisonCheckedOn = /*#__PURE__*/ isoDateToText(
  comparison.checkedOn,
);

/** The criteria in the order the page numbers them. */
export const comparisonCriteria = [
  ["offline", "Works offline"],
  ["devicePrimary", "The device's copy is primary"],
  ["fullHistory", "Full history"],
  ["anyServer", "No single server"],
  ["e2ee", "End-to-end encryption, always on"],
  ["postQuantum", "Post-quantum cryptography"],
  ["keysNotAccounts", "Keys, not accounts"],
  ["openSource", "Open source"],
] as const satisfies ReadonlyArray<readonly [keyof ComparisonCriteria, string]>;

export const comparisonMarkSymbols = {
  meets: "✓",
  partial: "◐",
  misses: "✗",
  "n/a": "–",
  unclear: "?",
} as const satisfies Record<ComparisonCriterionValue, string>;

/** The category a tool falls in by the criteria on the comparison page. */
export const ComparisonCategory = /*#__PURE__*/ union(
  "Local-first",
  "Not local-first yet",
  "Marketed as local-first",
  "Offline-first",
  "Sync engine",
);
export type ComparisonCategory = InferType<typeof ComparisonCategory>;

/**
 * The tool's maturity label, shown as `pre-1.0` when its latest version is 0.x
 * or a 1.0.0 prerelease and its authors call it stable or say nothing.
 */
export const comparisonToolToMaturity = (
  tool: ComparisonTool,
): ComparisonMaturityLabel =>
  isBeforeOne(tool.latestVersion) &&
  (tool.maturity.label === "stable" || tool.maturity.label === "unclear")
    ? "pre-1.0"
    : tool.maturity.label;

export const comparisonToolToCategory = (
  tool: ComparisonTool,
): ComparisonCategory => {
  const maturity = comparisonToolToMaturity(tool);
  return criteriaToCategory(
    tool.criteria,
    tool.localFirstClaim !== null,
    isBeforeOne(tool.latestVersion) ||
      maturity === "pre-1.0" ||
      maturity === "alpha" ||
      maturity === "experimental",
  );
};

/** The category a discontinued tool fell in while it was active. */
export const discontinuedToolToCategory = (
  tool: DiscontinuedTool,
): ComparisonCategory =>
  criteriaToCategory(tool.criteria, tool.localFirstClaim !== null, false);

const criteriaToCategory = (
  criteria: ComparisonCriteria,
  claimsLocalFirst: boolean,
  unfinished: boolean,
): ComparisonCategory => {
  const value = (key: keyof ComparisonCriteria) => criteria[key].value;
  // `n/a` for keys means the tool has no notion of users, so no account
  // decides who the user is.
  if (
    comparisonCriteria.every(
      ([key]) =>
        value(key) === "meets" ||
        (key === "keysNotAccounts" && value(key) === "n/a"),
    )
  )
    return unfinished ? "Not local-first yet" : "Local-first";
  if (claimsLocalFirst)
    return value("offline") !== "meets" ||
      value("devicePrimary") === "misses" ||
      value("e2ee") === "misses" ||
      value("openSource") !== "meets"
      ? "Marketed as local-first"
      : "Not local-first yet";
  return value("offline") === "meets" ? "Offline-first" : "Sync engine";
};

// Semantic versioning: "Major version zero (0.y.z) is for initial
// development", and so is a prerelease of 1.0.0.
const isBeforeOne = (version: ComparisonVersion | null): boolean => {
  if (version === null) return false;
  const match = versionPattern.exec(version);
  assert(match !== null, "A ComparisonVersion matches its pattern.");
  const [major, minor, patch] = [match[1], match[2], match[3] ?? "0"].map(
    Number,
  );
  return (
    major === 0 ||
    (major === 1 && minor === 0 && patch === 0 && match[4] !== undefined)
  );
};
