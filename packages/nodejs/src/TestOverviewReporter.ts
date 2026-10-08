/**
 * Overview reporting for Node.js tests.
 *
 * Use the dedicated `@evolu/nodejs/TestOverviewReporter` entry point directly
 * with Node.js:
 *
 * ```sh
 * node --test --test-reporter=@evolu/nodejs/TestOverviewReporter
 * ```
 *
 * @module
 */

import { relative, resolve } from "node:path";
import { dot, spec, type TestEvent } from "node:test/reporters";
import { styleText } from "node:util";

const slowTestThresholdMs = 300;

/**
 * Lists test files slowest-first and preserves Node.js failure diagnostics, run
 * totals, and coverage output.
 *
 * A test file is listed as failed when any of its tests fail or the file itself
 * fails, such as to load. Standard output and standard error of failed test
 * files are printed after the failed tests; output of other files is omitted. A
 * file that reports no tests, such as one without tests or one that exits
 * before its tests finish, is listed as `(no tests reported)`; Node.js counts
 * it as passed when it exits with code 0. Durations longer than 300 ms are
 * highlighted when terminal colors are supported.
 */
const testOverviewReporter = async function* (
  source: AsyncIterable<TestEvent> | Iterable<TestEvent>,
): AsyncGenerator<string | Uint8Array, void> {
  const summaryByFile = new Map<
    string,
    Extract<TestEvent, { readonly type: "test:summary" }>["data"]
  >();
  const dotOutput: Array<string> = [];
  const specEvents: Array<TestEvent> = [];
  const outputByFile = new Map<string, string>();
  const resultDurationByFile = new Map<string, number>();
  const failedFiles = new Set<string>();
  let hasFailures = false;

  const captureEvents = async function* (): AsyncGenerator<TestEvent, void> {
    for await (const event of source) {
      if (event.type === "test:fail") hasFailures = true;

      // File summaries do not cover every file: a file that defines no tests,
      // fails to load, or exits early reports no summary, and a file that exits
      // with a nonzero code reports its failure after a successful summary. A
      // file's own result comes after the file exits, so its last result has
      // the file's duration.
      if (
        (event.type === "test:pass" || event.type === "test:fail") &&
        event.data.file !== undefined
      ) {
        const file = resolve(event.data.file);
        resultDurationByFile.set(file, event.data.details.duration_ms);
        if (event.type === "test:fail") failedFiles.add(file);
      }

      // Output reports the file path given on the command line, while
      // failures report the absolute path.
      if (event.type === "test:stdout" || event.type === "test:stderr") {
        const file = resolve(event.data.file);
        outputByFile.set(
          file,
          (outputByFile.get(file) ?? "") + event.data.message,
        );
      }

      if (event.type === "test:summary" && event.data.file !== undefined) {
        summaryByFile.set(resolve(event.data.file), event.data);
      }

      if (event.type === "test:coverage" || event.type === "test:diagnostic") {
        specEvents.push(event);
      }

      yield event;
    }
  };

  for await (const output of dot(captureEvents())) dotOutput.push(output);

  if (hasFailures) {
    for (const output of dotOutput) yield output;

    const failedFileOutputs = Array.from(outputByFile).filter(([file]) =>
      failedFiles.has(file),
    );

    if (failedFileOutputs.length > 0) {
      yield `\n${styleText("bold", "Output of failed test files:")}\n\n`;

      for (const [file, output] of failedFileOutputs) {
        yield `${styleText("red", "✖")} ${relative(process.cwd(), file)}\n`;
        yield `${output.trimEnd().replaceAll(/^(?=.)/gmu, "  ")}\n\n`;
      }
    }
  }

  const testFiles = [
    ...Array.from(
      summaryByFile,
      ([file, { counts, duration_ms, success }]) => ({
        durationMs: duration_ms,
        file,
        passed: success && !failedFiles.has(file),
        tests: `${counts.tests} ${counts.tests === 1 ? "test" : "tests"}`,
      }),
    ),
    ...Array.from(resultDurationByFile)
      .filter(([file]) => !summaryByFile.has(file))
      .map(([file, durationMs]) => ({
        durationMs,
        file,
        passed: !failedFiles.has(file),
        tests: "no tests reported",
      })),
  ].toSorted((a, b) => b.durationMs - a.durationMs);

  if (testFiles.length > 0) {
    yield `${styleText("bold", "Test files:")}\n\n`;

    for (const { durationMs, file, passed, tests } of testFiles) {
      const status = styleText(passed ? "green" : "red", passed ? "✔" : "✖");
      const duration = styleText(
        durationMs > slowTestThresholdMs ? "yellow" : "green",
        `${Math.round(durationMs)}ms`,
      );
      yield `${status} ${relative(process.cwd(), file)} ${styleText("dim", `(${tests})`)} ${duration}\n`;
    }

    yield "\n";
  }

  const summaryReporter = spec();
  for (const event of specEvents) summaryReporter.write(event);
  summaryReporter.end();
  yield* summaryReporter;
};

export default testOverviewReporter;
