---
name: g3-readme-component-links
description: >-
  Maps Gibberlings3 (G3) official HTML readme component sections to InfinityExpress
  InstallSequence.xml component readme attributes. Use when the user asks to add,
  fill, match, or verify component-level readme URLs for G3 mods (Tweaks Anthology,
  SCS/stratagems, EE Fixpack, and similar), or mentions G3 readme anchors,
  contents_N links, or component documentation links.
---

# G3 readme → component `readme` links

Fill per-component `readme` attributes on `<component>` nodes in `src/data/InstallSequence.xml` by matching each project component to its section in a Gibberlings3 HTML readme.

## Hard rules

1. **Human gate**: After matching, present the review table and **stop**. Do **not** edit `InstallSequence.xml` until the user confirms (or corrects) matches.
2. **One mod per run** unless the user lists several. Prefer one mod at a time.
3. **Component-level only**: Write full `https://…#anchor` URLs on `<component readme="…">`. Do not change mod-level Readme in `src/data/mods.csv` unless asked.
4. **No invented anchors**: Only use `id`/`name` values that exist in the fetched HTML.
5. **Schema already supports this**: `readme` is parsed into `NodeAttrs.readme` (`src/lib/xml/schema.ts` / `parseInstallSequence.ts`). UI shows it as “Component readme” in `ComponentDetail`.

## Inputs the user provides

- **modId** (or clear mod name), e.g. `Tweaks-Anthology`
- **Readme URL**, e.g. `https://gibberlings3.github.io/Documentation/readmes/readme-cdtweaks.html`

If either is missing, ask before proceeding.

## Workflow

Copy and track:

```
G3 readme linking:
- [ ] 1. Fetch readme HTML; extract component entries
- [ ] 2. List project components for modId
- [ ] 3. Match (WeiDU/tp2 id-first, then title/desc/context)
- [ ] 4. Present review table; wait for confirmation
- [ ] 5. (Only after OK) Write confirmed readme attrs
```

### Step 1 — Load and parse the G3 readme

Fetch the **raw HTML** (not a markdown conversion). Component entries typically look like:

```html
<p>
  <a id="contents_1020" name="contents_1020"></a>
  <strong>Alter HP Triggers for NPC Wounded Dialogues</strong>
  <a href="#contents_1020" rel=""><img alt="Link to this component" … /></a>
  …
</p>
```

Extract for each component-like block:

| Field | Source |
|---|---|
| `anchor` | `id` / `name` on the empty `<a>` (prefer the primary/`href` target when several ids share one title) |
| `title` | Text of the following `<strong>` (expand `<abbr title="…">` to visible text; decode entities) |
| `body` | Following prose until the next component/section heading (for fuzzy matching) |
| `section` | Nearest category heading (`Cosmetic Changes`, `Content Changes`, …) |

**Anchor URL** = readme base URL (no hash) + `#` + `anchor`.

Notes:

- Category headings (`contents_cosmetic`, etc.) are **not** components; skip them.
- One title may carry **multiple** ids (sub-options), e.g. `contents_170` + `contents_171`. Keep all ids; each option usually has its own designated number.
- Build a set of all `id="contents_<digits>"` values present in the HTML — use this to validate anchors before applying.

### Step 1b — (Tweaks Anthology & similar) Fetch WeiDU tp2 mapping

For mods whose project ids are named (`cd_tweaks_…`, etc.) rather than numeric, **prefer the mod's WeiDU tp2 over title matching**.

1. Fetch the mod's setup tp2 from GitHub (Tweaks Anthology: `https://raw.githubusercontent.com/Gibberlings3/Tweaks-Anthology/master/cdtweaks/setup-cdtweaks.tp2`).
2. For each `BEGIN @… DESIGNATED N` block, read `LABEL ~cd_tweaks_…~` (or equivalent) — that label is the canonical component id.
3. Map: `component id` → `DESIGNATED N` → `#contents_N`.

This resolved **159/160** Tweaks Anthology rows in one pass vs fuzzy title matching.

**Stale readme anchors:** tp2 `DESIGNATED` numbers can move ahead of the published HTML readme. Example: Cromwell forging-time options are `1225`–`1227` in tp2 v18 but the readme still lists `#contents_1125`–`1127`. When `#contents_<N>` from tp2 is **missing** from the HTML, mark **unsure** and offer the readme anchors for that section; let the user pick (do not invent `#contents_1225`).

### Step 2 — List project components

From `src/data/InstallSequence.xml`, collect every `<component>` that belongs to the mod:

1. Explicit `modId="…"` matching the target (case-sensitive as in XML).
2. Nested under `<mod id="…">` with that id (children inherit the mod even without `modId`).

For each component record: `id`, `label`, `desc` (if any), parent/group/`alternatives` labels, existing `readme` (if any), and approximate XML location.

Deduplicate by component `id` (same id may appear in multiple stations).

### Step 3 — Match

Try in order; stop at the first **sure** hit. Otherwise keep candidates for **unsure**.

#### A. WeiDU / tp2 id match (prefer for named ids)

When tp2 is available:

- Match project `id` to tp2 `LABEL ~…~` → `DESIGNATED N` → `#contents_N`.
- Confirm `#contents_N` exists in fetched readme HTML; if not, see stale-anchor handling above.
- For `mod:<n>` or `cdtweaks:<n>` style ids → `#contents_<n>` directly.

#### B. Id / number match (when no tp2)

Use when the component `id` encodes a WeiDU/designated number that appears in the readme:

- `stratagems:5900`, `cdtweaks:150`, `mod:123` → look for `#contents_123`, `#123`, or an id/title that clearly includes that number.
- Named ids that end with a clear option index may map to a sibling anchor under the same title (e.g. `…_1` / `…_4` under one multi-id block).

#### C. Title / label match

Normalize both sides (lowercase, strip punctuation, expand common abbreviations, drop author tags like `[Andyr]`):

- Exact or near-exact `label` ↔ readme `title` → **sure**
- Strong overlap after renames → **sure** only if one clear winner; else **unsure** with top candidates

Project labels are often rewritten; do not require identical strings. For multi-option groups, compare `alternatives` parent label + option label against readme section title + option text.

#### D. Description / context match

If title is ambiguous or renamed:

- Compare `desc`, parent group label, and alternatives siblings to readme body and neighboring components
- Prefer unique distinctive phrases over generic words

#### E. Unmatched

No plausible candidate, or several equally weak ones with no way to rank → **unmatched** (do not guess).

**Confidence:**

| Bucket | When |
|---|---|
| Sure | tp2 LABEL match with valid readme anchor, numeric id match, or unique strong title/context match |
| Unsure | tp2 points to missing anchor (stale readme), 2+ plausible candidates, or one weak/partial match |
| Unmatched | Nothing credible |

Never put a weak guess in **Sure**.

### Step 4 — Review table (mandatory stop)

Present three sections. Use markdown tables.

#### Sure matches

| Component id | Our label | Proposed readme URL | Why sure |
|---|---|---|---|
| `…` | … | `https://…#anchor` | e.g. tp2 LABEL → DESIGNATED 1020; or id `150` → `contents_150` |

#### Unsure (needs your pick)

| Component id | Our label | Candidates (URL — readme title) | Notes |
|---|---|---|---|
| `…` | … | 1) `…#a` — Title A; 2) `…#b` — Title B | what conflicts |

#### Unmatched

| Component id | Our label | Notes |
|---|---|---|
| `…` | … | e.g. custom/local-only; no readme section found |

Also report counts: `sure / unsure / unmatched / total`, and how many already had a `readme` attribute.

Then ask the user to confirm sure rows, choose among unsure candidates, and decide what to do with unmatched (leave blank / skip / supply URL).

**Do not edit XML in this step.**

### Step 5 — Apply after confirmation

Only for rows the user approved:

1. Set `readme="<full url with hash>"` on each matching `<component>` in `InstallSequence.xml` (every occurrence of that component `id` if duplicated across stations, unless the user says otherwise).
2. Preserve existing formatting/indentation; do not reorder components.
3. Insert `readme` **before** the closing ` />` on self-closing tags — never after the slash (`… / readme="…">` is invalid XML).
4. Skip components the user rejected or left unmatched.
5. Parse the XML after edits to verify well-formedness; count applied `readme` attributes.

## Project conventions

- Attribute name: `readme`
- Value: absolute `http(s)` URL including `#anchor`
- Example:

```xml
<component
  id="cd_tweaks_alter_wounded_triggers"
  label="Alter HP Triggers for NPC Wounded Dialogues"
  modId="Tweaks-Anthology"
  readme="https://gibberlings3.github.io/Documentation/readmes/readme-cdtweaks.html#contents_1020"
/>
```

## Reference: Tweaks Anthology (validated)

- modId: `Tweaks-Anthology`
- Readme: `https://gibberlings3.github.io/Documentation/readmes/readme-cdtweaks.html`
- tp2: `Gibberlings3/Tweaks-Anthology` → `cdtweaks/setup-cdtweaks.tp2`
- 160 project components; match via tp2 `LABEL ~cd_tweaks_…~` → `DESIGNATED N` → `#contents_N`
- Occasional `cdtweaks:<n>` → `#contents_<n>` (e.g. `cdtweaks:150`)
- Multi-option components share a readme **section title** but have distinct `#contents_<option>` anchors (stacks, char colors, Nalia thief level, move NPCs, etc.)
- Known stale-anchor case: `cd_tweaks_cromwell_forge_time_0` — tp2 `1225`, readme `#contents_1125` (instant forging)

## Later mods (same skill)

Same workflow. Fetch tp2/setup when available. Id-heavy mods (e.g. SCS) should resolve many rows in Step 3A/B. Always keep the human gate before XML writes.
