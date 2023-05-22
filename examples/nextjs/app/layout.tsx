export default function RootLayout({ children }): JSX.Element {
  return (
    <html lang="en">
      <body
        // https://twitter.com/evoluhq/status/1660763010657402881
        suppressHydrationWarning
      >
        {children}
      </body>
    </html>
  );
}
