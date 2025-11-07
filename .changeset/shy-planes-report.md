---
"@evolu/common": patch
---

Evolu identicons

Added `createIdenticon` function for generating visually distinct SVG identicons from Evolu `Id` (including branded IDs like `OwnerId`, etc.). For user avatars, visual identity markers, and differentiating entities in UI without storing images.

### Features

- **Multiple styles**: Choose from 4 styles:
  - `"github"` (default): 5×5 grid with horizontal mirroring, inspired by GitHub avatars
  - `"quadrant"`: 2×2 color block grid with direct RGB mapping
  - `"gradient"`: Diagonal stripe pattern with smooth color gradients
  - `"sutnar"`: Ladislav Sutnar-inspired compositional design with adaptive colors
- **SVG output**: Returns SVG string that can be used directly

### Example

```ts
import { createIdenticon } from "@evolu/common";

// Basic usage with default GitHub style
const svg = createIdenticon(userId);

const quadrant = createIdenticon(ownerId, "quadrant");
const gradient = createIdenticon(postId, "gradient");
const sutnar = createIdenticon(teamId, "sutnar");
```
