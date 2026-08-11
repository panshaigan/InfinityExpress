# InstallSequence.xml schema

Curated file: `src/data/InstallSequence.xml`. Behaviour: [selection.md](selection.md), [architecture.md](architecture.md).

## Root

```xml
<?xml version="1.0"?>
<installSequence>
  …stations…
</installSequence>
```

## Stations (top-level tags)

Merged in the UI when the same tag appears more than once; install/export order follows document order. Nested same-tag sections fold by tag (not mere concat).


| Tag | UI label |
| --- | --- |
| `base` | Base |
| `ui` | UI |
| `campaigns` | Campaigns |
| `gfx` | GFX |
| `content` | Content |
| `mechanics` | Mechanics |
| `spells` | Spells |
| `npcChoices` | NPC Choices |
| `combat` | Combat |
| `sounds` | Sounds |
| `portraits` | Portraits |
| `scripts` | Scripts |
| `randomisation` | Randomisation |
| `adjustements` | Adjustements |

## Nested structural tags

- `component` — installable unit (`id` required; `label` recommended)
- `mod` — named grouping
- `group`, `alternatives` — grouping / exclusive choice (`group` never merges; use a named camelCase tag to reunite across split stations)
- Content mains: `bg1`, `sod`, `bg2`, `iwd`, `pst`, `universalBg`, `universalBgIwd`
- Mechanics examples: `warriors`, `fighter`, `rogues`, `spellcasters`, `multi`, `universal`, …
- Org folders: `add`, `update`, `upgrade`, `delete`, `tweaks`, `items`, `npc`, `romances`, `quest`, `restorations`, `restructure` (Content subbranches typically the last six)

Unknown nesting tags still render. Same-tag siblings merge unless `group` / `mod` / `component` / `alternatives`.

## Attributes

| Attribute | Meaning |
| --- | --- |
| `id` | Component id (required on `component`) |
| `name` | WeiDU installer title (tp2/TRA); preferred in detail title / relations |
| `label` | Curated UI display name; detail fallback when `name` absent |
| `desc` | Longer description |
| `readme` | Optional http(s) component docs URL |
| `modId` | Download-folder key (not WeiDU id — see [weidu-install.md](weidu-install.md)) |
| `engine` | Comma allow-list; inherited |
| `level` | Category; inherited. Ladder: `fixes` → `restoration` → `vanillaPlus` → `blendWell` → `extended`; `restructure` with `blendWell`; `lowerDifficulty` / `higherDifficulty` opt-in only |
| `required` | `1` = auto-select when engine-eligible |
| `noDisplay` | `1` = hidden by default (may still install); filter can show |
| `noExport` | `1` = selectable but omitted from export / install plan |
| `alwaysIf` | Auto-select when true; if `noDisplay`, deselect when false; if visible, leave manual when false |
| `displayIf` | Show only when true |
| `displayIfNot` | Hide when true |
| `default` | `1` = default when parent `<alternatives>` checked as a whole |
| `core` | `1` = mod core; auto-on with siblings; off clears mod |
| `noBranches` | Keep container row; flatten nested grouping (see [selection.md](selection.md)) |
| `tags` | Comma metadata; filter OR |
| `unfolded` | `1` = start expanded despite default-fold tags |
| `horizontal` | UI: children in one wrapping row when expanded |

### Engine tokens

Selected game: `bg1` | `bg2` | `eet` | `iwd` | `pst`.

| Token | Covers |
| --- | --- |
| `bg` | bg1, bg2 (not eet) |
| `bg1` / `bg2` / `iwd` / `pst` | that game |
| `eet` / `eet1` | eet |

Any token may cover; empty engine → all games.

### Conditions (`alwaysIf` / `displayIf` / `displayIfNot`)

Component ids; `,` = AND; `|` = OR; `()` group. Example: `ArtisansKitpack:20000,(xan:1|xan:3)`.

`displayIfNot`: show only when expression is **false**.
