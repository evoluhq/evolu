/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/vue" />

declare module "*.vue" {
  import type { DefineComponent } from "vue";

  const component: DefineComponent;
  export default component;
}
