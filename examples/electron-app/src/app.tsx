import { createRoot } from "react-dom/client";
import { Example } from "./Example";

// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
const root = createRoot(document.getElementById("root")!);

const App = () => {
  return <Example />;
};
root.render(<App />);
