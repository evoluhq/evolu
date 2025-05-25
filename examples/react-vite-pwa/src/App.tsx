import "./App.css";
import { EvoluExample } from "./components/EvoluDemo.tsx";
import PWABadge from "./PWABadge.tsx";

function App() {
  return (
    <>
      <h1>evolu/react-vite-pwa</h1>
      <div
        style={{
          textAlign: "left",
        }}
      >
        <EvoluExample />
      </div>
      <PWABadge />
    </>
  );
}

export default App;
