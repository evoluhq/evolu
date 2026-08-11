import { instanceOf } from "../../../../../packages/common/src/Type2.ts";

const ErrorInstance = instanceOf(globalThis.Error);

export default (): ReadonlyArray<boolean | string> => {
  const value = {};
  const result = ErrorInstance.fromUnknown(value);

  return [
    ErrorInstance.is(new globalThis.Error()),
    ErrorInstance.is(value),
    result.ok ? "Unexpected success." : ErrorInstance.formatError(result.error),
  ];
};
