/**
 * Add types for WebWorker and BroadcastChannel. Messages must have a `_tag`
 * property.
 */
export interface Messaging<
  Input extends { _tag: string },
  Output extends { _tag: string },
> {
  readonly postMessage: (input: Input) => void;
  onMessage: (output: Output) => void;
}
