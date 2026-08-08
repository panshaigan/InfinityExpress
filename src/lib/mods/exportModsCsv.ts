import { effectiveModFields, type WorkingMod } from './loadMods'

/** Full catalog header matching shipped `src/data/mods.csv`. */
export const MODS_CSV_HEADER =
  'Codename,Name,Abbreviation,Type,Category,URL,Game,UseMaster,UseAssets,Release,Version,Stability,Size,Author,Readme'

function csvEscape(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}

function flagCell(on: boolean): string {
  return on ? '1' : ''
}

function sizeCell(n: number | null): string {
  return n == null ? '' : String(n)
}

/** Serialize working mods (overlays applied) to full-catalog CSV text. */
export function serializeModsCsv(mods: readonly WorkingMod[]): string {
  const lines = [MODS_CSV_HEADER]
  const sorted = [...mods].sort((a, b) =>
    a.codename.localeCompare(b.codename),
  )
  for (const mod of sorted) {
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
        flagCell(e.useMaster),
        flagCell(e.useAssets),
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
