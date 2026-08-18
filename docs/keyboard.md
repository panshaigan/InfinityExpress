# Keyboard reference

Keyboard behaviour for the selection UI. Command resolution is pure TypeScript under `src/lib/ui/` so the same logic ports to the **Tauri 2 + TypeScript + React** desktop shell without rewriting bindings.

| Module | Role |
| --- | --- |
| `src/lib/ui/treeKeyboard.ts` | Flatten visible rows; map keys → tree commands |
| `src/lib/ui/chromeHotkeys.ts` | Station cycle, jump-to-search, Esc chrome |
| `src/ui/ComponentTree.tsx` | Apply tree commands; ARIA tree + roving tabindex |
| `src/App.tsx` / `FiltersStrip` / `StationBranchNav` | Apply chrome / tablist commands |

---

## Component tree

Focus a row (click or Tab into the tree), then:

| Key | Action |
| --- | --- |
| `↑` / `↓` | Move to previous / next **visible** row |
| `Page Up` / `Page Down` | Move to previous / next node **one level higher** (siblings of the parent; at roots, among roots; no wrap) |
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
| `Tab` | When nothing is focused, jump to the first item on the current display (first engine card on Engine; otherwise the component list / search results) |
| `F3` | Desktop: focus the search field on this display (components or mods) and select its contents |
| `F6` | Desktop: focus the list / table on this display (component tree, mods table, or engine cards) |
| `?` | Open the keys guide |
| `\` | Collapse / expand the station rail |
| `;` | Collapse / expand the details pane |
| `[` | Previous station (wraps; order is Engine, then visible content stations) |
| `]` | Next station (wraps) |
| `/` | Focus the filter search field and select its contents (so the next keystrokes replace the query). If search is already focused, `/` is typed normally. |
| `Esc` | If a filter panel (Size / Author / Tags) is open → close it. Else if search is focused → blur search and return focus to the component tree. |

---

## Content station branches

When focus is on a Content main- or sub-branch menu:

| Key | Action |
| --- | --- |
| `←` / `→` (also `↑` / `↓`) | Move to the previous / next option in that menu (wraps) |

While the Content station is active (focus need not be on the menus; ignored while typing in a text field):

| Key | Action |
| --- | --- |
| `,` | Previous main branch (game bucket) |
| `.` | Next main branch (game bucket) |
| `Shift+,` / `<` | Previous subbranch (content type) |
| `Shift+.` / `>` | Next subbranch (content type) |

Tree `←` / `→` only apply when the component tree has focus, so the two do not conflict.

## Mechanics station branches

While the Mechanics station is active (ignored while typing in a text field):

| Key | Action |
| --- | --- |
| `,` | Previous category (`warriors`, `rogues`, …) |
| `.` | Next category |

Mechanics has no subbranch level, so `<` / `>` do nothing here.

### Mouse (component tree)

| Action | Effect |
| --- | --- |
| Single click on a row | Focus the row (detail pane); does **not** toggle check |
| Double-click on a row | Check / uncheck like the checkbox or Space |
| Click the fold chevron | Expand / collapse only |
