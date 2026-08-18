import modsCsv from '../../data/mods.csv?raw'
import {
  collectAuthorOptions,
  modSizeBounds,
  parseModsCsv,
  type ModInfo,
  type AuthorOption,
  type SizeBounds,
} from './loadMods'

const parsedMods = parseModsCsv(modsCsv)

export const modsByCodename: ReadonlyMap<string, ModInfo> = parsedMods

export const catalogSizeBounds: SizeBounds | null = modSizeBounds(parsedMods)

export const catalogAuthorOptions: AuthorOption[] = collectAuthorOptions(
  parsedMods,
  5,
)

export const catalogAuthorNames: string[] = catalogAuthorOptions.map((a) => a.name)

export const filterSeed = {
  authorOptions: catalogAuthorNames,
  sizeBounds: catalogSizeBounds,
}
