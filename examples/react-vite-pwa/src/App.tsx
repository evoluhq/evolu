import "./App.css";
import type { FC } from "react";
import { EvoluFullExample } from "./components/EvoluFullExample.tsx";
import PWABadge from "./PWABadge.tsx";

const App: FC = () => (
  <>
    <EvoluFullExample />
    {/* Tells the user when the app works offline or an update is ready. The
        update waits for the user's Reload, which asks for the passkey again. */}
    <PWABadge />
  </>
);

export default App;
