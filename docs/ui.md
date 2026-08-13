# UI patterns

Shared React components and CSS conventions for iNfinity eXpress chrome.

## Tooltips

Use **immediate** hover/focus tips — never the browser's native `title` attribute (delayed, inconsistent styling).

### Components

| Pattern | When to use |
| --- | --- |
| `has-icon-tip` host + `<IconTip>…</IconTip>` | Default for controls inside scrollable panels, detail panes, or any ancestor with `overflow: hidden` / `overflow: auto` |
| `has-icon-tip` host + `<span className="icon-tip">…</span>` | Only when no clipping ancestors (e.g. top-level toolbar icon buttons with room above) |
| `level-card-tip` | Engine level cards only (existing richer pattern) |

`IconTip` portals to `document.body`, positions with `position: fixed`, and flips to `icon-tip-below` when upward space is tight (top bar, phase nav, sticky headers).

### Clipping rule

If the tip could be cut off by a scroll container or panel edge → **always `IconTip`**.

Examples that must use `IconTip`: detail pane jump button, mods table `TipCell`, detail/install chrome collapse affordances.

### Accessibility

Tips show on `:hover` and `:focus-visible` of the host, including disabled hosts where applicable. Use `aria-label` on icon-only buttons; the tip supplements, not replaces, the accessible name.

## Text inputs

Editable text fields → `OutlinedTextField` from `src/ui/OutlinedTextField.tsx`. See `.cursor/rules/ui-outlined-inputs.mdc`.

## Collapsible chrome

Detail pane, station rail, and install console collapse via **clickable chrome areas** (header strip or empty rail space), not dedicated chevron/arrow buttons:

- Hover: subtle background (`accent-soft`) and pointer cursor on the hit target
- Keyboard hotkeys unchanged: `;` detail pane, `\` station rail
- Tips on hit targets use `IconTip` (portaled)

CSS classes: `.detail-pane-chrome-interactive`, `.station-nav-rail-hit`, `.install-console-header-hit`.

## References

- CSS: `src/index.css` — “Immediate hover tips (engine-style; no native title delay).”
- Component: `src/ui/IconTip.tsx`
- Examples: `ModsTable` `TipCell`, `StationListToolbar` fold toggle, `ComponentTreeRow` randomise
