# Keyboard reference

Keyboard behaviour for the selection UI. Command resolution is pure TypeScript under `src/lib/ui/` so the same logic ports to the **Tauri 2 + TypeScript + React** desktop shell without rewriting bindings.

| Module | Role |
| --- | --- |
| `src/lib/ui/treeKeyboard.ts` | Flatten visible rows; map keys → tree commands |
| `src/lib/ui/chromeHotkeys.ts` | Station cycle, jump-to-search, Esc chrome |
| `src/ui/ComponentTree.tsx` | Apply tree commands; ARIA tree + roving tabindex |
| `src/App.tsx` / `FiltersStrip` / `ContentBranchNav` | Apply chrome / tablist commands |

---

## Component tree

Focus a row (click or Tab into the tree), then:

| Key | Action |
| --- | --- |
| `↑` / `↓` | Move to previous / next **visible** row |
| `Home` / `End` | First / last visible row |
| `→` | Expand a collapsed folder; if already expanded, move to first child |
| `←` | Collapse an expanded folder; otherwise move to parent |
| `Space` | Check / uncheck the focused row (same rules as the checkbox or alternatives radio) |
| `*` | Expand the focused node and all expandable descendants under it |
| `Enter` | Focus the row for the detail pane (does **not** toggle check) |

Fold buttons and checkboxes are removed from the tab order (`tabIndex={-1}`); Space and arrows on the focused row drive those actions.

While typing in a text field, tree keys are not used (focus is outside the tree).

---

## App chrome

These work globally except where noted. Station and most chrome keys are ignored while typing in `input` / `textarea` / `select` (checkboxes, radios, and range sliders do not count as typing).

| Key | Action |
| --- | --- |
| `[` | Previous station (wraps; order is Engine, then visible content stations) |
| `]` | Next station (wraps) |
| `/` | Focus the filter search field and select its contents (so the next keystrokes replace the query). If search is already focused, `/` is typed normally. |
| `Esc` | If a filter panel (Level / Size / Author) is open → close it. Else if search is focused → blur search and return focus to the component tree. |

---

## Content station branches

When focus is on a Content main- or sub-branch tab:

| Key | Action |
| --- | --- |
| `←` / `→` (also `↑` / `↓`) | Move to the previous / next tab in that row (wraps) |

While the Content station is active (focus need not be on the tabs; ignored while typing in a text field):

| Key | Action |
| --- | --- |
| `,` | Previous main branch (game bucket) |
| `.` | Next main branch (game bucket) |
| `Shift+,` / `<` | Previous subbranch (content type) |
| `Shift+.` / `>` | Next subbranch (content type) |

Tree `←` / `→` only apply when the component tree has focus, so the two do not conflict.

### Mouse (component tree)

| Action | Effect |
| --- | --- |
| Single click on a row | Focus the row (detail pane); does **not** toggle check |
| Double-click on a row | Check / uncheck like the checkbox or Space |
| Click the fold chevron | Expand / collapse only |
