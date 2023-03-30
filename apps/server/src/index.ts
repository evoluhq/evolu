import { createExpressApp } from "evolu-server";

const app = createExpressApp();

// eslint-disable-next-line turbo/no-undeclared-env-vars
const port = process.env.PORT || 4000;

app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`Server is listening at http://localhost:${port}`);
});
