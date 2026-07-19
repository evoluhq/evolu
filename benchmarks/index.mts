import { parseArgs } from "node:util";

/**
 * Defines the mutually exclusive execution modes shared by benchmark suites.
 *
 * `default` measures current performance and fails on regression.
 * `update-baseline` updates only when performance passes, while
 * `force-update-baseline` accepts an intentional regression.
 */
export type BenchmarkMode =
  "default" | "update-baseline" | "force-update-baseline";

export interface ParseBenchmarkModeOptions {
  readonly args: ReadonlyArray<string>;
  readonly benchmarkName: string;
}

const benchmarkModes: ReadonlyArray<BenchmarkMode> = [
  "default",
  "update-baseline",
  "force-update-baseline",
];

export const parseBenchmarkMode = ({
  args,
  benchmarkName,
}: ParseBenchmarkModeOptions): BenchmarkMode => {
  const { tokens, values } = parseArgs({
    args: [...args],
    options: {
      mode: {
        default: "default",
        type: "string",
      },
    },
    strict: true,
    tokens: true,
  });
  if (tokens.filter((token) => token.kind === "option").length > 1) {
    throw new Error(`The ${benchmarkName} benchmark accepts only one mode.`);
  }

  const mode = values.mode;
  if (!benchmarkModes.includes(mode as BenchmarkMode)) {
    throw new Error(`Unknown ${benchmarkName} benchmark mode: ${mode}`);
  }
  return mode as BenchmarkMode;
};
