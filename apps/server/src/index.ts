import { createExpressApp } from "@evolu/server";
import { Effect } from "effect";

Effect.runPromise(createExpressApp).then((app) => {
  // eslint-disable-next-line turbo/no-undeclared-env-vars
  const port = process.env.PORT || 4000;

  app.listen(port, () => {
    // eslint-disable-next-line no-console
    console.log(`Server is listening at http://localhost:${port}`);
  });
});
