import { modsByCodename } from './catalog'
import { effectiveModFields, type WorkingMod } from './loadMods'

/** Full catalog header matching shipped `src/data/mods.csv`. */
export const MODS_CSV_HEADER =
  'Codename,Name,Abbreviation,Type,Category,URL,Game,Track,Download,Release,Version,Stability,Size,Author,Readme'

function csvEscape(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}

function sizeCell(n: number | null): string {
  return n == null ? '' : String(n)
}

/** Order mods like shipped mods.csv; append mods not in base order last. */
function orderModsForCsvExport(
  mods: readonly WorkingMod[],
  baseOrder: Iterable<string> = modsByCodename.keys(),
): WorkingMod[] {
  const byCode = new Map(mods.map((m) => [m.codename, m]))
  const ordered: WorkingMod[] = []
  const seen = new Set<string>()
  for (const codename of baseOrder) {
    const m = byCode.get(codename)
    if (!m) continue
    ordered.push(m)
    seen.add(codename)
  }
  for (const m of mods) {
    if (seen.has(m.codename)) continue
    ordered.push(m)
    seen.add(m.codename)
  }
  return ordered
}

/** Serialize working mods (overlays applied) to full-catalog CSV text. */
export function serializeModsCsv(
  mods: readonly WorkingMod[],
  baseOrder: Iterable<string> = modsByCodename.keys(),
): string {
  const lines = [MODS_CSV_HEADER]
  for (const mod of orderModsForCsvExport(mods, baseOrder)) {
    const e = effectiveModFields(mod)
    lines.push(
      [
        csvEscape(e.codename),
        csvEscape(e.name),
        csvEscape(e.abbreviation),
        csvEscape(e.type),
        csvEscape(e.category),
        csvEscape(e.url),
        csvEscape(e.game),
        csvEscape(e.track),
        csvEscape(e.download),
        csvEscape(e.release),
        csvEscape(e.version),
        csvEscape(e.stability),
        sizeCell(e.sizeBytes),
        csvEscape(e.author),
        csvEscape(e.readme),
      ].join(','),
    )
  }
  return `${lines.join('\n')}\n`
}
