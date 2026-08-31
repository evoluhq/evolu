import { String } from "../../../../packages/common/src/Type.ts";

export default (): string => {
  const result = String.fromUnknown(42);

  return result.ok ? result.value : String.formatError(result.error);
};
