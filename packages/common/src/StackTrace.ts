/**
 * JavaScript stack trace parsing utilities.
 *
 * @module
 */

export interface StackTraceFrame {
  /** Function or frame label reported by the engine, if available. */
  readonly name: string | undefined;
  /** Basename of the source location without query or hash suffixes. */
  readonly sourceName: string;
  readonly location: string;
  readonly lineNumber: number;
  readonly columnNumber: number;
}

export interface StackTrace {
  readonly frames: ReadonlyArray<StackTraceFrame>;
  readonly names: ReadonlyArray<string>;
  readonly files: ReadonlyArray<string>;
  readonly sites: ReadonlyArray<string>;
}

export interface StackTraceOptions {
  readonly maxSourceLabelLineOffset?: number;
  readonly sourceLabel?: string;
  readonly sourceLabelsByLine?: Map<number, string>;
  readonly sourceNameAllowlist?: ReadonlySet<string>;
  readonly sourceName?: string;
}

/**
 * Parses V8, SpiderMonkey, and JavaScriptCore stack frames for tests.
 *
 * Warning: This is AI-slop containment code for tests, not production stack
 * trace parsing infrastructure.
 *
 * This is intentionally not a complete stack trace parser. It extracts only
 * frame names and source positions needed by async stack trace tests and
 * similar assertions that need stable, cross-engine stack evidence.
 */
export function parseStackTrace(
  stack: string | undefined,
  options?: StackTraceOptions,
): StackTrace;
export function parseStackTrace(
  run: () => Promise<never>,
  options?: StackTraceOptions,
): Promise<StackTrace>;
export function parseStackTrace(
  input: string | undefined | (() => Promise<never>),
  options: StackTraceOptions = {},
): StackTrace | Promise<StackTrace> {
  if (typeof input === "function")
    return (async () => {
      try {
        if (options.sourceLabel != null)
          parseStackTrace(new Error().stack, options);
        await input();
      } catch (error) {
        if (!(error instanceof Error)) throw error;

        const { sourceLabel: _sourceLabel, ...readOptions } = options;
        return parseStackTrace(error.stack, readOptions);
      }

      throw new Error("Stack trace capture must throw.");
    })();

  const frames = parseStackTraceFrames(input).filter(
    ({ sourceName }) =>
      options.sourceNameAllowlist == null ||
      options.sourceNameAllowlist.has(sourceName),
  );
  recordSourceLabel(frames, options);

  return {
    files: frames.map(({ sourceName }) => sourceName),
    frames,
    names: frames
      .map(({ name }) => name)
      .filter((name): name is string => name !== undefined),
    sites: sourceLabels(frames, options),
  };
}

const parseStackTraceFrames = (
  stack: string | undefined,
): ReadonlyArray<StackTraceFrame> =>
  (stack ?? "")
    .split("\n")
    .map(parseStackTraceLine)
    .filter((frame): frame is StackTraceFrame => frame !== undefined);

const recordSourceLabel = (
  frames: ReadonlyArray<StackTraceFrame>,
  { sourceLabel, sourceLabelsByLine, sourceName }: StackTraceOptions,
): void => {
  if (sourceLabel == null || sourceLabelsByLine == null || sourceName == null)
    return;

  const frame = frames.find((frame) => frame.sourceName === sourceName);
  if (frame == null) return;

  sourceLabelsByLine.set(frame.lineNumber, sourceLabel);
};

const sourceLabels = (
  frames: ReadonlyArray<StackTraceFrame>,
  {
    maxSourceLabelLineOffset = 8,
    sourceLabelsByLine,
    sourceName,
  }: StackTraceOptions,
): ReadonlyArray<string> => {
  if (sourceLabelsByLine == null || sourceName == null) return [];

  return frames.flatMap((frame) => {
    if (frame.sourceName !== sourceName) return [];

    for (let offset = 0; offset <= maxSourceLabelLineOffset; offset += 1) {
      const label = sourceLabelsByLine.get(frame.lineNumber - offset);
      if (label != null) return [label];
    }

    return [];
  });
};

const parseStackTraceLine = (line: string): StackTraceFrame | undefined => {
  const stackLine = parseStackLine(line);
  if (stackLine == null) return undefined;

  const location = parseStackLocation(stackLine.location);
  if (location == null) return undefined;

  return { ...location, name: stackLine.name };
};

const parseStackLine = (
  line: string,
):
  | { readonly name: string | undefined; readonly location: string }
  | undefined => {
  let text = line.trim();
  if (text === "") return undefined;

  if (text.startsWith("at ")) {
    text = text.slice(3);
    if (text.startsWith("async ")) text = text.slice(6);

    const locationStart = text.lastIndexOf("(");
    if (locationStart >= 0 && text.endsWith(")")) {
      const name = stackFrameName(text.slice(0, locationStart).trim());
      const location = text.slice(locationStart + 1, -1);
      return { name, location };
    }

    return { location: text, name: undefined };
  }

  if (text.startsWith("async*")) text = text.slice(6);

  const locationStart = text.indexOf("@");
  if (locationStart < 0) return { location: text, name: undefined };

  return {
    location: text.slice(locationStart + 1),
    name: stackFrameName(text.slice(0, locationStart)),
  };
};

const parseStackLocation = (
  location: string,
): Omit<StackTraceFrame, "name"> | undefined => {
  const columnStart = location.lastIndexOf(":");
  if (columnStart < 0) return undefined;

  const lineStart = location.lastIndexOf(":", columnStart - 1);
  if (lineStart < 0) return undefined;

  const pathEnd = Math.max(
    location.lastIndexOf("/"),
    location.lastIndexOf("\\"),
  );
  if (lineStart <= pathEnd) return undefined;

  const lineNumber = parseLeadingInt(location.slice(lineStart + 1));
  const columnNumber = parseLeadingInt(location.slice(columnStart + 1));
  if (lineNumber == null || columnNumber == null) return undefined;

  return {
    columnNumber,
    lineNumber,
    location,
    sourceName: stackTraceSourceName(location.slice(0, lineStart)),
  };
};

const stackTraceSourceName = (source: string): string => {
  const queryStart = source.indexOf("?");
  const hashStart = source.indexOf("#");
  const suffixStart =
    queryStart < 0
      ? hashStart
      : hashStart < 0
        ? queryStart
        : Math.min(queryStart, hashStart);
  const path = suffixStart < 0 ? source : source.slice(0, suffixStart);

  return path.slice(
    Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\")) + 1,
  );
};

const parseLeadingInt = (value: string): number | undefined => {
  let end = 0;
  while (end < value.length && isAsciiDigit(value.charCodeAt(end))) end += 1;
  if (end === 0) return undefined;

  return Number(value.slice(0, end));
};

const isAsciiDigit = (charCode: number): boolean =>
  charCode >= 48 && charCode <= 57;

const stackFrameName = (value: string): string | undefined => {
  while (value.endsWith("/<")) value = value.slice(0, -2);
  return value === "" ? undefined : value;
};
