import { instanceOf } from "../../../../packages/common/src/Type.ts";

const ErrorInstance = instanceOf(Error);

export default (): ReadonlyArray<boolean | string> => {
  const value = {};
  const result = ErrorInstance.fromUnknown(value);

  return [
    ErrorInstance.is(new Error()),
    ErrorInstance.is(value),
    result.ok ? "Unexpected success." : ErrorInstance.formatError(result.error),
  ];
};
