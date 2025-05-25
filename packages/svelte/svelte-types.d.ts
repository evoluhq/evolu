declare function $state<T>(initialValue: T): T;
// eslint-disable-next-line @typescript-eslint/no-invalid-void-type
declare function $effect(fn: () => void | (() => void)): void;
