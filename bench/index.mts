import { parseArgs } from "node:util";
import { PositiveInt } from "@evolu/common";

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

// oxlint-disable-next-line unicorn/prefer-set-has -- Three fixed modes are checked once during process startup.
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

export interface ComparisonArgs {
  /** `--base-checkout=<dir>`: a checkout of another commit with its own install. */
  readonly baseCheckout: string | null;
  /** `--max-regression=<percent>`: the threshold of a comparison. */
  readonly maxRegressionPercent: PositiveInt | null;
  readonly otherArgs: ReadonlyArray<string>;
}

/**
 * Removes the options of a comparison with another version from `args`, so the
 * strict mode parser does not see them, and returns their values.
 */
export const parseComparisonArgs = (
  args: ReadonlyArray<string>,
  benchmarkName: string,
): ComparisonArgs => {
  const take = (name: string) => {
    const matches = args.filter(
      (arg) => arg === `--${name}` || arg.startsWith(`--${name}=`),
    );
    if (matches.length > 1) {
      throw new Error(
        `The ${benchmarkName} benchmark accepts only one --${name}.`,
      );
    }
    const value = matches.at(0)?.slice(`--${name}=`.length) ?? null;
    if (value === "") {
      throw new Error(`Pass a value as --${name}=<value>.`);
    }
    return value;
  };
  const baseCheckout = take("base-checkout");
  const maxRegression = take("max-regression");
  // Only decimal digits, so that 1e1 or 0x14 is not read as another number.
  if (maxRegression !== null && !/^[1-9][0-9]*$/u.test(maxRegression)) {
    throw new Error(
      `Pass --max-regression as a whole percentage, such as --max-regression=20, not ${maxRegression}.`,
    );
  }
  return {
    baseCheckout,
    maxRegressionPercent:
      maxRegression === null
        ? null
        : PositiveInt.orThrow(Number(maxRegression)),
    otherArgs: args.filter(
      (arg) => !/^--(base-checkout|max-regression)(=|$)/u.test(arg),
    ),
  };
};
