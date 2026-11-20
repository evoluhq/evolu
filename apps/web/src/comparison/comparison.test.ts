import { assertEqual } from "@evolu/common";
import { describe, it } from "node:test";
import {
  type ComparisonCategory,
  comparisonCriteria,
  type ComparisonCriteria,
  type ComparisonCriterionValue,
  type ComparisonMaturityLabel,
  type ComparisonTool,
  ComparisonVersion,
  comparisonToolToCategory,
  comparisonToolToMaturity,
  type DiscontinuedTool,
  discontinuedToolToCategory,
} from "./comparison.ts";

type CriteriaValues = Partial<
  Record<keyof ComparisonCriteria, ComparisonCriterionValue>
>;

const setupCriteria = (values: CriteriaValues): ComparisonCriteria =>
  Object.fromEntries(
    comparisonCriteria.map(([key]) => [
      key,
      { value: values[key] ?? "meets", evidence: "", source: "" },
    ]),
  ) as unknown as ComparisonCriteria;

const setupClaim = (claimsLocalFirst: boolean) =>
  claimsLocalFirst
    ? { quote: "local-first", source: "https://example.com" }
    : null;

const setupTool = ({
  criteria = {},
  label = "stable",
  latestVersion = "1.2.3",
  claimsLocalFirst = false,
}: {
  criteria?: CriteriaValues;
  label?: ComparisonMaturityLabel;
  latestVersion?: string | null;
  claimsLocalFirst?: boolean;
} = {}): ComparisonTool => ({
  name: "Tool",
  url: "https://example.com",
  localFirstClaim: setupClaim(claimsLocalFirst),
  criteria: setupCriteria(criteria),
  maturity: { label, note: null, source: "https://example.com" },
  latestVersion:
    latestVersion === null ? null : ComparisonVersion.orThrow(latestVersion),
  conflicts: { value: "Latest timestamp wins", evidence: "", source: "" },
});

const setupDiscontinuedTool = ({
  criteria = {},
  claimsLocalFirst = false,
}: {
  criteria?: CriteriaValues;
  claimsLocalFirst?: boolean;
} = {}): DiscontinuedTool => ({
  name: "Tool",
  url: "https://example.com",
  whatItWas: "",
  ended: { date: "2025-01", summary: "", source: "https://example.com" },
  successor: null,
  localFirstClaim: setupClaim(claimsLocalFirst),
  criteria: setupCriteria(criteria),
  conflicts: { value: "Latest timestamp wins", evidence: "", source: "" },
});

describe("comparisonToolToMaturity", () => {
  it("shows a 0.x tool its authors call stable or nothing as pre-1.0", () => {
    assertEqual(
      comparisonToolToMaturity(
        setupTool({ label: "stable", latestVersion: "0.4.0" }),
      ),
      "pre-1.0",
    );
    assertEqual(
      comparisonToolToMaturity(
        setupTool({ label: "unclear", latestVersion: "0.9" }),
      ),
      "pre-1.0",
    );
  });

  it("keeps the label of a 0.x tool its authors put in another stage", () => {
    assertEqual(
      comparisonToolToMaturity(
        setupTool({ label: "beta", latestVersion: "0.4.0" }),
      ),
      "beta",
    );
  });

  it("treats a 1.0.0 prerelease as before 1.0", () => {
    assertEqual(
      comparisonToolToMaturity(setupTool({ latestVersion: "1.0.0-rc.1" })),
      "pre-1.0",
    );
  });

  it("keeps the label of later versions, later prereleases and no version", () => {
    for (const latestVersion of ["1.2.3", "10.15", "2.0.0-beta.1", null])
      assertEqual(
        comparisonToolToMaturity(setupTool({ latestVersion })),
        "stable",
      );
  });
});

describe("comparisonToolToCategory", () => {
  const category = (tool: ComparisonTool): ComparisonCategory =>
    comparisonToolToCategory(tool);

  it("puts a finished tool that meets all eight criteria in Local-first", () => {
    assertEqual(category(setupTool()), "Local-first");
    assertEqual(
      category(setupTool({ criteria: { keysNotAccounts: "n/a" } })),
      "Local-first",
    );
  });

  it("puts an unfinished tool that meets all eight in Not local-first yet", () => {
    assertEqual(
      category(setupTool({ latestVersion: "0.4.0" })),
      "Not local-first yet",
    );
    assertEqual(
      category(setupTool({ label: "experimental" })),
      "Not local-first yet",
    );
    assertEqual(category(setupTool({ label: "alpha" })), "Not local-first yet");
    assertEqual(
      category(setupTool({ label: "pre-1.0", latestVersion: null })),
      "Not local-first yet",
    );
    assertEqual(
      category(setupTool({ label: "beta", latestVersion: "0.4.0" })),
      "Not local-first yet",
    );
  });

  it("puts a claimant that misses only what it could add in Not local-first yet", () => {
    for (const criteria of [
      { e2ee: "partial" },
      { devicePrimary: "partial" },
      { postQuantum: "misses" },
      { fullHistory: "misses" },
      { anyServer: "misses" },
    ] satisfies ReadonlyArray<CriteriaValues>)
      assertEqual(
        category(setupTool({ criteria, claimsLocalFirst: true })),
        "Not local-first yet",
      );
  });

  it("puts a claimant that a server decides or reads, or that isn't open source, in Marketed as local-first", () => {
    for (const criteria of [
      { offline: "partial" },
      { devicePrimary: "misses" },
      { e2ee: "misses" },
      { openSource: "partial" },
    ] satisfies ReadonlyArray<CriteriaValues>)
      assertEqual(
        category(setupTool({ criteria, claimsLocalFirst: true })),
        "Marketed as local-first",
      );
  });

  it("puts a tool that doesn't claim local-first in Offline-first or Sync engine", () => {
    assertEqual(
      category(setupTool({ criteria: { postQuantum: "misses" } })),
      "Offline-first",
    );
    assertEqual(
      category(setupTool({ criteria: { offline: "partial" } })),
      "Sync engine",
    );
  });

  it("counts n/a as passing only for keys", () => {
    assertEqual(
      category(setupTool({ criteria: { fullHistory: "n/a" } })),
      "Offline-first",
    );
  });
});

describe("discontinuedToolToCategory", () => {
  it("rates the tool as it was while active, without maturity", () => {
    assertEqual(
      discontinuedToolToCategory(setupDiscontinuedTool()),
      "Local-first",
    );
    assertEqual(
      discontinuedToolToCategory(
        setupDiscontinuedTool({
          criteria: { e2ee: "misses" },
          claimsLocalFirst: true,
        }),
      ),
      "Marketed as local-first",
    );
  });
});
