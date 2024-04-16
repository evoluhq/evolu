export const canUseDom = ((): boolean => {
  try {
    return !!(
      typeof window !== "undefined" &&
      window.document &&
      window.document.createElement
    );
  } catch (e) {
    return false;
  }
})();
