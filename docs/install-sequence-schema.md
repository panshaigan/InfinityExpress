# InstallSequence.xml schema

Curated file: `src/data/InstallSequence.xml`

## Root

```xml
<?xml version="1.0"?>
<installSequence>
  …stations…
</installSequence>
```

## Stations (top-level tags)

Merged in the UI when the same tag appears more than once; install order always follows document order. Matching nested sections are folded (see `sectionId` and structural org tags below), not merely concatenated.

| Tag | UI label |
| --- | --- |
| `base` | Base |
| `ui` | UI |
| `campaigns` | Campaigns |
| `gfx` | GFX |
| `content` | Content |
| `kits` | Class / kits / mechanics |
| `spells` | Spells |
| `npcClassAdjustements` | NPC class adjustments |
| `combat` | Combat |
| `sounds` | Sounds |
| `portraits` | Portraits |
| `scripts` | Scripts |
| `randomisation` | Randomisation |
| `adjustements` | Adjustements |

## Nested structural tags

Any non-station element may nest further. Common ones:

- `component` — installable unit (`id` required, `label` recommended)
- `mod` — named mod grouping components
- `group`, `alternatives` — grouping / exclusive choice (`group` merges only via `sectionId`)
- `bg1`, `sod`, `bg2`, `iwd`, `pst`, `common` — content subsections (main branches in the Content UI)
- `add`, `update`, `upgrade`, `delete`, `tweaks`, `items`, `npc`, `romances`, `quest`, `restorations`, `restructure` — organizational folders (Content subbranches are typically `restorations`, `restructure`, `quest`, `npc`, `items`, `tweaks`; `restorations` / `restructure` also default-folded in the tree like `group`)

Unknown nesting tags are still rendered as tree nodes.

## Attributes

| Attribute | Meaning |
| --- | --- |
| `id` | Component id (required on `component`) |
| `sectionId` | Stable section identity for UI merge across split station blocks. Containers with the same `sectionId` fold into one (first attrs kept; children appended then re-folded). Required for intentional merges of `group` / `common` / similar labeled buckets — labels alone never merge. Org folders `add`, `update`, `upgrade`, `delete`, `tweaks`, `items`, `npc`, `romances`, `quest`, `restorations`, `restructure` merge by tag alone when `sectionId` is absent. `mod`, `component`, and `alternatives` never merge. Content game buckets use `bg1-content`, `bg2-content`, `iwd-content` as remount targets; commons use `universal-bg-content` / `universal-bg-iwd` (game-dependent absorb into those buckets — see app-logic.md). |
| `label` | Display name |
| `desc` | Longer description |
| `modId` | Mod package id (download key later) |
| `engine` | Comma allow-list of engine tokens; inherited from ancestors |
| `level` | Category (`fixes`, `vanillaPlus`, …); inherited. UI filter ladder: `fixes` → `restoration` → `vanillaPlus` → `blendWell` → `quality`; `restructure` groups with `blendWell`; `difficulty` is opt-in only |
| `required` | `1` = auto-select when engine-eligible |
| `noDisplay` | `1` = hidden in UI by default (may still install); filter can show/only |
| `alwaysIf` | Auto-select when condition is true |
| `displayIf` | Show only when condition is true |
| `displayIfNot` | Hide when condition is true |
| `default` | `1` = default when parent `<alternatives>` is checked as a whole |
| `core` | `1` = core of parent `<mod>`; auto-on with siblings; off clears mod |
| `stability` | Metadata (e.g. `beta`); omit or `released` = stable / no badge |
| `noBranches` | UI: keep this container row, but flatten nested grouping under it (show components / alternatives units only; see app-logic.md) |
| `tags` | Comma-separated metadata; UI filter matches with OR |

### Engine tokens

Selected game is one of: `bg1`, `bg2`, `eet`, `iwd`, `pst`.

| Token | Covers |
| --- | --- |
| `bg` | bg1, bg2 (not eet) |
| `bg1` | bg1 |
| `bg2` | bg2 |
| `eet` | eet |
| `eet1` | eet |
| `iwd` | iwd |
| `pst` | pst |

A node matches if any token in its (inherited) `engine` list covers the selected game. Empty engine → visible for all games.

### Conditions (`alwaysIf` / `displayIf` / `displayIfNot`)

- Identifiers are component ids
- `,` = AND
- `|` = OR
- `()` for grouping

Example: `ArtisansKitpack:20000,(xan:1|xan:3)`

`displayIfNot` uses the same expression language; the node is shown only when the expression is **false**.
