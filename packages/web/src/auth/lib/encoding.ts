/**
 * Convert Uint8Array to base64 string.
 */
export function toBase64(buffer: Uint8Array): string {
  return btoa(String.fromCharCode(...buffer));
}

/**
 * Convert base64 string to Uint8Array.
 */
export function fromBase64(base64: string): Uint8Array {
  return Uint8Array.from(atob(base64), c => c.charCodeAt(0));
}

