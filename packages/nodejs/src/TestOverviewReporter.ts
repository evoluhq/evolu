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
 * files are printed after the failed tests; output of other files is omitted.
 * Durations longer than 300 ms are highlighted when terminal colors are
 * supported.
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
  const failureDurationByFile = new Map<string, number>();
  let hasFailures = false;

  const captureEvents = async function* (): AsyncGenerator<TestEvent, void> {
    for await (const event of source) {
      // File summaries do not identify failed files: a file that fails to load
      // or exits early reports no summary, and a file that exits with a nonzero
      // code reports its failure after a successful summary. A file's own
      // failure comes after the file exits, so its last failure has the file's
      // duration.
      if (event.type === "test:fail") {
        hasFailures = true;
        if (event.data.file !== undefined) {
          failureDurationByFile.set(
            resolve(event.data.file),
            event.data.details.duration_ms,
          );
        }
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
      failureDurationByFile.has(file),
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
        passed: success && !failureDurationByFile.has(file),
        tests: `${counts.tests} ${counts.tests === 1 ? "test" : "tests"}`,
      }),
    ),
    ...Array.from(failureDurationByFile)
      .filter(([file]) => !summaryByFile.has(file))
      .map(([file, durationMs]) => ({
        durationMs,
        file,
        passed: false,
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
