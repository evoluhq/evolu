export default function LLMsLayout({
  children,
}: {
  children: React.ReactNode;
}): React.ReactNode {
  return (
    <pre style={{ whiteSpace: "pre-wrap", wordWrap: "break-word" }}>
      {children}
    </pre>
  );
}
