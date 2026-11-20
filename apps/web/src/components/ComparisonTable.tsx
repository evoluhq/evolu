import clsx from "clsx";
import Link from "next/link";
import type { FC, ReactNode } from "react";

import {
  comparison,
  type ComparisonCategory,
  comparisonCheckedOn,
  comparisonCriteria,
  type ComparisonCriteria,
  type ComparisonCriterionValue,
  type ComparisonEvidence,
  comparisonMarkSymbols,
  comparisonToolToCategory,
  comparisonToolToMaturity,
  discontinuedToolToCategory,
  type LocalFirstClaim,
} from "@/comparison/comparison";

/** Lists the tools of one category with the evidence for each mark. */
export const ComparisonTable: FC<{ category: ComparisonCategory }> = ({
  category,
}) => {
  const tools = comparison.tools.filter(
    (tool) => comparisonToolToCategory(tool) === category,
  );
  return (
    <Rows
      label={`${category} tools`}
      count={tools.length}
      lastColumn="Maturity"
    >
      {tools.map((tool) => (
        <Row
          key={tool.name}
          name={tool.name}
          criteria={tool.criteria}
          lastColumn={comparisonToolToMaturity(tool)}
        >
          <Claim claim={tool.localFirstClaim} />
          <CriteriaList criteria={tool.criteria} />
          <p>
            <strong>Maturity:</strong> {comparisonToolToMaturity(tool)}
            {tool.latestVersion && <>, latest release {tool.latestVersion}</>}
            {tool.maturity.note !== null && (
              <>
                . {tool.maturity.note} <Source href={tool.maturity.source} />
              </>
            )}
          </p>
          <Conflicts conflicts={tool.conflicts} />
          <Website url={tool.url} />
        </Row>
      ))}
    </Rows>
  );
};

/** The date the comparison data was last checked. */
export const ComparisonCheckedOn: FC = () => comparisonCheckedOn;

/** Lists discontinued tools with what ended them and their last marks. */
export const DiscontinuedTable: FC = () => (
  <Rows
    label="Discontinued tools"
    count={comparison.discontinued.length}
    lastColumn="Ended"
  >
    {comparison.discontinued.map((tool) => (
      <Row
        key={tool.name}
        name={tool.name}
        criteria={tool.criteria}
        lastColumn={tool.ended.date}
      >
        <p>{tool.whatItWas}</p>
        <p>
          <strong>Ended:</strong> {tool.ended.summary}{" "}
          <Source href={tool.ended.source} />
        </p>
        {tool.successor !== null && (
          <p>
            <strong>Successor:</strong> {tool.successor}
          </p>
        )}
        <p>
          <strong>While active:</strong> {discontinuedToolToCategory(tool)}
        </p>
        <Claim claim={tool.localFirstClaim} />
        <CriteriaList criteria={tool.criteria} />
        <Conflicts conflicts={tool.conflicts} />
        <Website url={tool.url} />
      </Row>
    ))}
  </Rows>
);

const gridColumns =
  "grid grid-cols-[minmax(0,1fr)_repeat(8,1.25rem)_1rem] items-center gap-x-1 sm:grid-cols-[minmax(0,1fr)_repeat(8,1.75rem)_6.5rem_1rem]";

const Rows: FC<{
  label: string;
  count: number;
  lastColumn: string;
  children: ReactNode;
}> = ({ label, count, lastColumn, children }) => (
  <div className="not-prose my-6 text-sm" role="group" aria-label={label}>
    <div
      className={clsx(
        gridColumns,
        "border-b border-zinc-900/10 pb-2 font-semibold text-zinc-900 dark:border-white/10 dark:text-white",
      )}
      aria-hidden="true"
    >
      <span>
        Name <span className="font-normal text-zinc-500">({count})</span>
      </span>
      {comparisonCriteria.map(([key, title], index) => (
        <span key={key} title={title} className="text-center">
          {index + 1}
        </span>
      ))}
      <span className="hidden sm:block">{lastColumn}</span>
    </div>
    <div className="divide-y divide-zinc-900/5 dark:divide-white/5">
      {children}
    </div>
  </div>
);

const Row: FC<{
  name: string;
  criteria: ComparisonCriteria;
  lastColumn: string;
  children: ReactNode;
}> = ({ name, criteria: toolCriteria, lastColumn, children }) => (
  <details className="group">
    <summary
      className={clsx(
        gridColumns,
        "cursor-pointer list-none py-2 text-zinc-700 hover:bg-zinc-50 dark:text-zinc-300 dark:hover:bg-white/2.5 [&::-webkit-details-marker]:hidden",
      )}
    >
      <span className="font-medium break-words text-zinc-900 dark:text-white">
        {name}
      </span>
      {comparisonCriteria.map(([key, title]) => (
        <Mark
          key={key}
          value={toolCriteria[key].value}
          label={`${title}: ${markLabels[toolCriteria[key].value]}`}
          className="text-center"
        />
      ))}
      <span className="hidden truncate text-zinc-500 sm:block dark:text-zinc-400">
        {lastColumn}
      </span>
      <span
        aria-hidden="true"
        className="text-zinc-400 transition-transform group-open:rotate-90"
      >
        ›
      </span>
    </summary>
    <div className="space-y-3 pt-1 pb-4 leading-6 break-words text-zinc-600 dark:text-zinc-400 [&_strong]:font-semibold [&_strong]:text-zinc-900 dark:[&_strong]:text-white">
      {children}
    </div>
  </details>
);

// Each light-mode color has at least 4.5:1 contrast on white, the minimum for
// small text.
const markColors = {
  meets: "text-emerald-700 dark:text-emerald-400",
  partial: "text-amber-700 dark:text-amber-400",
  misses: "text-rose-600 dark:text-rose-400",
  "n/a": "text-zinc-500 dark:text-zinc-400",
  unclear: "text-zinc-500 dark:text-zinc-400",
} as const satisfies Record<ComparisonCriterionValue, string>;

const markLabels = {
  meets: "meets",
  partial: "partly, which counts as missing",
  misses: "misses",
  "n/a": "no users, which passes",
  unclear: "unclear",
} as const satisfies Record<ComparisonCriterionValue, string>;

// The page renders over two thousand marks, so each stays small: the symbol
// for the eye and the value in words for screen readers.
const Mark: FC<{
  value: ComparisonCriterionValue;
  label: string;
  className?: string;
}> = ({ value, label, className }) => (
  <span className={clsx(markColors[value], className)}>
    <span aria-hidden="true">{comparisonMarkSymbols[value]}</span>
    <span className="sr-only">{label}</span>
  </span>
);

const Claim: FC<{ claim: LocalFirstClaim }> = ({ claim }) =>
  claim ? (
    <p>
      <strong>Calls itself local-first:</strong> “{claim.quote}”
      {claim.translation !== undefined && (
        <>, which translates as “{claim.translation}”</>
      )}{" "}
      <Source href={claim.source} />
    </p>
  ) : (
    <p>
      <strong>Doesn’t call itself local-first.</strong>
    </p>
  );

const CriteriaList: FC<{ criteria: ComparisonCriteria }> = ({
  criteria: toolCriteria,
}) => (
  <ul className="space-y-2">
    {comparisonCriteria.map(([key, title]) => (
      <li key={key} className="flex gap-2">
        <Mark
          value={toolCriteria[key].value}
          label={`${markLabels[toolCriteria[key].value]}:`}
          className="w-4 shrink-0"
        />
        <span className="min-w-0">
          <strong>{title}.</strong> {toolCriteria[key].evidence}{" "}
          <Source href={toolCriteria[key].source} />
        </span>
      </li>
    ))}
  </ul>
);

const Conflicts: FC<{ conflicts: ComparisonEvidence }> = ({ conflicts }) => (
  <p>
    <strong>Conflicts:</strong> {conflicts.value}. {conflicts.evidence}{" "}
    <Source href={conflicts.source} />
  </p>
);

// External links are plain anchors: as next/link, the page's roughly 1,500 of
// them would each hydrate on the client and enlarge its payload.
const Website: FC<{ url: string }> = ({ url }) => (
  <p>
    <a
      href={url}
      className="font-medium text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-500"
    >
      Website
    </a>
  </p>
);

const sourceClassName =
  "whitespace-nowrap text-zinc-500 underline decoration-zinc-500/30 hover:text-zinc-900 dark:text-zinc-500 dark:hover:text-white";

const Source: FC<{ href: string }> = ({ href }) =>
  href.startsWith("/") ? (
    <Link href={href} className={sourceClassName}>
      (evolu.dev)
    </Link>
  ) : (
    <a href={href} className={sourceClassName}>
      ({new URL(href).hostname})
    </a>
  );
