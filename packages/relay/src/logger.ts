import { createConsoleWithTime } from "@evolu/common";

/**
 * Logger instance for the Evolu Relay server.
 *
 * Provides console-based logging functionality throughout the relay
 * application.
 */
export const logger = createConsoleWithTime({ timestampType: "absolute" });
