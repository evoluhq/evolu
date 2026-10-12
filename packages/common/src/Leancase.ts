/**
 * Leancase, a minimal writing style as a normal form.
 *
 * Leancase marks each boundary once. A line break already ends a sentence, so a
 * final period repeats it. A period between sentences already starts the next
 * one, so a capital letter repeats it. Leancase drops the repeats and, for a
 * uniform look, every other capital letter too:
 *
 * - Everything is lowercase, including sentence starts, names, acronyms, and the
 *   pronoun I.
 * - Code in backticks or a code fence, URLs with a scheme, @handles, and
 *   #hashtags keep their case, because changing it can break them or change
 *   their meaning.
 * - A line that ends a sentence has no final period, but an ellipsis stays.
 *   Periods between sentences on the same line stay.
 * - Nothing else changes: wording, other punctuation, whitespace, and line breaks
 *   stay.
 *
 * {@link leancase} converts plain text, such as a post or a chat message, where
 * every line break is a visible one. Converting leancase text again changes
 * nothing, so leancase text is exactly the text {@link leancase} leaves
 * unchanged, and {@link LeancasedString} validates it that way.
 *
 * Markdown is not supported. A soft line break inside a Markdown paragraph
 * renders as a space, so removing the period before it would merge two
 * sentences.
 *
 * Leancase is experimental. Its rules may change in a minor or patch release.
 *
 * ### Example
 *
 * ```ts
 * import { assertEqual, leancase } from "@evolu/common";
 *
 * const docs = "https://evolu.dev/docs/api-reference/common/Leancase";
 *
 * assertEqual(
 *   leancase(`I like Evolu. See ${docs}.\nThanks, @Steida.`),
 *   `i like evolu. see ${docs}\nthanks, @Steida`,
 * );
 * ```
 *
 * @module
 * @experimental
 */

import { err, ok } from "./Result.ts";
import { brand, type BrandFactory, String, type TypeError } from "./Type.ts";
import { formatLeancasedError } from "./intl/_en.ts";

/**
 * Error returned when {@link leancased} rejects a string.
 *
 * @experimental
 */
export interface LeancasedError extends TypeError<"Leancased"> {
  readonly value: string;
}

/**
 * Adds leancase validation to an existing string Type.
 *
 * A string is valid when {@link leancase} leaves it unchanged. Validation does
 * not modify the value.
 *
 * ### Example
 *
 * ```ts
 * import {
 *   assertErr,
 *   assertOk,
 *   leancased,
 *   maxLength,
 *   String,
 * } from "@evolu/common";
 *
 * const Post = leancased(maxLength(280)(String));
 *
 * assertOk(Post.fromUnknown("hello. world"), "hello. world");
 * assertErr(Post.fromUnknown("Hello. World."));
 * ```
 *
 * @experimental
 */
export const leancased: BrandFactory<"Leancased", string, LeancasedError> = (
  parent,
) =>
  brand(
    "Leancased",
    parent,
    (value) =>
      value === leancase(value)
        ? ok()
        : err<LeancasedError>({ type: "Leancased", value }),
    formatLeancasedError,
  );

/**
 * A {@link String} in leancase.
 *
 * This Type validates that a string is already in leancase; it does not modify
 * the value. Use {@link leancase} to convert a string.
 *
 * ### Example
 *
 * ```ts
 * import { assertErr, assertOk, LeancasedString } from "@evolu/common";
 *
 * assertOk(LeancasedString.fromUnknown("hello. world"), "hello. world");
 * assertErr(LeancasedString.fromUnknown("Hello. World."));
 * ```
 *
 * @experimental
 */
export const LeancasedString = /*#__PURE__*/ leancased(String);
export type LeancasedString = typeof LeancasedString.Output;

/**
 * Converts plain text to leancase and returns a {@link LeancasedString}.
 *
 * A line is the text between line breaks (`\r\n`, `\n`, or `\r`). Each piece of
 * text outside the following parts is lowercased on its own with JavaScript's
 * Unicode mapping, without locale-specific rules, so a context-dependent
 * mapping such as the Greek final sigma does not look across a part:
 *
 * - Inline code is a run of backticks closed by a run of the same length on the
 *   same line. An unmatched run is text.
 * - A fenced code block starts with a line of up to three spaces, three or more
 *   backticks, and no other backtick. It ends with a line of up to three
 *   spaces, at least as many backticks, and only spaces or tabs, or at the end
 *   of the text.
 * - A URL starts with a scheme, a letter `a` to `z` in any case followed by such
 *   letters, digits, `+`, and `-`, then `://`, such as `https://`. It can
 *   follow any character, such as Japanese text without a space, and ends
 *   before whitespace, a backtick, or an angle bracket. Trailing `.`, `,`, `:`,
 *   `;`, `!`, `?`, quotes, `*`, `_`, `~`, and closing brackets without a
 *   matching opening bracket are not part of it.
 * - A handle is `@` and a hashtag is `#`, followed by letters, marks, digits, and
 *   underscores. Neither starts after a letter, mark, digit, or underscore, so
 *   emails and `C#` are lowercased, and neither runs into `://`, so a URL right
 *   after `@` or `#` keeps its case.
 *
 * Bare domains have no scheme, so they are lowercased with their paths.
 *
 * Each line ends with a run of periods, whitespace, and closing marks (`)`,
 * `]`, `"`, `'`, `”`, `’`, `*`, and `_`) outside these parts. When the run
 * follows other content, every period in it is removed, except two or more
 * periods in a row, such as an ellipsis, and a period between a handle or
 * hashtag and `_`, because removing it would extend the handle or hashtag. An
 * abbreviation that ends a line loses its period too. A line with nothing but
 * such a run ends no sentence and stays unchanged.
 *
 * ### Example
 *
 * ```ts
 * import { assertEqual, leancase } from "@evolu/common";
 *
 * assertEqual(
 *   leancase("Call `leancase()`. Done.\n(An aside.)\nWait..."),
 *   "call `leancase()`. done\n(an aside)\nwait...",
 * );
 * assertEqual(
 *   leancase("Thanks @Evolu for #LocalFirst."),
 *   "thanks @Evolu for #LocalFirst",
 * );
 * ```
 *
 * @experimental
 */
export const leancase = (value: string): LeancasedString => {
  const parts = value.split(lineBreakPattern);
  let result = "";
  let fenceLength = 0;

  for (const [index, part] of parts.entries()) {
    // Split with a capturing group alternates lines and line breaks.
    if (index % 2 === 1) {
      result += part;
    } else if (fenceLength > 0) {
      const closingLength = closingFencePattern.exec(part)?.[1]?.length ?? 0;
      if (closingLength >= fenceLength) fenceLength = 0;
      result += part;
    } else {
      fenceLength = openingFencePattern.exec(part)?.[1]?.length ?? 0;
      result += fenceLength > 0 ? part : leancaseLine(part);
    }
  }

  return result as LeancasedString;
};

const lineBreakPattern = /(\r\n|\n|\r)/u;
const openingFencePattern = /^ {0,3}(`{3,})[^`]*$/u;
const closingFencePattern = /^ {0,3}(`{3,})[ \t]*$/u;
const wordCharacterAtEndPattern = /[\p{L}\p{M}\p{N}_]$/u;
const tagPattern = /[@#][\p{L}\p{M}\p{N}_]+/uy;

// The `i` flag also matches the Kelvin sign, which lowercases to an ASCII `k`,
// so a scheme starts at the same place before and after lowercasing.
const urlPattern = /[a-z][a-z\d+-]*:\/\/[^\s<>`]*/iuy;
const schemeRunPattern = /[a-z][a-z\d+-]*/iuy;

const leancaseLine = (line: string): string => {
  const codeSpanEndByStart = codeSpanEnds(line);
  let result = "";
  let textStart = 0;
  let index = 0;

  while (index < line.length) {
    const char = line.charAt(index);
    let end: number | undefined;

    if (char === "`") {
      end = codeSpanEndByStart.get(index);
      if (end === undefined) {
        // An unmatched run is text as a whole, so none of its backticks opens
        // a shorter code span.
        index += backtickRunLength(line, index);
        continue;
      }
    } else if (char === "@" || char === "#") {
      // Two code units hold the previous code point even when it is a
      // surrogate pair.
      const previous = line.slice(Math.max(0, index - 2), index);
      tagPattern.lastIndex = index;
      if (
        !wordCharacterAtEndPattern.test(previous) &&
        tagPattern.test(line) &&
        !line.startsWith("://", tagPattern.lastIndex)
      ) {
        end = tagPattern.lastIndex;
        // The period stays with the tag, because removing it as a final
        // period would join the tag and `_`.
        if (line.startsWith("._", end)) end += 1;
      }
    } else {
      end = urlEnd(line, index);
      schemeRunPattern.lastIndex = index;
      if (end === undefined && schemeRunPattern.test(line)) {
        // A scheme must reach the end of its run, so when no URL starts at the
        // beginning of a run, none starts later in it.
        index = schemeRunPattern.lastIndex;
        continue;
      }
    }

    if (end === undefined) {
      index += 1;
    } else {
      result +=
        line.slice(textStart, index).toLowerCase() + line.slice(index, end);
      index = textStart = end;
    }
  }

  return (
    result +
    removeFinalPeriods(line.slice(textStart), textStart > 0).toLowerCase()
  );
};

const backtickRunLength = (line: string, start: number): number => {
  let end = start;
  while (line.charAt(end) === "`") end += 1;
  return end - start;
};

// Maps the start of each backtick run to the end of the next run of the same
// length, so matching all runs takes one pass instead of a scan per run.
const codeSpanEnds = (line: string): ReadonlyMap<number, number> => {
  const runs: Array<readonly [start: number, length: number]> = [];
  for (let index = line.indexOf("`"); index !== -1;) {
    const length = backtickRunLength(line, index);
    runs.push([index, length]);
    index = line.indexOf("`", index + length);
  }

  const endByStart = new Map<number, number>();
  const nextEndByLength = new Map<number, number>();
  for (const [start, length] of runs.toReversed()) {
    const end = nextEndByLength.get(length);
    if (end !== undefined) endByStart.set(start, end);
    nextEndByLength.set(length, start + length);
  }
  return endByStart;
};

const urlTrailingPunctuation = ".,:;!?\"'”’*_~";
const openingBracketByClosing: ReadonlyMap<string, string> = new Map([
  [")", "("],
  ["]", "["],
  ["}", "{"],
]);

const urlEnd = (line: string, start: number): number | undefined => {
  urlPattern.lastIndex = start;
  if (!urlPattern.test(line)) return undefined;

  const url = line.slice(start, urlPattern.lastIndex);
  const unmatchedClosingBrackets = new Map(
    [...openingBracketByClosing].map(([closing, opening]) => [
      closing,
      count(url, closing) - count(url, opening),
    ]),
  );

  let end = url.length;
  for (;;) {
    const char = url.charAt(end - 1);
    const unmatched = unmatchedClosingBrackets.get(char) ?? 0;
    if (urlTrailingPunctuation.includes(char)) {
      end -= 1;
    } else if (unmatched > 0) {
      unmatchedClosingBrackets.set(char, unmatched - 1);
      end -= 1;
    } else {
      return start + end;
    }
  }
};

const count = (value: string, char: string): number =>
  value.split(char).length - 1;

const finalRunCharacterPattern = /[.\s)\]"'”’*_]/u;
const singlePeriodPattern = /(?<!\.)\.(?!\.)/gu;

const removeFinalPeriods = (text: string, followsContent: boolean): string => {
  let runStart = text.length;
  while (
    runStart > 0 &&
    finalRunCharacterPattern.test(text.charAt(runStart - 1))
  )
    runStart -= 1;

  // A line without content ends no sentence. Emptying it would also merge a
  // preceding `\r` and a following `\n` into one line break.
  if (runStart === 0 && !followsContent) return text;

  return (
    text.slice(0, runStart) +
    text.slice(runStart).replaceAll(singlePeriodPattern, "")
  );
};
