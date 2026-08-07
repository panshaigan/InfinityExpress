# Infinity Express — application logic (Milestone 1)

This document describes **runtime behaviour** of the selection UI. For XML tag/attribute reference, see [install-sequence-schema.md](install-sequence-schema.md). For key bindings, see [keyboard.md](keyboard.md).

### Runtime / target stack

Milestone 1 runs in the browser via **Vite + React 18 + TypeScript**. The product target is **Tauri 2 + TypeScript + React**: the same React app in a Tauri webview, with selection engines and keyboard command resolvers kept in pure TypeScript under `src/lib/` (including `src/lib/ui/` for portable hotkey → command mapping).

Primary code:


| Area                   | Module                                 |
| ---------------------- | -------------------------------------- |
| Parse XML → tree       | `src/lib/xml/parseInstallSequence.ts`  |
| Types / station list   | `src/lib/xml/schema.ts`                |
| Engine allow-list      | `src/lib/engine/matchEngine.ts`        |
| Conditions             | `src/lib/selection/conditions.ts`      |
| Checkboxes / selection | `src/lib/selection/selectionEngine.ts` |
| What appears in the UI | `src/lib/selection/visibility.ts`      |
| Tree / chrome hotkeys  | `src/lib/ui/treeKeyboard.ts`, `chromeHotkeys.ts` |
| Export text file       | `src/lib/export/installOrder.ts`       |
| Selection presets      | `src/lib/presets/selectionPresets.ts`  |
| Shell UI               | `src/App.tsx`, `src/ui/*`              |


---



## High-level flow

```text
InstallSequence.xml
        │
        ▼
   parseInstallSequence()
        │  typed tree + orderIndex per component
        ▼
   User picks engine (bg1 | bg2 | eet | iwd | pst)
        │
        ▼
   createInitialSelection()   ← required + alwaysIf
        │
        ▼
   Station nav (merged duplicate stations)
        │  free switching
        ▼
   buildDisplayTree()         ← engine + displayIf + noDisplay + noBranches + collapse
        │
        ▼
   Fold defaults + level badges + station desc
        │
        ▼
   User toggles checkboxes
        │  toggleNode() → alternatives / core / alwaysIf
        ▼
   Export install-order.txt   ← selected ids, document order, first-id wins
```

Curated defaults live in `src/data/`. The detail panel joins component `modId` (or enclosing `<mod id|modId>`) to `mods.csv` Codename for URL / Release / Version / Size / Author. Downloading mods / WeiDU come later.

Selection state is a `Set` of **component ids** (WeiDU / XML `id` values), not internal tree keys.

---



## Parsing model

1. XML must be well-formed; root element is `<installSequence>`.
2. Top-level children that are known **station tags** become stations. Unknown top-level tags are skipped (warning).
3. Every element becomes a tree node with:
  - `key` — internal unique id for the UI tree
  - `tag`, `attrs`, `children`
  - `effectiveEngine` / `effectiveLevel` — own attribute, else inherited from parent
4. Each `<component id="…">` also gets:
  - `componentId`
  - `orderIndex` — monotonic counter in **document order** (used for export)
5. Duplicate station tags (e.g. two `<base>` blocks far apart) are **merged for UI**: one station whose children are the folded union of all blocks’ children. Structural org tags (`add`, `update`, `tweaks`, `items`, `quest`, `npc`, `restorations`, `restructure`, …) reunite by tag; labeled buckets (`group`, `common`, …) reunite only when they share `sectionId`. Mechanics follows that same rule with a two-level layout: class-group `sectionId`s (`warriors`, `rogues`, …) nest class `sectionId`s (`fighter`, `ranger`, …) so components from a later `<mechanics>` block land in the matching class bucket. Mods/components/alternatives are never folded. First sibling’s attrs are kept. When a merged sibling has `noBranches`, only **that** sibling’s children are flattened into the survivor at merge time; siblings without the flag keep nested structure (`mod` / `group` rows). If the survivor still has `noBranches` when absorbing a structured sibling, its existing children are materialized flat and the flag is cleared so the incoming structure is preserved. Export still uses each component’s original `orderIndex`.
6. **Content station remount (UI only, after fold):** depending on the selected game, commons are absorbed into a target bucket with the same sibling-fold rules (`npc`/`items`/`tweaks` reunite by tag). `sod` / `pst` stay top-level.
  - `bg1` → fold `universal-bg-content` + `universal-bg-iwd` into `bg1-content`
  - `bg2` → fold both commons into `bg2-content`
  - `iwd` → fold `universal-bg-iwd` into `iwd-content`
  - `eet` → fold `universal-bg-iwd` into `universal-bg-content` (game buckets stay siblings)
  - `pst` → no remount

If `engine` / `level` is missing after inheritance, engine is treated as empty → **visible for all games**.

---



## Stations (UI)

First stop is the **Engine** picker (not an XML station).

Content stations (nav order):

1. base
2. ui
3. campaigns
4. gfx
5. content
6. mechanics (label: Mechanics)
7. spells
8. npcChoices
9. combat
10. sounds
11. portraits
12. scripts
13. randomisation
14. adjustements

User may switch stations freely. A station is hidden from the nav when its display tree is empty for the current engine + current selection (`displayIf` can reveal stations later).

Changing engine **resets** selection via `createInitialSelection` for that game.

---



## Engine matching

User-selected game: `bg1` | `bg2` | `eet` | `iwd` | `pst`  
(UI labels: BG:EE, BG2:EE, EET, IWD:EE, PST:EE).

The `engine` attribute is a **comma-separated allow-list of tokens**. A node matches if **any** token covers the selected game.


| Token  | Covers                 |
| ------ | ---------------------- |
| `bg`   | bg1, bg2 (**not** eet) |
| `bg1`  | bg1                    |
| `bg2`  | bg2                    |
| `eet`  | eet                    |
| `eet1` | eet                    |
| `iwd`  | iwd                    |
| `pst`  | pst                    |


Examples:

- `engine="bg,eet"` → bg1, bg2, **and** eet (eet via the `eet` token; `bg` alone would not cover eet).
- `engine="bg1,eet1"` → bg1 and eet.
- Empty / missing (after inheritance) → all games.

Unknown tokens in the attribute are ignored.

---



## Visibility (what the tree shows)

For each node, in order:

1. **Engine** — must match selected game (`effectiveEngine`).
2. `displayIf` — if present, expression must be true given current selection.
3. `displayIfNot` — if present, expression must be false given current selection.
4. `noDisplay="1"` — never shown in the UI (may still be selected/exported).

Containers with `noDisplay` still contribute their children to the display tree (e.g. hidden trailing `<base>` that only holds auto components).

Built by `buildDisplayTree()` in `src/lib/selection/visibility.ts`.

### Single-child collapse

After the filters above, if a container has **exactly one** visible component leaf (hidden `noDisplay` / `alwaysIf` siblings do not count), the UI shows **only the container** checkbox. Checking it selects that underlying component (`collapsedComponent`). No fold control (no nested rows).

### `noBranches="1"`

When a visible container has `noBranches`, it still appears as its own row (checkbox + label), but **intermediate grouping under it is not shown**. Nested `mod` / `group` / organizational tags are hoisted away; their components become direct display children of the `noBranches` parent.

Exceptions while flattening:

- Nested `<alternatives>` stay as exclusive-choice units (radio semantics).
- A nested container that itself has `noBranches` is kept as its own row (and flattens its own children).

Single-child collapse still applies after flattening.

Example: `<romances noBranches="1"><mod>…components…</mod></romances>` → romances row with flat component children (no mod rows).

### Fold / unfold

Every displayed container with children gets a fold control (chevron).


| Tags                                                                                                                             | Default      |
| -------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| `mod`, `group`, `restorations`, `restructure`, `alternatives`                                                                    | **Folded**   |
| npc/items org folders: `expansions`, `romances`, `bioware`, `beamdog`, `custom`, `banters`, `tweaks`, `add`, `update`, `upgrade` | **Folded**   |
| All other containers (`bg1`, `npc`, `quest`, …)                                                                                  | **Expanded** |


Fold state defaults from `unfolded` / default-folded tags on first visit per station (Content: per main/sub branch). User fold/unfold is kept for the browser session when navigating away and back; a full page reload resets to defaults. Checking the parent still works while folded.

### Keyboard

The component tree supports arrow-key navigation, Space to check, and fold/unfold with `←`/`→`. App chrome adds `[`/`]` for stations and `/` for filter search. Full binding tables: [keyboard.md](keyboard.md). Pure resolvers live in `src/lib/ui/` for the Tauri 2 port.

### App shell layout

Fixed-viewport desktop shell (`100vh`, page does not scroll):

1. **Top bar** — brand, current engine badge, selection count, Export
2. **Station rail** — left edge rail with upright labels stacked top-to-bottom (Engine first, then visible content stations); scrolls vertically if needed
3. **Level selection strip** — mass-check presets by ladder ranks + independent Lower / Higher difficulty (writes `selectedIds`; independent of Filters)
4. **Filters strip** — search plus Level / Stability / Tags / Size / Author / Hidden / Required / Unchecked only controls (display-only; never clears selection)
5. **Workspace** — dense component list (left) + detail panel (right). On the Engine station the detail column is hidden and the game picker uses full width

Filters and workspace sit to the right of the station rail under the top bar.

List and detail panes scroll independently. Station `desc` is **not** shown in the station rail.

### Level selection

Separate from the Filters Level control. Disabled until an engine is chosen. Preset UI state resets when the engine changes.


| Control                                        | Behaviour                                                                                                                                                                                                                                                         |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Ladder radios (**None** / Fixes / … / Extended) | Cumulative mass-check: select engine-eligible components with ladder `effectiveLevel` rank ≤ the chosen max; **deselect** higher ladder ranks. **None** clears all non-required ladder-leveled selections. Difficulty and unleveled components are never changed. |
| **Lower difficulty** / **Higher difficulty** checkboxes | Each selects or clears only components with that `effectiveLevel` (`lowerDifficulty` / `higherDifficulty`). Independent of each other and of the ladder. Does not change ladder or unleveled picks. |


Shared rules with other selection paths: `required` stays selected; `displayIf` / `displayIfNot` gate eligibility; inside `<alternatives>`, prefer a matching `default` option else the first matching option in document order; `alwaysIf` converges afterward. Core auto-select during these presets only pulls cores that match the same operation (ladder max or a difficulty token), so a difficulty toggle cannot pull in ladder cores and vice versa.

### Filters

Filters run **after** `buildDisplayTree` and only affect what is shown. Checked items and export are unchanged. Station tabs ignore user filters (still based on engine + `displayIf` visibility).


| Control   | Behaviour                                                                                                                                                                                                                                                                                                                                                     | Default                                 |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| Search    | Case-insensitive match on label, component id, `modId`, desc                                                                                                                                                                                                                                                                                                  | empty                                   |
| Level     | Display filter only — pick a ladder max: show that rank and lower. **This level only** = exact bucket. **Include Lower difficulty** / **Include Higher difficulty** show/hide those tokens independently of ladder max (including under All levels; never part of the cumulative ladder). Missing `effectiveLevel` is excluded when a ladder filter is active. Does **not** mass-check selection. | All levels; both Include Difficulty flags on |
| Stability | Multi-select allow-list; **Released** = missing/`released`. Other values discovered from data (`beta`, `alpha`, …)                                                                                                                                                                                                                                            | **Released** only                       |
| Tags      | Allow-list of discovered tags (checked = show that tag). Untagged always shown unless **Only checked tags** is on                                                                                                                                                                                                                                             | all tags checked; Only checked tags off |
| Size      | Dual-handle range over `mods.csv` Size (bytes); human-readable labels. Inactive when spanning full catalog min/max. Nodes without a resolvable size are hidden when the range is narrowed                                                                                                                                                                     | full catalog range                      |
| Author    | Checklist of authors with more than 2 mods in `mods.csv`, plus **Include selected** / **Exclude selected**. Include + all listed selected = inactive (unlisted authors still shown). Exclude + empty = inactive                                                                                                                                               | all listed authors; Include             |
| Hidden    | Show / Hide / Only for `noDisplay`                                                                                                                                                                                                                                                                                                                            | **Hide**                                |
| Required  | Show / Hide / Only for `required`                                                                                                                                                                                                                                                                                                                             | **Hide**                                |
| Unchecked | Cycles **off** → **Unchecked + options** → **Unchecked only** → **Unchecked dependencies**. Active modes hide checked regular components. **Unchecked + options** still shows every `<alternatives>` group (even with a choice picked). **Unchecked only** shows `<alternatives>` only when nothing in the group is selected yet. **Unchecked dependencies** keeps only unchecked rows gated by `displayIf` on themselves or an ancestor (always-visible unchecked rows are hidden); also keeps `<alternatives>` when an unchecked option has its own `displayIf`. Kept groups show the full option list including the checked choice. Display-only; selection and export unchanged. | off |


Level filter ranks: `fixes` → `restoration` → `vanillaPlus` → `blendWell` → `quality`. Token `restructure` shares the Well blended bucket. Unleveled nodes are treated as above the ladder and hidden when filtering by level.

The unfolded filter options panel stays open until the user clicks **Hide** (it does not close on outside click).

When Hidden is Show or Only, `buildDisplayTree` is called with `includeHidden` so `noDisplay` components can appear.

### Station heading

Station list-pane heading uses `STATION_LABELS`. Under it, the first station root with a `desc` attribute is shown as the lede. If none, a short generic fallback is used.

Header (and Engine preselect) controls:

- **OK** — marks the current station finished (✓ in header and rail), then advances to the next unfinished non-empty screen (same cycle as Next, including wrap). Finished stations are skipped by Previous / Next / OK.
- **Cancel** — when the current station is already finished, the OK control becomes Cancel and clears the finished mark (station re-enters the Previous / Next cycle).
- **Previous** / **Next** — wrap through non-empty component screens after the active filters, skipping stations already marked finished. Engine is not a cycle stop (from Engine, Next enters the first unfinished screen and Previous the last). Non-content stations are one screen when their filtered list has rows. Content expands as main branch → each subbranch with filtered children (canonical sub order); OK on Content finishes the whole station and skips its remaining tabs.

### Content branch navigation

On the Content station only, two button rows sit under the heading:

1. **Main branches** — one button per top-level remapped content bucket (`bg1`, `sod`, `bg2`, `common`, …). Label from `label` attr, else the tag name.
2. **Subbranches** — one button per direct child of the selected main branch. Presence is dynamic (e.g. SoD may omit `restorations` / `items`). Button order is fixed: `restorations` → `restructure` → `quest` → `npc` → `items` → `tweaks` (other tags append after). Same label rule (`label` attr, else tag). Sibling containers with the same structural tag (including `restorations` / `restructure`) are merged into one button and one list.

The list shows **only the children** of the selected subbranch (no main/sub wrapper rows). First main and first subbranch (in the order above) autoselect when entering Content or when the current keys disappear after remap/filter. Switching main branches prefers the same subbranch tag when present. Relation links into Content also select the main/sub path that contains the target.

### Detail panel

Clicking a tree row focuses it (highlight distinct from checkbox selection). The right detail panel shows label, badges, full `desc`, and metadata (Codename, linkable URL, Release, Version, human-readable Size, Author from `mods.csv` when resolvable; component id). Descriptions are **not** inlined under tree rows.

**Attribute badges** (in addition to level / non-released stability): `required`, `hidden` (`noDisplay`), `core`, `default`, and each comma-separated `tags` token.

**Relation rows** (only when non-empty; flat label lists, no AND/OR structure):


| Row                | Source                                           |
| ------------------ | ------------------------------------------------ |
| Auto-included when | ids in this node’s `alwaysIf`                    |
| Auto-includes      | components whose `alwaysIf` mentions this id     |
| Shown when         | ids in this node’s `displayIf`                   |
| Unlocks            | components whose `displayIf` mentions this id    |
| Hidden when        | ids in this node’s `displayIfNot`                |
| Hides              | components whose `displayIfNot` mentions this id |


Related labels are clickable: switch to the target’s station when needed, focus the tree row if it is visible (including collapsed leaves). If the target is not in the display tree (e.g. `noDisplay`), the detail panel still shows that component from the model with no tree highlight.

### Level badges

Next to each row label, if the node (or its `collapsedComponent`) has an `effectiveLevel`, show a colored badge:


| Level token         | Badge text         |
| ------------------- | ------------------ |
| `fixes`             | Fixes              |
| `restoration`       | Restorations       |
| `vanillaPlus`       | Vanilla+ (QoL)     |
| `blendWell`         | Well blended       |
| `restructure`       | Restructure        |
| `extended`          | Extended           |
| `lowerDifficulty`   | Lower difficulty   |
| `higherDifficulty`  | Higher difficulty  |


Unknown levels still render with a muted badge using the raw token. Non-released `stability` values (e.g. `beta`, `alpha`) show as a separate badge; missing/`released` does not.

---



## Condition expressions (`alwaysIf` / `displayIf` / `displayIfNot`)

- Operands are **component ids**.
- `,` = AND  
- `|` = OR  
- `()` for grouping

Example: `ArtisansKitpack:20000,(xan:1|xan:3)`  
→ `ArtisansKitpack:20000` AND (`xan:1` OR `xan:3`).

Invalid / unparsable expressions evaluate to false.

Conditions are re-evaluated whenever the selection set changes (visibility + `alwaysIf` sync).

---



## Selection rules



### Initial selection (`createInitialSelection`)

When the user picks an engine:

1. Select every component with `required="1"` that is engine-eligible.
2. Run `alwaysIf` to convergence (see below).



### Checkbox semantics

- Every **displayed** nesting level has a checkbox (`group`, `mod`, `alternatives`, subsections, …).
- Checking a **container** selects all currently applicable descendants (engine + `displayIf` / `displayIfNot` ok), with special handling for nested `<alternatives>` (defaults only — see below).
- Unchecking a container clears all component descendants under it.
- Checking/unchecking a **component** toggles that id (plus alternatives/core/alwaysIf side effects).



### Parent checkbox state (checked / indeterminate)

`nodeSelectionState` is **alternatives-aware**. A container is:

- **unchecked** — no eligible descendant components selected
- **checked** — every non-alternatives eligible component is selected, **and** each nested `<alternatives>` has **at least one** eligible component selected (never requires all radio options)
- **indeterminate** — some but not all of the above groups are satisfied

This lets mods like Infinity UI (core + options + quick-save alternatives) show as fully checked after selecting the parent, so the next click clears the mod instead of re-selecting.

### `required`

Always selected when engine-eligible (including when `noDisplay`). Included in export.

### `alwaysIf`

While the expression is true and the component is engine-eligible → keep selected (and clear sibling `<alternatives>` options, same as a manual check).  
When false and `noDisplay` → remove from selection (hidden companion components).  
When false and visible → leave selection alone so the user can still check it manually (e.g. auto-include Fighter/Mage with Eldritch Knight, but allow Fighter/Mage on its own).

Applied after every toggle until stable (bounded loop).

### `displayIf` / `displayIfNot`

Affect **visibility** only (and whether parent “select all” walks into that subtree). Do not by themselves select the component.

- `displayIf` — show only when the expression is true.
- `displayIfNot` — hide when the expression is true (same expression language).



### `default` (on alternatives)

Used **only** when the user checks the `<alternatives>` **parent** checkbox (not when clicking a single option).

Then the engine selects the default-marked option / default branch’s default component(s).

### `core` (inside `<mod>`)

- Selecting the mod parent, or any component under that mod → auto-select all engine-eligible `core="1"` components in that mod.
- Unchecking a **core** component → clear **all** selections under that mod.



### Alternatives

Apply exclusion for **every** enclosing `<alternatives>` ancestor of the node being selected (inner group first, then outer).

**Case A — all direct children are components** (radio list):

- Selecting one component clears the other direct sibling components.

**Case B — direct children are containers** (or mixed branches):

- Selecting anything under one direct child branch clears all components under the **other** direct child branches.
- Nested `<alternatives>` apply the same rules locally, then outer exclusive groups clear sibling branches too.

When selecting the alternatives **parent**, existing choices under it are cleared, then defaults are applied (if any).

---



## Export

**Export install order** builds lines:

```text
componentId;componentLabel
```

Rules:

- Include every id currently in the selection set (UI-visible **and** hidden required / alwaysIf / core).
- Sort by `orderIndex` (XML document order), **not** by station visit order.
- If the same component id appears more than once in the sequence and is selected, emit it **only once** — the **first** document-order occurrence.
- Merged duplicate stations do not reorder export; late XML blocks keep higher `orderIndex`.
- Browser downloads `install-order.txt`.

Label fallback: `attrs.label`, else the component id.

---



## Selection presets (in-memory)

Top-bar **Preset** controls save and load named selection snapshots for the **current game** only (other games’ presets stay in memory but are hidden).

Stored per preset:

- `game` + selected component ids
- Level-strip UI: global ladder / difficulty chips, last Engine baseline, and per-station level overrides

Not stored: filters, active station, tree fold state.

**Save** creates a new preset with an auto-name (`BG2:EE · N comps · HH:MM`) when none is active, or updates the active preset when the live selection is dirty (`*`). Duplicate names get a `(2)` / `(3)` suffix. **Load** restores ids and level UI without re-running ladder mass-check. After any change away from a loaded/saved preset, the dropdown resets to “Select preset…” so choosing that preset again reloads it. Rename is inline (while clean); delete removes the active preset. Switching engine clears the active preset id but keeps all presets in memory.

Persistence is React state only for now; the serializable shape in `src/lib/presets/selectionPresets.ts` is intended for later file / Tauri storage.

---



## Out of scope (later milestones)

- Downloading mods  
- Invoking WeiDU  
- User-supplied XML/CSV overrides  
- Tauri 2 shell wiring (window, FS, native menus) — UI and `src/lib/` logic are already oriented for that host

Domain logic is kept in pure TypeScript under `src/lib/` so those features can wrap the same modules.

---



## Quick behavioural checklist


| Action                                      | Expected                                                                                                                                                                                                                              |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pick EET                                    | Show nodes whose allow-list covers eet (`eet`, `eet1`, or lists like `bg,eet`)                                                                                                                                                        |
| Pick BG:EE                                  | `bg` / `bg1` match; bare `eet` / `eet1` do not                                                                                                                                                                                        |
| Check parent group                          | All eligible descendants checked (alts → defaults only)                                                                                                                                                                               |
| Check mod with nested alternatives          | Parent shows checked (one alt option is enough); uncheck clears all                                                                                                                                                                   |
| Check alternatives parent                   | Default option/branch selected                                                                                                                                                                                                        |
| Pick another radio alternative              | Previous alternative cleared                                                                                                                                                                                                          |
| Pick component in other alternatives branch | Other branch cleared                                                                                                                                                                                                                  |
| Check anything in a mod with core           | Core auto-checked                                                                                                                                                                                                                     |
| Uncheck core                                | Whole mod cleared                                                                                                                                                                                                                     |
| One visible child under a group             | Only group row shown; check selects that child                                                                                                                                                                                        |
| `noBranches` container                      | Components listed flat under it; nested mod/group rows omitted                                                                                                                                                                        |
| Fold chevron                                | `mod` / `group` / `restorations` / `restructure` / `alternatives` and npc/items org folders (`expansions`, `romances`, `bioware`, `beamdog`, `custom`, `banters`, `tweaks`, `add`, `update`, `upgrade`) start folded; others expanded |
| Station with `desc`                         | Desc shown under station heading in the list pane                                                                                                                                                                                     |
| Focus a tree row                            | Detail panel shows desc / mod metadata (not inlined in the list)                                                                                                                                                                      |
| Level on component/container                | Colored level badge next to label                                                                                                                                                                                                     |
| Save selection preset                       | Top bar Save; auto-name; game-scoped; stores ids + level-strip UI                                                                                                                                                                     |
| Load selection preset                       | Dropdown restores ids + level chips; does not re-run ladder mass-check                                                                                                                                                                |
| Export                                      | Document order; first occurrence only for duplicate ids; includes hidden auto-selected                                                                                                                                                |


