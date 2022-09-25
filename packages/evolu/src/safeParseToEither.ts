import { either } from "fp-ts";
import { Either } from "fp-ts/Either";
import { SafeParseReturnType, ZodError } from "zod";

export const safeParseToEither = <Input, Output>(
  a: SafeParseReturnType<Input, Output>
): Either<ZodError<Input>, Output> =>
  a.success ? either.right(a.data) : either.left(a.error);
