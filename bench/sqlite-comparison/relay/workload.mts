/**
 * The relay workload, which `@evolu/nodejs`'s move to Evolu's SQLite was timed
 * with: relay storage on a file, 50,000 messages of 100 to 1,000 bytes written
 * in batches of 500, 200 fingerprints over 16 buckets, iterating every
 * timestamp 5 times, and 10,000 random reads of a change. Sizes and reads come
 * from a seeded generator, so every run does the same work.
 *
 * @module
 */

export const relayWorkload = {
  messageCount: 50_000,
  batchSize: 500,
  minChangeBytes: 100,
  maxChangeBytes: 1000,
  bucketCount: 16,
  fingerprintRepeats: 200,
  iterateRepeats: 5,
  readCount: 10_000,
} as const;

export const relayPhases = ["write", "fingerprint", "iterate", "read"] as const;
export type RelayPhase = (typeof relayPhases)[number];

export const relayPhaseLabels: Readonly<Record<RelayPhase, string>> = {
  write: `${relayWorkload.messageCount} writes in batches of ${relayWorkload.batchSize}`,
  fingerprint: `${relayWorkload.fingerprintRepeats} fingerprints of ${relayWorkload.bucketCount} buckets`,
  iterate: `Iterating every timestamp ${relayWorkload.iterateRepeats} times`,
  read: `${relayWorkload.readCount} random reads of a change`,
};

/** What a run prints. */
export interface RelayRunOutput {
  /** The owner's number of timestamps after the writes. */
  readonly sizeAfterWrites: number;
  readonly databaseBytes: number;
  readonly phasesMs: Readonly<Record<RelayPhase, number>>;
  /**
   * SHA-256 digests of what the first fingerprint call, the first iteration and
   * the reads returned, which the old and the new code must agree on.
   */
  readonly digests: {
    readonly fingerprints: string;
    readonly iterated: string;
    readonly read: string;
  };
}
