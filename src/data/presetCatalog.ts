/** Preset tile copy and page layout — single edit point for the Presets station. */

export interface PresetTileCopy {
  label?: string
  summary?: string
  typeAndDepth?: string
  recommendedFor?: string
}

export interface PresetLayoutRow {
  tokens: string[]
}

export interface PresetLayoutSection {
  label: string
  rows: PresetLayoutRow[]
}

/** Recommended-token tile copy (label optional override). */
export const PRESET_TILE_COPY: Record<string, PresetTileCopy> = {
  fixes: {
    label: 'Fixes',
    summary:
      'Essential stability, logic, and bug-correction patches for the base engine and game data.',
    typeAndDepth:
      'Low mechanical impact. Focuses strictly on fixing technical bugs, alignment inconsistencies, broken quest logic, and text/dialogue errors without altering core gameplay systems or adding new narrative elements.',
    recommendedFor:
      'Everyone. Essential for all players to ensure a smooth, stable, and error-free experience.',
  },
  restoration: {
    label: 'Restorations',
    summary:
      'Reinstates cut, unfinished, or unused content directly from the original game files.',
    typeAndDepth:
      'Low to moderate impact. Restores scrapped areas, cut dialogue options, missing encounters, and unused graphics/audio that were created by the original developers but omitted from the final release.',
    recommendedFor:
      'Purists and returning veterans who want to experience the complete original vision of the developers without introducing fan-made storylines.',
  },
  vanillaPlus: {
    label: 'Vanilla+',
    summary:
      'Quality-of-life enhancements and subtle mechanical polish that stay faithful to original game design.',
    typeAndDepth:
      'Low to moderate impact. Focuses on interface/UI enhancements, minor dialogue polish, quality-of-life conveniences, and light roleplay/encounter refinements that seamlessly feel like native base-game features.',
    recommendedFor:
      'First-time players and modernizers looking for a refined experience that preserves the authentic feel of the original game while removing dated clunkiness.',
  },
  blendWell: {
    label: 'Well blended',
    summary:
      'Thoughtfully integrated fan-made modifications designed to match original tone, balance, and lore seamlessly.',
    typeAndDepth:
      'Moderate impact. Introduces lore-friendly rebalances to items, economy, and quests, along with well-integrated post-game or campaign-restructuring elements without breaking game balance or narrative immersion.',
    recommendedFor:
      'Experienced players seeking fresh, meaningful gameplay updates and seamless content expansions that feel completely natural in the game world.',
  },
  extended: {
    label: 'Extended',
    summary:
      'Substantial, transformative content additions including expanded systems, companion content, and major quest modifications.',
    typeAndDepth:
      'High impact. Significantly alters game flow by introducing major narrative overhauls, entirely new areas, expanded companion banters/quests, forgeable end-game artifacts, and sequence breaks.',
    recommendedFor:
      'Series veterans looking to heavily customize their playthrough, overhaul major plot points, or add a vast amount of new content to keep the game fresh.',
  },
  lowerDifficulty: {
    label: 'Lower difficulty',
    summary:
      'Adjustments designed to ease combat mechanics, reduce game friction, and make encounters less punitive.',
    typeAndDepth:
      'Low to moderate impact. Focuses on weakening enemy stats, increasing player utility, removing frustrating mechanics (e.g., instant-death traps or permanent level drain), and granting more forgiving resource availability.',
    recommendedFor:
      'Casual players or story-focused gamers who want to experience the narrative, dialogue, and exploration without getting bogged down by high tactical difficulty or unforgiving combat.',
  },
  higherDifficulty: {
    label: 'Higher difficulty',
    summary:
      "Tactical overhauls and tactical enhancements aimed at dramatically increasing the game's challenge.",
    typeAndDepth:
      'Moderate to high impact. Introduces smarter enemy AI, tougher party compositions, pre-buffed opponents, stricter resource management, and reworked encounter scripts that demand optimal party builds and tactical strategy.',
    recommendedFor:
      'Tactical veterans and min-maxers looking for a grueling test of game knowledge, strategy, and party synergy.',
  },
  ui: {
    label: 'UI',
    summary: '',
    typeAndDepth: '',
    recommendedFor: '',
  },
  gfx: {
    label: 'GFX',
    summary: '',
    typeAndDepth: '',
    recommendedFor: '',
  },
  sounds: {
    label: 'Sounds',
    summary: '',
    typeAndDepth: '',
    recommendedFor: '',
  },
  mechanics: {
    label: 'Mechanics',
    summary: '',
    typeAndDepth: '',
    recommendedFor: '',
  },
  spells: {
    label: 'Spells',
    summary: '',
    typeAndDepth: '',
    recommendedFor: '',
  },
  combat: {
    label: 'Combat',
    summary: '',
    typeAndDepth: '',
    recommendedFor: '',
  },
  npc: {
    label: 'NPC',
    summary: '',
    typeAndDepth: '',
    recommendedFor: '',
  },
}

/** Package-token tile copy (label optional override). */
export const PRESET_PACKAGE_COPY: Record<string, PresetTileCopy> = {
  EEex: { label: 'EEex' },
  BGGO: { label: "Baldur's Gate Graphical Overhaul" },
  IDGO: { label: 'Icewind Dale Graphical Overhaul' },
  npcExpansions: { label: 'Original Cast Expansions' },
  romances: { label: 'Romances' },
  customNpcs: { label: 'Custom NPCs' },
  returningNpcs: { label: 'Returning Playable NPCs' },
  npcChoices: { label: 'NPC Choices' },
  encounters: { label: 'Encounters' },
  BG1Sounds: { label: 'BG1 Sounds' },
  vve: { label: 'Voices Voices Extravaganza' },
  npcColoredEquipment: { label: 'NPC Colored Equipment' },
  colorizeNpcNames: { label: 'Colorize NPC Names' },
}

/** Presets page section layout (whitelist of recommended tokens). */
export const PRESET_LAYOUT: PresetLayoutSection[] = [
  {
    label: 'Base',
    rows: [{ tokens: ['fixes', 'restoration'] }],
  },
  {
    label: 'Media & Interface',
    rows: [{ tokens: ['ui', 'gfx', 'sounds'] }],
  },
  {
    label: 'Rules',
    rows: [{ tokens: ['mechanics', 'spells', 'combat'] }],
  },
  {
    label: 'Content',
    rows: [
      { tokens: ['vanillaPlus', 'blendWell', 'extended'] },
      { tokens: ['npc'] },
    ],
  },
  {
    label: 'Difficulty',
    rows: [{ tokens: ['lowerDifficulty', 'higherDifficulty', 'adjustements'] }],
  },
]
