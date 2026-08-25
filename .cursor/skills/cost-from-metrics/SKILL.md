---
name: cost-from-metrics
description: >-
  Recalculates relative install cost and optional costScale attributes on
  InstallSequence.xml components from metrics/component-install-times.jsonl.
  Use when the user asks to recalculate cost, update install costs from metrics,
  refresh cost bars, or overwrites the metrics JSONL with a larger corpus.
---

# Metrics → component `cost` / `costScale`

Fill per-component `cost` (and optional `costScale`) on `<component>` nodes in `src/data/InstallSequence.xml` from the curated install-timing JSONL.

`cost` is a **relative install weight** (≈ reference wall-seconds). It is **not** a promised clock time. Live ETA calibration is a separate feature.

## Hard rules

1. **Human gate (default)**: Run the script in **dry-run** first, show the summary (counts + notable `costScale` / stack-sensitive rows), and **stop**. Do **not** pass `--write` until the user confirms.
2. **Batch / apply**: If the user says “go for it” / “write” / “recalculate and apply”, run with `--write` after dry-run (or directly if they already reviewed).
3. **Do not invent** costs by hand. Only apply values the script proposes from metrics.
4. **Do not change** `label`, `id`, `name`, `complexity`, or other attrs. The script only sets/replaces `cost` / `costScale` (and removes `costScale` when the fit says none).
5. **Corpus path**: Curated input is always repo `metrics/component-install-times.jsonl`. When the user delivers a bigger export, **overwrite that file**, then rerun. Runtime logs under `{dataRoot}/metrics/` are not the curated source unless copied here.

## Paths

| Role | Path |
|---|---|
| Curated metrics | `metrics/component-install-times.jsonl` |
| InstallSequence | `src/data/InstallSequence.xml` |
| Script | `scripts/cost-from-metrics.mjs` |
| npm | `npm run cost:from-metrics` |

## Attribute model

| Attr | Meaning |
|---|---|
| `cost` | Light-base weight: integer ≥ 1 ≈ reference `wallMs` seconds |
| `costScale` | Optional integer ≥ 1; extra weight from prior plan base-cost sum |

Effective cost for plan step *i*:

```
priorBase = sum of base cost of earlier steps that have cost
effective_i = cost_i + (costScale_i ? round(priorBase * costScale_i / 1000) : 0)
```

UI bars use `effective / max(effective)` over the current plan.

## Workflow

```
Cost from metrics:
- [ ] 1. Ensure metrics/component-install-times.jsonl is the latest corpus
- [ ] 2. Dry-run: npm run cost:from-metrics   (or node scripts/cost-from-metrics.mjs)
- [ ] 3. Review TSV (costScale / stack-sensitive / sample counts)
- [ ] 4. On confirm: npm run cost:from-metrics -- --write
- [ ] 5. Spot-check InstallSequence.xml + Install table Cost column
```

### CLI

```bash
npm run cost:from-metrics
npm run cost:from-metrics -- --write
npm run cost:from-metrics -- --metrics path/to/file.jsonl --write
```

Defaults: dry-run; metrics and XML paths as in the table above.

### Aggregation (script)

1. Eligible: `succeeded` / `succeededWithWarnings`; measure `wallMs`.
2. Per `runId`, time-order samples; `priorWallSec` = sum of earlier wall times in that run.
3. Per `componentId`: one sample → `cost = round(wallSec)` (min 1). ≥2 samples → OLS `wallSec ≈ a + b * priorWallSec`; accept scale only when slope is strong, intercept is a real light base (`a ≥ 0.2 × median`), and prior spread is large enough; otherwise median `cost` only.
4. Known stack-sensitive ids (`EET_end:0`, `iwd_eet_end:0`) prefer the linear fit when ≥2 points (same intercept/spread guards).
5. One XML node per id (dual-phase samples share one `cost`).

## Schema

`cost` / `costScale` are wired in `NodeAttrs`, `parseInstallSequence`, and `docs/install-sequence-schema.md`. Runtime helpers: `src/lib/install/componentCost.ts`.
