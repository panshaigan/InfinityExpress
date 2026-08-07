---
name: weidu-component-names
description: >-
  Recovers canonical WeiDU component display names from installed mod tp2/tra
  files under the local EET mods tree and writes them as InstallSequence.xml
  component name attributes. Use when the user asks to fill, recover, or add
  missing component name attrs from WeiDU, tp2, TRA/@string resolution, or the
  D:\games\bg\eet (WSL /mnt/d/games/bg/eet) install. Covers LABEL (quoted and
  bare), DESIGNATED, sequential WeiDU numbers, and title/slug fallbacks.
---

# WeiDU tp2 → component `name`

Fill per-component `name` attributes on `<component>` nodes in `src/data/InstallSequence.xml` from the mod’s WeiDU setup (`.tp2` + English `.tra`).

`name` is the **canonical WeiDU installer title**. Keep curated UI copy in `label` — do not overwrite `label` unless the user asks.

## Hard rules

1. **Human gate (default)**: After matching, present the review table and **stop**. Do **not** edit `InstallSequence.xml` until the user confirms.
2. **Batch / skip-review**: If the user lists several mods, says to batch, or says “go for it” / “apply sure”, process multiple mods and may apply **Sure** rows without a full per-row table. Still summarize counts; never apply **Unsure** without explicit picks.
3. **Missing `name` only**: Skip any `<component>` that already has a non-empty `name="…"`. Never invent titles. Never write empty / whitespace-only `name`.
4. **First-run skip policy**: If the mod folder, `.tp2`, English TRA, or a component match is missing, put it in **Skipped / unmatched** and continue. (Known orphans: `Husam_NP` no folder; `Haer-Dalis-Romance` no `.tp2`.)
5. **Do not change** `label`, `id`, `modId`, `readme`, or other attrs unless the user explicitly asks.
6. **Parser note**: `name` is not yet in `NodeAttrs` (`schema.ts` / `parseInstallSequence.ts`). Still write the XML attribute; the app ignores it until wired. Do not expand schema unless asked.

## Inputs

- **modId**(s), or “batch easy / remaining / hard cases”
- Optional mods root (default below)

## Paths

| Role | Path |
|---|---|
| InstallSequence | `src/data/InstallSequence.xml` |
| Default mods root (WSL) | `/mnt/d/games/bg/eet` |
| Windows equivalent | `D:\games\bg\eet` |
| Per-mod folder | `<modsRoot>/<modId>/` |

## Workflow

```
WeiDU component names:
- [ ] 1. Resolve mod folder; find tp2 (+ English TRA)
- [ ] 2. List project components missing name
- [ ] 3. Parse tp2 (LABEL/DESIGNATED/sequence + titles)
- [ ] 4. Match A→F; review (or apply sure if authorized)
- [ ] 5. Write confirmed / authorized name attrs
```

### Step 1 — Locate tp2 and English TRA

Under `<modsRoot>/<modId>/` (depth ≤ 3–4; skip `backup`, `weidu_external`, `.git`):

1. Find `*.tp2` / `*.TP2`. Prefer `setup-*.tp2` or stem matching the mod; if several, merge indexes from all that contribute LABEL/DESIGNATED (multi-tp2: `EET`, `IE-Snippets`, …).
2. From `LANGUAGE` blocks, take **English** (`~English~`, `english`, `en_us`, `en_gb`). Collect listed `.tra` paths (later overrides earlier `@n`).
   - Resolve paths **case-insensitively** on Linux/WSL (`IWDNPC/...` vs `iwdnpc/...`).
   - **Skip** `weidu_external/...` TRA entries (runtime/install copies; often wrong language).
   - Basename fallback only under english-like folders — never pick `chinese/ubsetup.tra` for `ubsetup.tra`.
   - If LANGUAGE parse fails, fall back to `**/english/**/*.tra` (prefer `setup`/`weidu` names).
3. Missing folder/tp2 → skip mod.
4. Reject non-English resolved titles (Cyrillic/CJK / mojibake): treat as unmatched, not sure.

### Step 2 — List project components

Belonging to the mod via `modId="…"` or enclosing `<mod id|modId="…">`. Keep only missing/empty `name`. Deduplicate by `id`. Record `id`, `label`, `desc`, parent/`alternatives` context.

### Step 3 — Parse WeiDU component titles

Extract each installable `BEGIN` block:

```weidu
BEGIN @1
DESIGNATED 1
LABEL ~A7_MISCTWEAKS_CRITPROTECT_BRACERS~

BEGIN @100 DESIGNATED 0
LABEL ~cd_tweaks_batch_install~

BEGIN @0
LABEL ZG-SCROLLS-FOR-MAGES
DESIGNATED 10

BEGIN ~Extended Law System~
DESIGNATED 1

BEGIN @5001 /* comment */
LABEL EBG1_MainComponent
DESIGNATED 0
```

For each block record:

| Field | Source |
|---|---|
| `designated` | `DESIGNATED N` on the BEGIN line **or** following lines until the next BEGIN |
| `weidu_no` | Effective WeiDU component number (see below) |
| `label` | `LABEL` value (see parsing rules) |
| `titleRef` | `BEGIN @N` or inline `BEGIN ~…~` / `BEGIN "…"` |
| `title` | Resolved English string, **whitespace-flattened** |
| `seq` | 0-based index among installable BEGINs in file order |

**LABEL parsing (critical)**

- Accept **quoted**: `LABEL ~token~` or `LABEL "token"`.
- Accept **bare**: `LABEL ZG-SCROLLS-FOR-MAGES` / `LABEL EBG1_MainComponent` (common in newer WeiDU; no tildes).
- Only from a **directive line** matching `^\s*LABEL\s+…` (not mid-expression).
- **Reject** fake hits: values ending in `.tp2` / `.tpa` / path-like strings (e.g. `REQUIRE_FILE ~EEex.tp2~` must never become a LABEL).

**DESIGNATED / `weidu_no`**

WeiDU number for matching `mod:N`:

1. If the block has `DESIGNATED N` → `weidu_no = N`.
2. Else assign sequentially: start `next = 0`; for each component in order, if DESIGNATED set `weidu_no = N` and `next = N+1`, else `weidu_no = next` and `next += 1`.

This covers mods with few/no DESIGNATED lines (`UnfinishedBusiness` / `ub:N`, `InfinityUI` / `infinity_ui:N`).

**Resolve `@N`**

- Parse English `.tra` with multiline strings: `@1 = ~…~` / `"…"` (`re.S`); **flatten** internal newlines/spaces to single spaces before use (multi-line TRA breaks TSV/XML if left raw).
- Encoding: UTF-8, then CP1252.
- Missing TRA → optional `//` comment on BEGIN → **unsure** only.
- Ignore non-component `@` (`FAIL`, `REQUIRE_PREDICATE`, `GROUP`).

**Empty title** → do not match as sure; skip or unsure.

### Step 4 — Match (A → F)

Try in order; stop at the first **sure** hit.

#### A. LABEL ↔ component id

Project `id` equals tp2 `label` (exact; case-insensitive only if unique).  
Covers: Tweaks Anthology, A7-*, EndlessBG1 (`EBG1_*`), RandomGraionTweaks (`ZG-*` bare LABEL), Imoen4Ever, etc.

#### B. Prefixed id ↔ DESIGNATED / `weidu_no`

`stratagems:5900`, `cdtweaks:150`, `IWDNPC:10`, `ub:12`, `infinity_ui:3`, `rr:2`, `EEex:1` → number after `:` equals `designated` or computed `weidu_no`.

Prefer DESIGNATED when present; otherwise `weidu_no`. Unique title required for **sure**.

#### C. Sequential id ↔ `seq` (last resort numeric)

Only when B fails and the mod has **no** DESIGNATED anywhere (or numbers clearly are 0..n-1 in BEGIN order): `mod:N` ↔ `seq == N` (e.g. some UI packs). Mark **unsure** if DESIGNATED exists but didn’t match — do not invent.

#### D. Title ↔ our `label` (normalized)

Normalize both sides: lowercase; `&`/`+` keep; strip punctuation; collapse space; expand common abbrevs lightly.

- Exact or unique near-exact → **sure** (JA-AdventurePack: `BEGIN ~Ramazith~` ↔ label “Ramazith”).
- Multiple plausible → **unsure** with candidates.
- Generic titles (“Main component”, “1”, “2”) → never sure without A/B.

#### E. Id slug ↔ title

For ids like `JA#BGT_AdvPack-Law_System` / `SkillsAndAbilitiesBlade`:

1. Take substring after last `-` / remove known mod prefixes (`JA#BGT_AdvPack-`, `SkillsAndAbilities`, …).
2. Replace `_` with spaces; normalize as in D.
3. Unique strong match to a WeiDU `title` → **sure**; else **unsure**.

#### F. Weak context (always **unsure**)

Parent `alternatives` label + option `label` vs SUBCOMPONENT / short option titles; `//` comment-only titles.

**Buckets**

| Bucket | When |
|---|---|
| Sure | A; or B with unique title; or D/E unique strong title/slug |
| Unsure | Ambiguity, comment-only title, weak F, sequential guess under C when risky |
| Skipped | No folder/tp2/TRA/title; no credible match |

Never put a weak guess in **Sure**.

### Step 5 — Review table (default stop)

#### Sure matches

| Component id | Our label | Proposed `name` | Why sure |
|---|---|---|---|
| `…` | … | … | LABEL / DESIGNATED n / title / slug |

#### Unsure

| Component id | Our label | Candidates | Notes |
|---|---|---|---|

#### Skipped / unmatched

| Component id (or mod) | Our label | Reason |
|---|---|---|

Report: `sure / unsure / skipped / total`, tp2 + TRA paths.

**Do not edit XML** until confirmation (unless batch apply-sure was authorized).

### Step 6 — Apply

For approved / authorized-sure rows only:

1. Set `name="<title>"` on every occurrence of that component `id`.
2. **Sub-option formatting**: When the WeiDU title is a sub-option (under `<alternatives>`, or curated `label` is clearly the parent while WeiDU text is the option), write:
   - `[Parent component name] sub-option title`
   - Example: `[Of Wolves and Men] Quest uses hut near Thalantyr in High Hedge.`
   - Parent = nearest `<alternatives label>` when nested there; else the curated parent `label` when it names the parent component.
   - Do not double-wrap if already bracketed; skip if WeiDU title already starts with the parent.
3. Preserve indentation/order; insert `name` after `id` (never after `/` on self-closing tags).
4. XML-escape (`"`, `&`, `<`, `>`). Flatten whitespace in values.
5. Re-parse XML; count applied attrs.

## Hard-case cheat sheet (validated locally)

| Mod | Project ids | Trap | Use |
|---|---|---|---|
| **RandomGraionTweaks** | `ZG-…` | `LABEL` is **bare** (no `~`) | **A** after bare-LABEL parse |
| **EndlessBG1** | `EBG1_…` | Same bare `LABEL` | **A** |
| **IWD_NPC** | `IWDNPC:N` | `@` tra index ≠ component number; DESIGNATED holds N | **B** via DESIGNATED |
| **UnfinishedBusiness** | `ub:N` | Almost no DESIGNATED | **B** via computed `weidu_no` |
| **InfinityUI** | `infinity_ui:N` | No LABEL/DESIGNATED; BEGIN `@` then `~1~`… | **B**/**C** via `weidu_no`/`seq` |
| **JA-AdventurePack** | `JA#BGT_AdvPack-…` | No LABEL; inline `BEGIN ~Title~` + DESIGNATED | **D**/**E** (title/slug); not A |
| **skills-and-abilities** | `SkillsAndAbilities…` | No real LABEL; noisy `.tp2` false positives | Reject fake LABEL; **D**/**E** + DESIGNATED only if mapped |
| **BG1NPC** / many quest packs | Custom named ids, sparse LABEL | Often title/slug only | **D**/**E**; leave unmatched if weak |

## Easy vs hard batching

- **Easy**: high hit rate on **A**/**B** alone (probe ≥ ~50% sure before bulk-apply).
- **Hard**: needs bare LABEL, `weidu_no`, or **D**/**E**. Run after easy backlog; prefer one hard family per review unless user authorizes apply-sure.

## Project conventions

```xml
<component
  id="ZG-SCROLLS-FOR-MAGES"
  name="Scrolls for mages"
  label="…"
  modId="RandomGraionTweaks"
/>
```

## Reference smoke checks (do not run unless asked)

- Tweaks-Anthology: LABEL `cd_tweaks_…` / `cdtweaks:N`
- RandomGraionTweaks: bare `LABEL ZG-…`
- EndlessBG1: bare `LABEL EBG1_…`
- IWD_NPC: `IWDNPC:N` → DESIGNATED N (not BEGIN `@` index)
- JA-AdventurePack: `BEGIN ~Ramazith~` ↔ id/label slug
- Flatten multi-line TRA before writing `name`
