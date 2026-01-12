/**
 * Visual identicon generation from IDs.
 *
 * @module
 */
import type { Brand } from "./Brand.js";
import { Id, idToIdBytes } from "./Type.js";
import { md5 } from "@noble/hashes/legacy.js";

/**
 * SVG string representing a visual identicon for an {@link Id}, created with
 * {@link createIdenticon}.
 */
export type Identicon = string & Brand<"Identicon">;

/** {@link Identicon} style. */
export type IdenticonStyle = "github" | "quadrant" | "gradient" | "sutnar";

/**
 * Creates a deterministic identicon SVG from an {@link Id}.
 *
 * Works with any {@link Id} including branded IDs like `OwnerId`, etc.
 *
 * Available styles:
 *
 * - `"github"` (default): 5x5 grid with horizontal mirroring (GitHub-style)
 * - `"quadrant"`: 2x2 grid with direct RGB color mapping from bytes
 * - `"gradient"`: Diagonal stripes with smooth color gradients
 * - `"sutnar"`: Three compositional variants with adaptive colors
 *
 * ### Example
 *
 * ```ts
 * const svg = createIdenticon(id);
 * const quadrantStyle = createIdenticon(id, "quadrant");
 * const gradientStyle = createIdenticon(id, "gradient");
 * const sutnarStyle = createIdenticon(id, "sutnar");
 *
 * // Works with branded IDs
 * const ownerSvg = createIdenticon(ownerId);
 * ```
 */
export const createIdenticon = (
  id: Id,
  style: IdenticonStyle = "github",
): Identicon => {
  const bytes = idToIdBytes(id);

  switch (style) {
    case "github": {
      // GitHub-style identicon: MD5 hash the bytes first
      const hashedBytes = md5(bytes);

      // Map function for value ranges
      const map = (
        value: number,
        inMin: number,
        inMax: number,
        outMin: number,
        outMax: number,
      ): number =>
        ((value - inMin) * (outMax - outMin)) / (inMax - inMin) + outMin;

      // Extract 12-bit hue from bytes[12] (lower 4 bits) + bytes[13]
      const h = ((hashedBytes[12] & 0x0f) << 8) | hashedBytes[13];
      const hue = map(h, 0, 4095, 0, 360);
      const saturation = 65 - map(hashedBytes[14], 0, 255, 0, 20);
      const lightness = 75 - map(hashedBytes[15], 0, 255, 0, 20);

      const fgColor = `hsl(${hue},${saturation}%,${lightness}%)`;
      const bgColor = `hsl(${hue},${saturation}%,90%)`;

      let rects = `<rect width="5" height="5" fill="${bgColor}"/>`;

      // Extract nibbles and generate pattern
      let nibbleIndex = 0;
      for (let x = 2; x >= 0; x--) {
        for (let y = 0; y < 5; y++) {
          const byte = hashedBytes[Math.floor(nibbleIndex / 2)];
          const nibble = nibbleIndex % 2 === 0 ? byte >> 4 : byte & 0x0f;
          const paint = nibble % 2 === 0;
          nibbleIndex++;

          if (paint) {
            rects += `<rect x="${x}" y="${y}" width="1" height="1" fill="${fgColor}"/>`;
            const mx = 4 - x;
            if (mx !== x) {
              rects += `<rect x="${mx}" y="${y}" width="1" height="1" fill="${fgColor}"/>`;
            }
          }
        }
      }

      return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 5 5" shape-rendering="crispEdges">${rects}</svg>` as Identicon;
    }

    case "quadrant": {
      const toHex = (b: number): string => b.toString(16).padStart(2, "0");
      let rects = "";
      for (let i = 0; i < 4; i++) {
        const x = i % 2;
        const y = Math.floor(i / 2);
        const r = bytes[i * 3];
        const g = bytes[i * 3 + 1];
        const b = bytes[i * 3 + 2];
        const color = `#${toHex(r)}${toHex(g)}${toHex(b)}`;
        rects += `<rect x="${x}" y="${y}" width="1" height="1" fill="${color}"/>`;
      }
      return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 2 2">${rects}</svg>` as Identicon;
    }

    case "gradient": {
      // Smooth color gradients with diagonal stripes.
      const toHex = (b: number): string => b.toString(16).padStart(2, "0");

      // Generate colors from bytes.
      const color1 = `#${toHex(bytes[0])}${toHex(bytes[1])}${toHex(bytes[2])}`;
      const color2 = `#${toHex(bytes[3])}${toHex(bytes[4])}${toHex(bytes[5])}`;
      const color3 = `#${toHex(bytes[6])}${toHex(bytes[7])}${toHex(bytes[8])}`;

      let defs = "";
      let shapes = "";

      // Diagonal stripes with gradient.
      defs += `<linearGradient id="grad1-${id}" x1="0%" y1="0%" x2="0%" y2="100%">`;
      defs += `<stop offset="0%" style="stop-color:${color1};stop-opacity:1" />`;
      defs += `<stop offset="100%" style="stop-color:${color2};stop-opacity:1" />`;
      defs += `</linearGradient>`;

      defs += `<linearGradient id="grad2-${id}" x1="0%" y1="0%" x2="0%" y2="100%">`;
      defs += `<stop offset="0%" style="stop-color:${color2};stop-opacity:1" />`;
      defs += `<stop offset="100%" style="stop-color:${color3};stop-opacity:1" />`;
      defs += `</linearGradient>`;

      shapes += `<rect width="100" height="100" fill="url(#grad1-${id})"/>`;

      const stripeWidth = 15 + (bytes[9] / 255) * 20;
      const angle = 30 + (bytes[10] / 255) * 60;

      shapes += `<rect x="20" y="-50" width="${stripeWidth}" height="200" fill="url(#grad2-${id})" transform="rotate(${angle} 50 50)" opacity="0.7"/>`;
      shapes += `<rect x="60" y="-50" width="${stripeWidth}" height="200" fill="url(#grad2-${id})" transform="rotate(${angle} 50 50)" opacity="0.5"/>`;

      return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs>${defs}</defs>${shapes}</svg>` as Identicon;
    }

    case "sutnar": {
      // Three compositional variants with adaptive colors.
      const hue = (bytes[0] / 255) * 360;
      const saturation = 50 + (bytes[1] / 255) * 30;
      const lightness = 50 + (bytes[2] / 255) * 20;

      // Generate palette from base hue with variations
      const toHsl = (h: number, s: number, l: number) =>
        `hsl(${h},${s}%,${l}%)`;

      const color1 = toHsl(hue, saturation, lightness);
      const color2 = toHsl((hue + 120) % 360, saturation, lightness);
      const color3 = toHsl((hue + 240) % 360, saturation, lightness);
      const color4 = toHsl(hue, saturation * 0.3, lightness * 0.5);
      const color5 = toHsl(
        hue,
        saturation * 0.5,
        Math.min(lightness * 1.3, 90),
      );

      const palette = [color1, color2, color3, color4, color5] as const;

      // Layout variant based on first byte.
      const variant = bytes[3] % 3;

      let shapes = "";

      // Almost white background with subtle tint.
      shapes += `<rect width="100" height="100" fill="${toHsl(hue, 10, 95)}"/>`;

      if (variant === 0) {
        // Composition A: Circle + horizontal bar.
        const circleColor = palette[bytes[4] % palette.length];
        const barColor = palette[(bytes[4] + 1) % palette.length];

        shapes += `<circle cx="30" cy="50" r="22" fill="${circleColor}"/>`;
        shapes += `<rect x="60" y="40" width="35" height="20" fill="${barColor}"/>`;
      } else if (variant === 1) {
        // Composition B: Vertical bar + circle.
        const barColor = palette[bytes[5] % palette.length];
        const circleColor = palette[(bytes[5] + 1) % palette.length];

        shapes += `<rect x="15" y="10" width="18" height="80" fill="${barColor}"/>`;
        shapes += `<circle cx="70" cy="50" r="15" fill="${circleColor}"/>`;
      } else {
        // Composition C: Square + circle.
        const squareColor = palette[bytes[6] % palette.length];
        const circleColor = palette[(bytes[6] + 1) % palette.length];

        shapes += `<rect x="20" y="20" width="30" height="30" fill="${squareColor}"/>`;
        shapes += `<circle cx="70" cy="70" r="18" fill="${circleColor}"/>`;
      }

      return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">${shapes}</svg>` as Identicon;
    }
  }
};
