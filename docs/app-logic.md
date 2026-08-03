# Infinity Express — application logic (Milestone 1)

This document describes **runtime behaviour** of the selection UI. For XML tag/attribute reference, see [install-sequence-schema.md](install-sequence-schema.md).

Primary code:

| Area | Module |
| --- | --- |
| Parse XML → tree | `src/lib/xml/parseInstallSequence.ts` |
| Types / station list | `src/lib/xml/schema.ts` |
| Engine allow-list | `src/lib/engine/matchEngine.ts` |
| Conditions | `src/lib/selection/conditions.ts` |
| Checkboxes / selection | `src/lib/selection/selectionEngine.ts` |
| What appears in the UI | `src/lib/selection/visibility.ts` |
| Export text file | `src/lib/export/installOrder.ts` |
| Shell UI | `src/App.tsx`, `src/ui/*` |

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

Curated defaults live in `src/data/`. The detail panel joins component `modId` (or enclosing `<mod id|modId>`) to `mods.csv` Codename for URL / Release / Version. Downloading mods / WeiDU come later.

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
5. Duplicate station tags (e.g. two `<base>` blocks far apart) are **merged for UI**: one station whose children are the concatenation of all blocks’ children. Export still uses each component’s original `orderIndex`.

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
6. kits (label: Class / kits / mechanics)  
7. spells  
8. npcClassAdjustements  
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

| Token | Covers |
| --- | --- |
| `bg` | bg1, bg2 (**not** eet) |
| `bg1` | bg1 |
| `bg2` | bg2 |
| `eet` | eet |
| `eet1` | eet |
| `iwd` | iwd |
| `pst` | pst |

Examples:

- `engine="bg,eet"` → bg1, bg2, **and** eet (eet via the `eet` token; `bg` alone would not cover eet).
- `engine="bg1,eet1"` → bg1 and eet.
- Empty / missing (after inheritance) → all games.

Unknown tokens in the attribute are ignored.

---

## Visibility (what the tree shows)

For each node, in order:

1. **Engine** — must match selected game (`effectiveEngine`).
2. **`displayIf`** — if present, expression must be true given current selection.
3. **`displayIfNot`** — if present, expression must be false given current selection.
4. **`noDisplay="1"`** — never shown in the UI (may still be selected/exported).

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

| Tags | Default |
| --- | --- |
| `mod`, `group`, `alternatives` | **Folded** |
| All other containers (`bg1`, `tweaks`, `add`, …) | **Expanded** |

Fold state is per station (tree remounts on station change). Checking the parent still works while folded.

### App shell layout

Fixed-viewport desktop shell (`100vh`, page does not scroll):

1. **Top bar** — brand, current engine badge, selection count, Export
2. **Station tabs** — horizontal scrollable tabs (Engine first, then visible content stations)
3. **Filters strip** — placeholder only (disabled search + chips); no filtering yet
4. **Workspace** — dense component list (left) + detail panel (right). On the Engine station the detail column is hidden and the game picker uses full width

List and detail panes scroll independently. Station `desc` is **not** shown in the tab bar.

### Station heading

Station list-pane heading uses `STATION_LABELS`. Under it, the first station root with a `desc` attribute is shown as the lede. If none, a short generic fallback is used.

### Detail panel

Clicking a tree row focuses it (highlight distinct from checkbox selection). The right detail panel shows label, badges, full `desc`, and metadata (Codename, linkable URL, Release, Version from `mods.csv` when resolvable; author, component id). Descriptions are **not** inlined under tree rows.

**Attribute badges** (in addition to level / beta): `required`, `hidden` (`noDisplay`), `core`, `default`, and each comma-separated `tags` token.

**Relation rows** (only when non-empty; flat label lists, no AND/OR structure):

| Row | Source |
| --- | --- |
| Auto-included when | ids in this node’s `alwaysIf` |
| Auto-includes | components whose `alwaysIf` mentions this id |
| Shown when | ids in this node’s `displayIf` |
| Unlocks | components whose `displayIf` mentions this id |
| Hidden when | ids in this node’s `displayIfNot` |
| Hides | components whose `displayIfNot` mentions this id |

Related labels are clickable: switch to the target’s station when needed, focus the tree row if it is visible (including collapsed leaves). If the target is not in the display tree (e.g. `noDisplay`), the detail panel still shows that component from the model with no tree highlight.

### Level badges

Next to each row label, if the node (or its `collapsedComponent`) has an `effectiveLevel`, show a colored badge:

| Level token | Badge text |
| --- | --- |
| `fixes` | fixes |
| `vanillaPlus` | vanilla+ |
| `restoration` | restoration |
| `restructure` | restructure |
| `blendWell` | blend well |
| `quality` | quality |
| `difficulty` | difficulty |

Unknown levels still render with a muted badge using the raw token. Stability `beta` remains a separate badge.

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

While the expression is true and the component is engine-eligible → keep selected.  
When false → remove from selection (typical for hidden companion components).

Applied after every toggle until stable (bounded loop).

### `displayIf` / `displayIfNot`

Affect **visibility** only (and whether parent “select all” walks into that subtree). Do not by themselves select the component.

- `displayIf` — show only when the expression is true.
- `displayIfNot` — hide when the expression is true (same expression language).

### `default` (on alternatives)

Used **only** when the user checks the **`<alternatives>` parent** checkbox (not when clicking a single option).

Then the engine selects the default-marked option / default branch’s default component(s).

### `core` (inside `<mod>`)

- Selecting the mod parent, or any component under that mod → auto-select all engine-eligible `core="1"` components in that mod.
- Unchecking a **core** component → clear **all** selections under that mod.

### Alternatives

Find the enclosing `<alternatives>` for the node being selected.

**Case A — all direct children are components** (radio list):

- Selecting one component clears the other direct sibling components.

**Case B — direct children are containers** (or mixed branches):

- Selecting anything under one direct child branch clears all components under the **other** direct child branches.
- Nested `<alternatives>` apply the same rules locally.

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

## Out of scope (later milestones)

- Downloading mods  
- Invoking WeiDU  
- User-supplied XML/CSV overrides  
- Tauri desktop shell  

Domain logic is kept in pure TypeScript under `src/lib/` so those features can wrap the same modules.

---

## Quick behavioural checklist

| Action | Expected |
| --- | --- |
| Pick EET | Show nodes whose allow-list covers eet (`eet`, `eet1`, or lists like `bg,eet`) |
| Pick BG:EE | `bg` / `bg1` match; bare `eet` / `eet1` do not |
| Check parent group | All eligible descendants checked (alts → defaults only) |
| Check mod with nested alternatives | Parent shows checked (one alt option is enough); uncheck clears all |
| Check alternatives parent | Default option/branch selected |
| Pick another radio alternative | Previous alternative cleared |
| Pick component in other alternatives branch | Other branch cleared |
| Check anything in a mod with core | Core auto-checked |
| Uncheck core | Whole mod cleared |
| One visible child under a group | Only group row shown; check selects that child |
| `noBranches` container | Components listed flat under it; nested mod/group rows omitted |
| Fold chevron | `mod` / `group` / `alternatives` start folded; others expanded |
| Station with `desc` | Desc shown under station heading in the list pane |
| Focus a tree row | Detail panel shows desc / mod metadata (not inlined in the list) |
| Level on component/container | Colored level badge next to label |
| Export | Document order; first occurrence only for duplicate ids; includes hidden auto-selected |
