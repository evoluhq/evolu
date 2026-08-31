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

import { relative } from "node:path";
import { dot, spec, type TestEvent } from "node:test/reporters";
import { styleText } from "node:util";

const slowTestThresholdMs = 300;

/**
 * Lists test files slowest-first and preserves Node.js failure diagnostics, run
 * totals, and coverage output.
 *
 * Durations longer than 300 ms are highlighted when terminal colors are
 * supported.
 */
const testOverviewReporter = async function* (
  source: AsyncIterable<TestEvent> | Iterable<TestEvent>,
): AsyncGenerator<string | Uint8Array, void> {
  const fileSummaries: Array<
    Extract<TestEvent, { readonly type: "test:summary" }>["data"] & {
      readonly file: string;
    }
  > = [];
  const dotOutput: Array<string> = [];
  const specEvents: Array<TestEvent> = [];
  let hasFailures = false;

  const captureEvents = async function* (): AsyncGenerator<TestEvent, void> {
    for await (const event of source) {
      if (event.type === "test:fail") hasFailures = true;

      if (event.type === "test:summary" && event.data.file !== undefined) {
        fileSummaries.push({ ...event.data, file: event.data.file });
      }

      if (event.type === "test:coverage" || event.type === "test:diagnostic") {
        specEvents.push(event);
      }

      yield event;
    }
  };

  for await (const output of dot(captureEvents())) dotOutput.push(output);

  fileSummaries.sort((a, b) => b.duration_ms - a.duration_ms);

  if (hasFailures) {
    for (const output of dotOutput) yield output;
  }

  if (fileSummaries.length > 0) {
    yield `${styleText("bold", "Test files:")}\n\n`;

    for (const { counts, duration_ms, file, success } of fileSummaries) {
      const testLabel = counts.tests === 1 ? "test" : "tests";
      const status = styleText(success ? "green" : "red", success ? "✔" : "✖");
      const tests = styleText("dim", `(${counts.tests} ${testLabel})`);
      const duration = styleText(
        duration_ms > slowTestThresholdMs ? "yellow" : "green",
        `${Math.round(duration_ms)}ms`,
      );
      yield `${status} ${relative(process.cwd(), file)} ${tests} ${duration}\n`;
    }

    yield "\n";
  }

  const summaryReporter = spec();
  for (const event of specEvents) summaryReporter.write(event);
  summaryReporter.end();
  yield* summaryReporter;
};

export default testOverviewReporter;
