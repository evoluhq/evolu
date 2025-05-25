import "./App.css";
import solidLogo from "./assets/solid.svg";
import { EvoluExample } from "./EvoluExample.tsx";
import PWABadge from "./PWABadge.tsx";
import appLogo from "/favicon.svg";

function App() {
  return (
    <>
      <div>
        <a href="https://vite.dev" target="_blank">
          <img src={appLogo} class="logo" alt="solid-vite-pwa logo" />
        </a>
        <a href="https://solidjs.com" target="_blank">
          <img src={solidLogo} class="logo solid" alt="Solid logo" />
        </a>
      </div>
      <h1>solid-vite-pwa</h1>
      <EvoluExample />
      <PWABadge />
    </>
  );
}

export default App;
