import { answer } from "test.package+";
import { bigint } from "./TestBundleDependency.ts";

export default (): Promise<{ answer: number; bigint: bigint }> =>
  Promise.resolve({ answer, bigint });
