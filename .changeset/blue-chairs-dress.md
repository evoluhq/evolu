---
"evolu": minor
---

Add createExpressApp

Now everybody can run their own Evolu sync&backup server.

```ts
import { createExpressApp } from "evolu/server";

const app = createExpressApp();

app.get("/ping", (req, res) => {
  res.send("ok");
});

// eslint-disable-next-line turbo/no-undeclared-env-vars
const port = process.env.PORT || 4000;

app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`Server is listening at http://localhost:${port}`);
});
```
