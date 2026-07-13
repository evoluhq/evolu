import { createApp, defineComponent, h, Suspense } from "vue";
import App from "./App.vue";
import "./style.css";

const Root = defineComponent(
  () => () =>
    h(Suspense, null, {
      default: () => h(App),
      fallback: () => h("p", "Loading..."),
    }),
);

createApp(Root).mount("#app");
