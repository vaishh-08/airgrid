---
name: AirGrid map WebGL fallback
description: AirGrid keeps MapLibre as the primary map but needs a DOM tile-map fallback in GPU-less preview browsers.
---

MapLibre is the primary map implementation, but some Replit preview browsers cannot create any WebGL context. The map route must catch that capability failure and render an interactive DOM-based tile map instead of letting the route error boundary take over.

**Why:** The preview browser has no usable GPU context, so both WebGL2 and the WebGL1-compatible MapLibre release fail during map construction.

**How to apply:** Preserve the same search, station, estimate, hotspot, and outside-coverage behavior in the fallback; do not replace the primary MapLibre path.