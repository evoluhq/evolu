export const remToPx = (remValue: number): number => {
  // Keep in sync with the root font size in CSS.
  const rootFontSize =
    typeof window === "undefined"
      ? 18.5
      : parseFloat(window.getComputedStyle(document.documentElement).fontSize);

  return remValue * rootFontSize;
};
