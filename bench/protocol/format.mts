/** Report formatting shared by the protocol benchmarks. */

/** Left-aligns the first column and right-aligns the others. */
export const formatTable = (
  header: ReadonlyArray<string>,
  rows: ReadonlyArray<ReadonlyArray<string>>,
  indent = "  ",
): string => {
  const widths = header.map((cell, column) =>
    Math.max(cell.length, ...rows.map((row) => row[column]?.length ?? 0)),
  );
  return [header, ...rows]
    .map(
      (row) =>
        `${indent}${row
          .map((cell, column) =>
            column === 0
              ? cell.padEnd(widths[column])
              : cell.padStart(widths[column]),
          )
          .join("  ")
          .trimEnd()}\n`,
    )
    .join("");
};

export const formatGigabytes = (kibibytes: number): string =>
  `${((kibibytes * 1024) / 1e9).toFixed(2)} GB`;
