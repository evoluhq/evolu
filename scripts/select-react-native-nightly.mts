/**
 * Protects daytime Release pushes from React Native nightly macOS jobs. GitHub
 * schedules have started several hours late, so the scheduled jobs may run only
 * outside 07:00–17:00 UTC. A manual dispatch deliberately overrides the
 * quiet-hours check; a fork never starts the expensive jobs.
 */
import { appendFileSync } from "node:fs";

export const shouldRunReactNativeNightly = ({
  event,
  repository,
  now,
}: {
  event: string;
  repository: string;
  now: Date;
}): boolean => {
  if (repository !== "evoluhq/evolu") return false;
  if (event === "workflow_dispatch") return true;
  if (event !== "schedule") return false;
  const hour = now.getUTCHours();
  return hour < 7 || hour >= 17;
};

if (import.meta.main) {
  const run = shouldRunReactNativeNightly({
    event: process.env.GITHUB_EVENT_NAME ?? "",
    repository: process.env.GITHUB_REPOSITORY ?? "",
    now: new Date(),
  });
  const output = `run=${run}\n`;
  const { GITHUB_OUTPUT } = process.env;
  if (GITHUB_OUTPUT == null) process.stdout.write(output);
  else appendFileSync(GITHUB_OUTPUT, output);
}
