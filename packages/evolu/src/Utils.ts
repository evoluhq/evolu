export type NullableExceptOfId<T> = {
  readonly [K in keyof T]: K extends "id" ? T[K] : T[K] | null;
};

export const throwNotImplemented = (): never => {
  throw new Error("Not implemented");
};
