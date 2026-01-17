export const remToPx = (remValue: number): number => {
  const rootFontSize =
    typeof window === "undefined"
      ? 18.5 // change this if you change the root font size in the CSS
      : parseFloat(window.getComputedStyle(document.documentElement).fontSize);

  return remValue * rootFontSize;
};
