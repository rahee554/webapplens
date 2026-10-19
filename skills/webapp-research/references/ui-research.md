# UI and theme research (facet `ui`)

Use when the request is about the look of an app: colours, fonts, spacing, components, layout, dark mode. Screenshots are a **separate** facet (`screenshots`); do not add them unless asked.

## Run

```bash
wr init "<App>" --url <url> --focus ui --profile quick [--username-env ... --password-env ...]
wr crawl "<App>"
wr report "<App>"
```

During the crawl, the browser samples computed styles of visible elements on each page (about 1,200 elements per page at most) and merges them. Nothing is changed in the app.

## What it produces

| File | Content |
|---|---|
| `docs/technicals/design-system-observed.md` (generated) | palette by frequency (text, backgrounds, borders), type scale and fonts, spacing values and grid fit (share divisible by 4px and 8px), radii, shadows, components (buttons, inputs, cards, tables, links, headings), layout of the first pages, breakpoints found in readable stylesheets, CSS custom properties, dark mode rules, WCAG AA contrast estimate |
| `docs/technicals/design-tokens.json` (generated) | the inferred tokens in machine-readable form |
| `evidence/design-tokens.json` (tool) | raw accumulator; do not read whole |
| `docs/technicals/design-system.md` (agent) | the `ui-researcher` interpretation: token structure, component rules, gaps |

## Evidence and limits

- Measured values are `observed`. Role names (primary, surface, accent) are **inferred** from frequency and context; they are not the vendor's token names.
- It is **sampling**: rare states (hover, focus, error), unvisited pages, cross-origin stylesheets and canvas/SVG artwork are not covered. Dynamic routes are sampled.
- The contrast figure is an estimate from computed colours over opaque ancestors; images and gradients are not analysed. It is not a full accessibility audit.
- Breakpoints come only from stylesheets the page may read; CSS variables only from `:root`/theme selectors it can access.

## Typical follow-ups (offer, do not assume)

Export tokens as CSS variables, a Tailwind config or a Sass map; `screenshots` for visual reference; `suggest` for design-consistency findings (too many colours, font sizes, radii, button styles; spacing off a 4/8px grid; no CSS variables; no dark mode), which are heuristic thresholds.
