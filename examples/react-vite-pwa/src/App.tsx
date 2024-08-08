import { useState } from "react";
import "./App.css";
import ViteExample from "./EvoluDemo.tsx";
import PWABadge from "./PWABadge.tsx";
import reactLogo from "./assets/react.svg";
import appLogo from "/favicon.svg";

function App() {
  const [count, setCount] = useState(0);

  return (
    <>
      <div>
        <a href="https://vitejs.dev" target="_blank">
          <img src={appLogo} className="logo" alt="vite-react-pwa logo" />
        </a>
        <a href="https://react.dev" target="_blank">
          <img src={reactLogo} className="logo react" alt="React logo" />
        </a>
      </div>
      <h1>vite-react-pwa</h1>
      <div className="card">
        <button onClick={() => setCount((count) => count + 1)}>
          count is {count}
        </button>
        <p>
          Edit <code>src/App.tsx</code> and save to test HMR
        </p>
      </div>
      <div
        style={{
          textAlign: "left",
        }}
      >
        <ViteExample />
      </div>
      <PWABadge />
    </>
  );
}

export default App;
