import { ollamaChat, type OllamaToolDefinition } from './ollama';

export interface SplitPrompt {
  positives: string[];
  negatives: string[];
}

/**
 * Turns a freeform modpack description into search-sized pieces. Swappable —
 * anything that can turn a description into positives/negatives works here,
 * whether it's backed by a local model, a cloud API, or plain heuristics.
 */
export interface PromptSplitter {
  split(description: string): Promise<SplitPrompt>;
}

const SPLIT_TOOL: OllamaToolDefinition = {
  type: 'function',
  function: {
    name: 'record_split',
    description: 'Records the request broken down into individual things to search for, and anything to exclude.',
    parameters: {
      type: 'object',
      properties: {
        positives: {
          type: 'array',
          description:
            'Short search phrases, one per distinct theme/mechanic/feature the request asks for, e.g. ["dark fantasy biomes", "overhauled combat"]. Split compound requests into separate items instead of one long phrase.',
          items: { type: 'string' },
        },
        negatives: {
          type: 'array',
          description:
            'Short phrases for anything the request explicitly says to avoid/exclude/omit, e.g. ["minimap"]. Leave empty if nothing is excluded — never invent one.',
          items: { type: 'string' },
        },
      },
      required: ['positives', 'negatives'],
    },
  },
};

function buildSplitSystemPrompt(): string {
  return [
    'You split a Minecraft modpack request into individual pieces to search Modrinth for.',
    'Each positive is a short search phrase for ONE distinct theme, mechanic, or feature.',
    'Only include a negative if the request explicitly says to avoid, exclude, or omit something — do not invent one that was not asked for.',
    'Call record_split exactly once with your answer. Do not call any other tool and do not reply with plain text.',
  ].join(' ');
}

function toStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string' && v.trim() !== '') : [];
}

/**
 * Splits a request using a local Ollama model in a single call — no
 * multi-turn loop, since extracting a structured list is a one-shot task,
 * not a search-and-decide task.
 */
export class OllamaPromptSplitter implements PromptSplitter {
  async split(description: string): Promise<SplitPrompt> {
    const reply = await ollamaChat(
      [
        { role: 'system', content: buildSplitSystemPrompt() },
        { role: 'user', content: description },
      ],
      [SPLIT_TOOL],
    );

    const call = reply.tool_calls?.find((c) => c.function.name === 'record_split');
    if (!call) {
      throw new Error('The AI did not split the request into searchable pieces. Try rephrasing it.');
    }

    const positives = toStringArray(call.function.arguments.positives);
    const negatives = toStringArray(call.function.arguments.negatives);
    if (positives.length === 0) {
      throw new Error('The AI could not find anything to search for in that description.');
    }
    return { positives, negatives };
  }
}
