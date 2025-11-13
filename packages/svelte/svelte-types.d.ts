declare function $state<T>(initialValue: T): T;
declare function $effect(fn: () => void | (() => void)): void;
