/**
 * Preset tile copy and page layout — single edit point for the Presets station.
 *
 * - PRESET_TILE_COPY — recommended tokens (fixes, ui, npc, …)
 * - PRESET_PACKAGE_COPY — package tokens (BGGO, npcExpansions, …); same fields.
 *   Label falls back to InstallSequence ancestor `label` when omitted.
 * - PRESET_LAYOUT — tabs of section headings and rows of recommended tokens
 */

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

export interface PresetLayoutTab {
  label: string
  sections: PresetLayoutSection[]
}

/** Recommended-token tile copy (label optional override). */
export const PRESET_TILE_COPY: Record<string, PresetTileCopy> = {
  fixes: {
    label: 'Fixes',
    summary:
      'Bug fixes and technical corrections that repair problems in the original game, engine behavior, or game data.',
    typeAndDepth:
      'Low mechanical impact. Corrects bugs, broken quest logic, inconsistent game data, scripting errors, dialogue and text problems, and other unintended behavior while preserving the intended gameplay and story.',
    recommendedFor:
      'Everyone. A good foundation for any playthrough, especially when the goal is a stable and polished game.',
  },

  restoration: {
    label: 'Restorations',
    summary:
      'Cut, unfinished, or unused content brought back into the game from material associated with the original development.',
    typeAndDepth:
      'Low to moderate impact. Restores original dialogue, creatures, encounters, items, areas, sound effects, and other content that was removed, disabled, or left incomplete before release.',
    recommendedFor:
      'Purists and returning veterans who want to experience more of the original developers’ work while keeping fan-created additions to a minimum.',
  },

  vanillaPlus: {
    label: 'Vanilla+',
    summary:
      'Small quality-of-life improvements and carefully restrained changes that preserve the original game’s character.',
    typeAndDepth:
      'Low to moderate impact. Improves usability, removes unnecessary friction, refines existing encounters or dialogue, and makes small gameplay adjustments while keeping the original rules, tone, and overall experience intact.',
    recommendedFor:
      'First-time players and returning players who want a more polished experience without substantially changing the original game.',
  },

  blendWell: {
    label: 'Well blended',
    summary:
      'Fan-made content and gameplay changes designed to integrate naturally with the original game’s world, tone, and progression.',
    typeAndDepth:
      'Moderate impact. Adds or substantially expands quests, encounters, NPC interactions, items, or gameplay options while attempting to maintain the original setting, balance, pacing, and narrative style.',
    recommendedFor:
      'Experienced players who want additional content and meaningful changes that remain compatible with the spirit of the original game.',
  },

  extended: {
    label: 'Extended',
    summary:
      'Large-scale additions and substantial changes that significantly expand or reshape the original game experience.',
    typeAndDepth:
      'High impact. Can add major quests, areas, NPCs, companion content, new progression options, campaign restructuring, post-game content, or other changes that noticeably alter the scope or flow of a playthrough.',
    recommendedFor:
      'Veterans who have already experienced the original game and want a substantially expanded or reworked playthrough.',
  },

  lowerDifficulty: {
    label: 'Lower difficulty',
    summary:
      'Changes that make combat, exploration, resource management, or other gameplay challenges more forgiving.',
    typeAndDepth:
      'Low to high mechanical impact depending on the component. May weaken enemies, remove or reduce punishing mechanics, improve player resources, simplify encounters, or eliminate obstacles that normally require tactical planning.',
    recommendedFor:
      'Players who prioritize story, exploration, experimentation, or a more relaxed experience over the original level of challenge.',
  },

  higherDifficulty: {
    label: 'Higher difficulty',
    summary:
      'Changes that make encounters and game systems more demanding and require stronger tactical decision-making.',
    typeAndDepth:
      'Moderate to high mechanical impact. May strengthen enemies, improve their abilities or tactics, alter encounters, increase resource pressure, or otherwise demand more careful party composition and tactical play.',
    recommendedFor:
      'Experienced players who already know the game and want a substantially greater tactical challenge.',
  },

  ui: {
    label: 'UI overhaul',
    summary:
      'Changes to menus, interface elements, information displays, controls, and other aspects of the game’s user interface.',
    typeAndDepth:
      'Usually low mechanical impact. Primarily changes how information is displayed or how the player interacts with the game, although some components can add new interface functionality or require engine-level extensions.',
    recommendedFor:
      'Players who want a more convenient, informative, or modern interface.',
  },

  gfx: {
    label: 'Graphics enhancements',
    summary:
      'Visual enhancements, and changes to the appearance of the game world and its assets.',
    typeAndDepth:
      'Usually low to moderate mechanical impact. Changes areas, sprites, animations, portraits, graphical assets, lighting, or other visual elements without necessarily changing gameplay.',
    recommendedFor:
      'Players who want to improve, restore, or modernize the visual presentation of the game.',
  },

  sounds: {
    label: 'Sound enhancements',
    summary:
      'Audio replacements, enhancements, and additional voice or sound effects.',
    typeAndDepth:
      'Usually low mechanical impact. Changes sound effects, music, character voice sets, spell and weapon sounds, or adds new voiceover content while leaving gameplay mechanics largely unchanged.',
    recommendedFor:
      'Players who want a richer, restored, or expanded audio experience.',
  },

  mechanics: {
    label: 'Mechanics',
    summary:
      'Changes to the classes, kits, progression, abilities, and other gameplay mechanics.',
    typeAndDepth:
      'Moderate to high mechanical impact. Can alter character abilities, progression, resources, rules interactions, item behavior, class systems, or other fundamental gameplay systems.',
    recommendedFor:
      'Players who want to customize how the game actually plays rather than primarily adding content or improving presentation.',
  },

  spells: {
    label: 'Spells',
    summary:
      'Additions, revisions, restorations, and balance changes involving spells and magical abilities.',
    typeAndDepth:
      'Low to high mechanical impact depending on the component. Can add new spells, modify existing effects, change spell balance, alter spell availability, or introduce new magical mechanics.',
    recommendedFor:
      'Players interested in expanding or customizing the game’s spellcasting options and magical systems.',
  },

  combat: {
    label: 'Combat',
    summary:
      'Changes that directly affect battles, encounters, enemy behavior, party tactics, and combat balance.',
    typeAndDepth:
      'Moderate to high mechanical impact. Can modify enemies, encounter composition, AI, combat abilities, equipment, tactics, or other systems that directly influence battles.',
    recommendedFor:
      'Players who want to change the tactical character of combat or fine-tune the challenge of battles.',
  },

  npc: {
    label: 'NPC',
    summary:
      'Changes and additions involving companions, joinable NPCs, their personalities, abilities, relationships, and interactions.',
    typeAndDepth:
      'Ranges from low to high impact. Can add dialogue, banters, quests, romances, friendship paths, new NPCs, class or stat choices, or entirely new companion experiences.',
    recommendedFor:
      'Players who want deeper companion interactions, additional characters, or more control over how their party develops.',
  },

  iwd: {
    label: 'Icewind Dale',
    summary:
      'Integrates the Icewind Dale campaigns (Main, HoW, TotL) into BG/EET.',
    typeAndDepth:
      'High impact. Adds Icewind Dale campaigns and their expansions to the EET installation, with optional integration and progression adjustments.',
    recommendedFor:
      'Players who want to play Icewind Dale content within an EET installation.',
  },

  iwd2: {
    label: 'Icewind Dale 2',
    summary:
      'Adds Icewind Dale 2 as a campaign within BG2/EET.',
    typeAndDepth:
      'High impact. Adds the Icewind Dale 2 campaign and integrates it into the EET environment.',
    recommendedFor:
      'Players who want to include Icewind Dale 2 in their EET installation.',
  },

  nwn: {
    label: 'Neverwinter Nights',
    summary:
      'Adds Neverwinter Nights content and campaign functionality to BG2/EET.',
    typeAndDepth:
      'High impact. Adds the NWN campaign and related world-map and campaign-integration features to the EET installation.',
    recommendedFor:
      'Players who want to include Neverwinter Nights content in their EET playthrough.',
  },

  dedicated: {
    label: 'Dedicated campaigns',
    summary:
      'Options for treating additional campaigns such as Icewind Dale and Neverwinter Nights as standalone campaigns within EET.',
    typeAndDepth:
      'Moderate impact. Changes campaign presentation and availability, allowing dedicated campaigns to be accessed separately from the main Baldur’s Gate saga.',
    recommendedFor:
      'Players primarily interested in playing the additional campaigns as standalone experiences rather than as extensions of the Baldur’s Gate saga.',
  }
}

/** Package-token tile copy (label optional override). */
export const PRESET_PACKAGE_COPY: Record<string, PresetTileCopy> = {
  EEex: {
    label: 'EEex',
    summary:
      'An executable extension that enables advanced modifications and functionality.',
    typeAndDepth:
      'High technical impact but little direct gameplay impact by itself. Provides the engine-level foundation required by mods that add advanced UI features, scripting capabilities, or other functionality unavailable through ordinary game resources.',
    recommendedFor:
      'Players whose selected mods require EEex. It is primarily a technical dependency rather than a content choice.'
  },

  BGGO: {
    label: "Baldur's Gate Graphical Overhaul",
    summary:
      "Reinstates the extended night areas. Prepare for almost 1.5 GB download size.",
    typeAndDepth:
      'Low gameplay impact. Primarily changes or restores environmental graphics, including expanded area visuals, while leaving the underlying gameplay and story intact.',
    recommendedFor:
      "Players who want to improve or restore Baldur's Gate's visual presentation.",
  },

  IDGO: {
    label: 'Icewind Dale Graphical Overhaul',
    summary:
      'Reinstates the extended night areas.',
    typeAndDepth:
      'Low gameplay impact. Primarily changes or restores environmental graphics and area visuals without substantially affecting gameplay or story.',
    recommendedFor:
      'Players who want to improve or restore Icewind Dale’s visual presentation.',
  },

  npcExpansions: {
    label: 'Original cast expansions',
    summary:
      'Additional dialogue, banters, quests, friendships, and other content for characters from the original games.',
    typeAndDepth:
      'Low to moderate impact. Expands existing companions while retaining their established identities, relationships, and place in the original cast.',
    recommendedFor:
      'Players who want more content from the original companions and NPCs without replacing them with entirely new characters.',
  },

  romances: {
    label: 'Romances',
    summary:
      'Romantic relationships and romance-related content for playable NPCs and companions.',
    typeAndDepth:
      'Moderate narrative impact. Adds or changes relationship progression, dialogue, interactions, and romance paths without necessarily changing the underlying gameplay systems.',
    recommendedFor:
      'Players who want additional romantic storylines or more relationship-focused companion content.',
  },

  customNpcs: {
    label: 'Custom NPCs',
    summary:
      'New joinable characters created specifically for modded playthroughs.',
    typeAndDepth:
      'Moderate to high narrative impact. Adds characters with their own personalities, dialogue, abilities, interactions, and potentially quests or romances.',
    recommendedFor:
      'Players who want to expand their party with completely new companions beyond the original cast.',
  },

  returningNpcs: {
    label: 'Returning Playable NPCs',
    summary:
      'Mods that bring characters from BG1/SoD into the BG2 as playable companions.',
    typeAndDepth:
      'Moderate to high impact. Introduces an existing character into a new campaign while potentially adding dialogue, quests, abilities, cross-game continuity, and companion interactions.',
    recommendedFor:
      'Players who want to reunite with familiar characters or create a more interconnected Baldur\'s Gate experience.',
  },

  npcChoices: {
    label: 'Original cast adjustments',
    summary:
      'Optional changes that let you customize the abilities, classes, statistics, alignment, appearance, or other characteristics of existing NPCs.',
    typeAndDepth:
      'Usually low mechanical impact per component. Primarily changes individual companion characteristics while leaving the NPC and their role in the story intact.',
    recommendedFor:
      'Players who want to tailor companions to their preferred party composition, character concepts, or rules interpretation.',
  },

  encounters: {
    label: 'Encounters',
    summary:
      'Additional, expanded, restored, or redesigned encounters involving enemies, allies, and the wider game world.',
    typeAndDepth:
      'Low to high impact depending on the component. Can add new encounters, alter existing ones, change enemy compositions, or introduce new tactical situations and rewards.',
    recommendedFor:
      'Players who want more variety and challenge during exploration and combat.',
  },

  BG1Sounds: {
    label: 'BG1 Sounds',
    summary:
      'A collection of Baldur’s Gate 1 audio restorations and sound enhancements.',
    typeAndDepth:
      'Low mechanical impact. Restores or adjusts BG1 spell, weapon, armor, NPC, and other sound effects while leaving gameplay systems unchanged.',
    recommendedFor:
      'Players who prefer the original Baldur’s Gate audio character or want to restore sounds that were changed or lost in later versions.',
  },

  vve: {
    label: 'Voices Voices Extravaganza',
    summary:
      'Expanded English character voiced dialogues for BG1/SoD. Prepare for about 1.3 GB download size.',
    typeAndDepth:
      'Low gameplay impact with substantial audiovisual changes. Adds large amounts of character voice content without fundamentally changing the underlying game systems.',
    recommendedFor:
      'Players who want a more fully voiced experience and are comfortable with fan-created or AI-generated voice content.',
  },

  i4e: {
    label: 'Imoen 4 Ever',
    summary:
      'Story modifications that allow Imoen to remain involved with the party across key parts of the SoD and BG2 storyline.',
    typeAndDepth:
      'Moderate to high narrative impact. Changes campaign progression, Imoen’s availability, dialogue, and story continuity across multiple games.',
    recommendedFor:
      'Players who want Imoen to remain a continuous companion and have her presence reflected more extensively throughout the saga.',
  },

  rhynn: {
    label: 'Restored Rhynn-Lanthorn',
    summary:
      'A restoration of the Rhynn-Lanthorn content, with an expanded version providing additional locations where the lenses can be found.',
    typeAndDepth:
      'Low to moderate impact. Restores missing content and, in the expanded version, broadens the ways and locations through which the associated quest content can be encountered.',
    recommendedFor:
      'Players interested in restoring overlooked original content and exploring an expanded version of the associated quest.',
  },

  chateau: {
    label: 'Skip Chateau Irenicus',
    summary:
      'Allows experienced players to bypass the opening Chateau Irenicus sequence in Baldur’s Gate II.',
    typeAndDepth:
      'Moderate campaign-flow impact. Significantly shortens the beginning of BG2 while providing options for handling available NPCs and adjusting the opening sequence.',
    recommendedFor:
      'Returning BG2 players who have completed the Chateau Irenicus sequence before and want to reach the main campaign more quickly.',
  },

  disableIdentification: {
    label: 'Disable Identification',
    summary:
      'Removes the need to identify unidentified items, making item properties immediately available.',
    typeAndDepth:
      'Moderate mechanical impact. Eliminates the identification requirement from item usage and reduces one of the game’s resource and inventory-management mechanics.',
    recommendedFor:
      'Players who find item identification tedious or want a more streamlined, less restrictive playthrough.',
  },

  disableTraps: {
    label: 'Disable Traps',
    summary:
      'Removes traps and locks as obstacles from the game.',
    typeAndDepth:
      'High mechanical impact for exploration. Eliminates an entire class of hazards and obstacles that normally reward thief skills, careful exploration, and trap detection.',
    recommendedFor:
      'Players who want to minimize exploration hazards and avoid trap-related gameplay mechanics.',
  },
}

/** Presets page tab + section layout (whitelist of recommended tokens). */
export const PRESET_LAYOUT: PresetLayoutTab[] = [
  {
    label: 'Base & Interface',
    sections: [
      {
        label: 'Base',
        rows: [{ tokens: ['fixes', 'restoration'] }],
      },
      {
        label: 'Media & Interface',
        rows: [{ tokens: ['ui', 'gfx', 'sounds'] }],
      },
    ],
  },
  {
    label: 'Campaigns & Content',
    sections: [
      {
        label: 'Campaigns',
        rows: [
          { tokens: ['iwd', 'iwd2', 'nwn'] },
          { tokens: ['dedicated'] },
        ],
      },
      {
        label: 'Content',
        rows: [
          { tokens: ['vanillaPlus', 'blendWell', 'extended'] },
          { tokens: ['npc', 'restructure'] },
        ],
      },
    ],
  },
  {
    label: 'Rules & Difficulty',
    sections: [
      {
        label: 'Rules',
        rows: [{ tokens: ['mechanics', 'spells', 'combat'] }],
      },
      {
        label: 'Difficulty',
        rows: [{ tokens: ['lowerDifficulty', 'higherDifficulty', 'adjustments'] }],
      },
    ],
  },
]
