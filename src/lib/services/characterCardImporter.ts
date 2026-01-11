/**
 * Character Card Importer Service
 *
 * Imports SillyTavern character cards (V1/V2 JSON format) into Aventura's wizard.
 * Converts character cards into scenario settings with the card character as an NPC.
 */

import type { StoryMode } from '$lib/types';
import type { Genre, GeneratedCharacter } from '$lib/services/ai/scenario';
import { OpenAIProvider } from './ai/openrouter';
import { settings } from '$lib/stores/settings.svelte';
import { buildExtraBody } from '$lib/services/ai/requestOverrides';

const DEBUG = true;

function log(...args: any[]) {
  if (DEBUG) {
    console.log('[CharacterCardImporter]', ...args);
  }
}

// ===== SillyTavern Card Types =====

/**
 * SillyTavern V1 card format (also the core data for V2)
 */
export interface SillyTavernCardV1 {
  name: string;
  description: string;
  personality: string;
  scenario: string;
  first_mes: string;
  mes_example: string;
}

/**
 * SillyTavern V2/V3 card format (V3 has same structure as V2)
 */
export interface SillyTavernCardV2 {
  spec: 'chara_card_v2' | 'chara_card_v3';
  spec_version: string;
  data: SillyTavernCardV1 & {
    creator_notes?: string;
    system_prompt?: string;
    post_history_instructions?: string;
    alternate_greetings?: string[];
    character_book?: unknown; // Lorebook - ignored for this import
    tags?: string[];
    creator?: string;
    character_version?: string;
    extensions?: Record<string, unknown>;
  };
  // V3 cards also duplicate fields at root level
  name?: string;
  description?: string;
  personality?: string;
  scenario?: string;
  first_mes?: string;
  mes_example?: string;
}

/**
 * Parsed card data (normalized from V1, V2, or V3)
 */
export interface ParsedCard {
  name: string;
  description: string;
  personality: string;
  scenario: string;
  firstMessage: string;
  alternateGreetings: string[];
  exampleMessages: string;
  version: 'v1' | 'v2' | 'v3';
}

/**
 * Result of card import/conversion
 */
export interface CardImportResult {
  success: boolean;
  settingSeed: string;
  /** NPCs identified from the card content */
  npcs: GeneratedCharacter[];
  /** The primary character name (for replacing {{char}} in first_mes) */
  primaryCharacterName: string;
  /** Card name to use as story title */
  storyTitle: string;
  /** First message to use as opening scene (with {{char}} replaced) */
  firstMessage: string;
  /** Alternate greetings the user can choose from (with {{char}} replaced) */
  alternateGreetings: string[];
  errors: string[];
}

// ===== Card Parsing =====

/**
 * Check if the data is a V2 or V3 card
 */
function isV2OrV3Card(data: unknown): data is SillyTavernCardV2 {
  if (typeof data !== 'object' || data === null) return false;
  if (!('spec' in data) || !('data' in data)) return false;
  const spec = (data as SillyTavernCardV2).spec;
  return spec === 'chara_card_v2' || spec === 'chara_card_v3';
}

/**
 * Check if the data is a V1 card
 */
function isV1Card(data: unknown): data is SillyTavernCardV1 {
  return (
    typeof data === 'object' &&
    data !== null &&
    'name' in data &&
    'description' in data &&
    !('spec' in data) // V2 cards have spec field
  );
}

/**
 * Parse a character card JSON string into normalized format.
 * Supports both V1 and V2 SillyTavern formats.
 */
export function parseCharacterCard(jsonString: string): ParsedCard | null {
  try {
    const data = JSON.parse(jsonString);

    if (isV2OrV3Card(data)) {
      const version = data.spec === 'chara_card_v3' ? 'v3' : 'v2';
      log(`Detected ${version.toUpperCase()} card format`);
      return {
        name: data.data.name || data.name || 'Unknown Character',
        description: data.data.description || data.description || '',
        personality: data.data.personality || data.personality || '',
        scenario: data.data.scenario || data.scenario || '',
        firstMessage: data.data.first_mes || data.first_mes || '',
        alternateGreetings: data.data.alternate_greetings || [],
        exampleMessages: data.data.mes_example || data.mes_example || '',
        version,
      };
    }

    if (isV1Card(data)) {
      log('Detected V1 card format');
      return {
        name: data.name || 'Unknown Character',
        description: data.description || '',
        personality: data.personality || '',
        scenario: data.scenario || '',
        firstMessage: data.first_mes || '',
        alternateGreetings: [],
        exampleMessages: data.mes_example || '',
        version: 'v1',
      };
    }

    log('Unknown card format');
    return null;
  } catch (error) {
    log('Failed to parse card JSON:', error);
    return null;
  }
}

// ===== Macro Replacement =====

/**
 * Normalize {{user}} macro to consistent case.
 * We keep {{user}} in the text - it will be replaced with protagonist name at story creation time.
 */
export function normalizeUserMacro(text: string): string {
  if (!text) return '';

  // Normalize to consistent {{user}} case
  return text.replace(/\{\{user\}\}/gi, '{{user}}');
}

// ===== LLM Conversion =====

/**
 * Build the combined card content for LLM processing.
 * Combines scenario, description, personality, and example messages.
 * Note: first_mes and alternate_greetings are excluded - they go to step 7.
 * Note: {{user}} is normalized but kept - will be replaced with protagonist name at story creation.
 * Note: {{char}} is left for LLM to interpret.
 */
function buildCardContext(card: ParsedCard): string {
  const sections: string[] = [];

  // Always include scenario if present
  if (card.scenario.trim()) {
    sections.push(`<scenario>\n${normalizeUserMacro(card.scenario)}\n</scenario>`);
  }

  // Always include character description
  if (card.description.trim()) {
    sections.push(`<character_description>\n${normalizeUserMacro(card.description)}\n</character_description>`);
  }

  // Always include personality
  if (card.personality.trim()) {
    sections.push(`<personality>\n${normalizeUserMacro(card.personality)}\n</personality>`);
  }

  // Include example messages for additional lore/context
  if (card.exampleMessages.trim()) {
    sections.push(`<example_messages>\n${normalizeUserMacro(card.exampleMessages)}\n</example_messages>`);
  }

  return sections.join('\n\n');
}

/**
 * System prompt for card-to-scenario conversion
 */
function getCardConversionSystemPrompt(): string {
  return `You are cleaning a SillyTavern character card for use as a scenario setting in interactive fiction.

## Your Task
1. IDENTIFY who "{{char}}" refers to based on the content (the actual character name - NOT the card title)
2. IDENTIFY ALL NPCs/characters mentioned in the card content
3. REPLACE all instances of "{{char}}" with the actual character name in your output
4. KEEP all instances of "{{user}}" as-is - this placeholder will be replaced with the player's character name later
5. REMOVE specific meta-content patterns (see below)
6. PRESERVE the original text as much as possible - do NOT summarize or condense

The "{{user}}" refers to the player's character (protagonist). Characters identified from the card will become NPCs.

## REMOVE THESE PATTERNS (delete entirely):

### Roleplay Instructions (DELETE):
- "You are {{char}}", "You will portray...", "Play as..."
- "Do not speak for {{user}}", "Never speak for {{user}}"
- "Stay in character", "Never break character"
- "Always respond as...", "You must..."
- Any instruction telling the AI HOW to behave

### Meta-Content (DELETE):
- HTML comments: <!-- ... -->
- OOC markers: "(OOC:", "[Author's note:", "[A/N:", etc.
- System prompts, jailbreaks, NSFW toggles
- Format instructions: "Use asterisks for actions", "Write in third person", "Use markdown"
- Section headers like "=== Narration ===" or "=== Character Embodiment ==="
- Guidelines about writing style, vocabulary, pacing

### Example Dialogue Format (EXTRACT LORE ONLY):
- Remove the dialogue format itself
- Keep any world-building or lore mentioned within dialogues

## CONVERT TO NATURAL PROSE (don't delete):

### PList Syntax → Natural Prose:
- [Character: trait1, trait2; clothes: x] → "CharacterName is trait1 and trait2. She wears x."
- Keep ALL the information, just convert the bracket format to sentences

## PRESERVE VERBATIM:
- World descriptions, locations, atmosphere
- Character appearance (physical details, clothing, etc.)
- Character personality and behavior patterns
- Backstory and history
- Relationship dynamics
- Scenario/situation setup
- Any lore, world rules, or setting details
- All {{user}} placeholders (keep them exactly as {{user}})

## OUTPUT FORMAT
Respond with valid JSON only (no markdown code blocks):
{
  "primaryCharacterName": "The ACTUAL name of the main character that {{char}} refers to",
  "settingSeed": "The FULL cleaned text with {{char}} replaced by the actual name, but {{user}} kept as-is. This should be LONG - include ALL world-building, character details, and scenario setup. Only meta-instructions should be removed.",
  "npcs": [
    {
      "name": "Character's actual name",
      "role": "their role (e.g., 'ally', 'mentor', 'antagonist', 'love interest', 'guide', 'friend')",
      "description": "1-2 sentences: who they are and key appearance details",
      "personality": "key personality traits as comma-separated list",
      "relationship": "their relationship to {{user}}"
    }
  ]
}

Note: Include ALL significant characters mentioned in the card as NPCs. The primary character ({{char}}) should be the first NPC in the array.`;
}

/**
 * Convert a parsed character card into a scenario setting using LLM.
 */
export async function convertCardToScenario(
  jsonString: string,
  mode: StoryMode,
  genre: Genre,
  profileId?: string | null
): Promise<CardImportResult> {
  // Parse the card
  const card = parseCharacterCard(jsonString);
  if (!card) {
    return {
      success: false,
      settingSeed: '',
      npcs: [],
      primaryCharacterName: '',
      storyTitle: '',
      firstMessage: '',
      alternateGreetings: [],
      errors: ['Failed to parse character card. Please ensure the file is a valid SillyTavern character card JSON.'],
    };
  }

  log('Parsed card:', { name: card.name, version: card.version });

  const cardTitle = card.name;

  // Pre-process first message and alternate greetings - normalize {{user}} case
  // {{char}} will be replaced after LLM determines the actual character name
  const preprocessedFirstMessage = normalizeUserMacro(card.firstMessage);
  const preprocessedAlternateGreetings = card.alternateGreetings.map(g => normalizeUserMacro(g));

  // Get API provider
  const resolvedProfileId = profileId ?? settings.apiSettings.mainNarrativeProfileId;
  const apiSettings = settings.getApiSettingsForProfile(resolvedProfileId);

  if (!apiSettings.openaiApiKey) {
    return {
      success: false,
      settingSeed: '',
      npcs: [],
      primaryCharacterName: cardTitle,
      storyTitle: cardTitle,
      firstMessage: preprocessedFirstMessage,
      alternateGreetings: preprocessedAlternateGreetings,
      errors: ['No API key configured. Please set up an API key to convert character cards.'],
    };
  }

  const provider = new OpenAIProvider(apiSettings);

  // Build the card context - normalize {{user}}, keep {{char}} for LLM to interpret
  const cardContext = buildCardContext(card);

  if (!cardContext.trim()) {
    return {
      success: false,
      settingSeed: '',
      npcs: [],
      primaryCharacterName: cardTitle,
      storyTitle: cardTitle,
      firstMessage: preprocessedFirstMessage,
      alternateGreetings: preprocessedAlternateGreetings,
      errors: ['Character card appears to be empty. No content found to convert.'],
    };
  }

  const systemPrompt = getCardConversionSystemPrompt();
  const userPrompt = `Clean this character card for use as a ${genre} scenario setting.

The {{user}} will be the protagonist (their name will be filled in later) interacting with the NPCs in an interactive story.

IMPORTANT: 
- Identify who "{{char}}" refers to based on the content (NOT the card title "${cardTitle}")
- Replace all {{char}} with the actual character name
- KEEP all {{user}} placeholders as-is (they will be replaced with the player's character name later)
- Preserve the original text - only REMOVE meta-instructions and roleplay guidelines
- Do NOT summarize or condense - the output should be nearly as long as the input

## CARD CONTENT
${cardContext}

Clean the above content. Identify all NPCs, replace {{char}} with the actual name, keep {{user}} as-is, and remove meta-content. Output valid JSON only.`;

  log('Sending to LLM for conversion...');

  try {
    const response = await provider.generateResponse({
      model: 'deepseek/deepseek-v3.2',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.3,
      maxTokens: 16384,
      extraBody: buildExtraBody({
        manualMode: settings.advancedRequestSettings.manualMode,
        reasoningEffort: 'off',
        providerOnly: [],
      }),
    });

    log('LLM response received, parsing...');

    // Parse the JSON response
    let jsonStr = response.content.trim();

    // Strip markdown code blocks if present
    if (jsonStr.startsWith('```')) {
      jsonStr = jsonStr.replace(/^```(?:json|JSON)?\s*\n?/, '').replace(/\n?```\s*$/, '').trim();
    }

    // Try to extract JSON object
    const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      jsonStr = jsonMatch[0];
    }

    interface LLMNpc {
      name: string;
      role: string;
      description: string;
      personality: string;
      relationship: string;
    }

    interface ConversionResult {
      primaryCharacterName: string;
      settingSeed: string;
      npcs: LLMNpc[];
    }

    const result = JSON.parse(jsonStr) as ConversionResult;

    // Get the primary character name for replacing {{char}} in first_mes
    const primaryName = result.primaryCharacterName || cardTitle;

    // Convert LLM NPCs to GeneratedCharacter format
    const npcs: GeneratedCharacter[] = (result.npcs || []).map(npc => ({
      name: npc.name || 'Unknown',
      role: npc.role || 'NPC',
      description: npc.description || '',
      relationship: npc.relationship || 'acquaintance',
      traits: npc.personality
        ? npc.personality.split(/[,;]/).map(t => t.trim()).filter(t => t.length > 0).slice(0, 5)
        : [],
    }));

    // Replace {{char}} in first message and alternate greetings with the actual character name
    const finalFirstMessage = preprocessedFirstMessage.replace(/\{\{char\}\}/gi, primaryName);
    const finalAlternateGreetings = preprocessedAlternateGreetings.map(g => g.replace(/\{\{char\}\}/gi, primaryName));

    log('Conversion successful:', { 
      settingSeedLength: result.settingSeed?.length, 
      primaryName,
      npcCount: npcs.length 
    });

    return {
      success: true,
      settingSeed: result.settingSeed || '',
      npcs,
      primaryCharacterName: primaryName,
      storyTitle: cardTitle,
      firstMessage: finalFirstMessage,
      alternateGreetings: finalAlternateGreetings,
      errors: [],
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error during conversion';
    log('LLM conversion failed:', error);

    // Return a fallback with basic extraction (keep {{char}} as-is since we couldn't determine the name)
    const fallbackDescription = normalizeUserMacro(
      [card.scenario, card.description].filter(s => s.trim()).join('\n\n')
    );

    return {
      success: false,
      settingSeed: fallbackDescription.slice(0, 2000),
      npcs: [],
      primaryCharacterName: cardTitle,
      storyTitle: cardTitle,
      firstMessage: preprocessedFirstMessage,
      alternateGreetings: preprocessedAlternateGreetings,
      errors: [`LLM conversion failed: ${errorMsg}. Basic extraction was used as fallback.`],
    };
  }
}
