import {
  assertType,
  ByteSizeLiteral,
  ByteSizeLiteralBytes,
  ByteSizeLiteralKiB,
  Digit,
  Digit1To9,
  Digit1To59,
  DurationLiteral,
  DurationLiteralSeconds,
  PercentageLiteral,
  localizeTypes,
  object,
  type ByteSizeLiteralError,
  type DurationLiteralError,
  type PercentageLiteralError,
} from "@evolu/common";
import { cs } from "@evolu/common/intl";

assertType<
  (typeof ByteSizeLiteralBytes.members)[0]["parts"][0],
  typeof Digit
>();
assertType<
  (typeof ByteSizeLiteralKiB.members)[0]["parts"][0],
  typeof Digit1To9
>();
assertType<
  (typeof DurationLiteralSeconds.members)[0]["parts"][0],
  typeof Digit1To59
>();
assertType<(typeof ByteSizeLiteralKiB.members)[5]["parts"][1], ".5KiB">();

const size: typeof ByteSizeLiteral.Input = "1MiB";
const duration: typeof DurationLiteral.Input = "1.5s";
const percentage: typeof PercentageLiteral.Input = "12.5%";
ByteSizeLiteral.to(size);
DurationLiteral.to(duration);
PercentageLiteral.to(percentage);

// @ts-expect-error ByteSizeLiteral Input rejects decimal units such as "1MB".
const _invalidSize: typeof ByteSizeLiteral.Input = "1MB";
// @ts-expect-error DurationLiteral Input rejects the redundant "60s" spelling.
const _invalidDuration: typeof DurationLiteral.Input = "60s";
// @ts-expect-error PercentageLiteral Input rejects percentages above 100.
const _invalidPercentage: typeof PercentageLiteral.Input = "101%";

const invalidSize = ByteSizeLiteral.fromUnknown("1MB");
if (!invalidSize.ok)
  assertType<typeof invalidSize.error, ByteSizeLiteralError>();
const invalidDuration = DurationLiteral.fromUnknown("60s");
if (!invalidDuration.ok)
  assertType<typeof invalidDuration.error, DurationLiteralError>();
const invalidPercentage = PercentageLiteral.fromUnknown("101%");
if (!invalidPercentage.ok)
  assertType<typeof invalidPercentage.error, PercentageLiteralError>();

localizeTypes(
  {
    Settings: object({
      size: ByteSizeLiteral,
      duration: DurationLiteral,
      percentage: PercentageLiteral,
    }),
  },
  {
    cs: {
      Object: cs.formatObjectError,
      ByteSizeLiteral: cs.formatByteSizeLiteralError,
      DurationLiteral: cs.formatDurationLiteralError,
      PercentageLiteral: cs.formatPercentageLiteralError,
    },
  },
);
