import { assertEqual, assertRejectsInstanceOf } from "@evolu/common";
import { it } from "node:test";

it("fails to import because Expo web is not supported", async () => {
  const error = await assertRejectsInstanceOf(import("./web.ts"), Error);

  assertEqual(
    error.message,
    "Evolu does not support Expo web. For the web, use @evolu/react-web with a web bundler such as Vite or Next.js.",
  );
});
