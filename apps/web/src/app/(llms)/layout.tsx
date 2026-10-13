import type { FC, ReactNode } from "react";

const LLMsLayout: FC<{ children: ReactNode }> = ({ children }) => (
  <pre style={{ whiteSpace: "pre-wrap", wordWrap: "break-word" }}>
    {children}
  </pre>
);

export default LLMsLayout;
