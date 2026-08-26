import { searchMods, type ModrinthSearchHit } from './modrinthApi';
import { ollamaChat, type OllamaMessage, type OllamaToolDefinition } from './ollama';
import type { PackTarget } from './modpack';

const MAX_TURNS = 7;
const RESULTS_PER_SEARCH = 6;
const MAX_PROPOSED_MODS = 15;

const TOOLS: OllamaToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'search_mods',
      description: 'Search Modrinth for mods matching a short text query. Call this once per distinct idea in the request (theme, mechanic, exclusion check, etc).',
      parameters: {
        type: 'object',
        properties: { query: { type: 'string', description: 'A short search query, e.g. "dark fantasy weapons" or "minimap".' } },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'propose_mods',
      description:
        'Finish the task by proposing the final list of mods for the pack. Only use project ids that were returned by search_mods — never invent one.',
      parameters: {
        type: 'object',
        properties: {
          project_ids: { type: 'array', description: 'Project ids to propose, drawn only from search_mods results.', items: { type: 'string' } },
        },
        required: ['project_ids'],
      },
    },
  },
];

function buildSystemPrompt(target: PackTarget): string {
  return [
    `You are curating mods for a Minecraft ${target.gameVersion} ${target.loader} modpack.`,
    'You do not know current Modrinth mod names, ids, or availability from memory — that information changes constantly and your training data is stale.',
    'You MUST call the search_mods tool to find real candidates. Never invent a project id or claim a mod exists without it appearing in a search_mods result.',
    'Call search_mods 2 to 4 times to cover the main themes in the request. Do not search more than that.',
    'Only pick mods that are consistent with the request: each one should add something the request calls for, and should not also add something that clashes with it — for example, a dark fantasy weapons mod that also adds modern guns would be inconsistent, even if the request never explicitly said to exclude guns.',
    `Then you MUST call the propose_mods tool with up to ${MAX_PROPOSED_MODS} project ids taken only from search results you actually saw. This is mandatory — do not just write a text summary of your picks, call the tool.`,
  ].join(' ');
}

export interface AiSearchProgress {
  message: string;
}

export interface AiSearchResult {
  hits: ModrinthSearchHit[];
  droppedHallucinatedIds: string[];
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

async function runSearchTool(
  query: string,
  target: PackTarget,
  seenHits: Map<string, ModrinthSearchHit>,
): Promise<string> {
  const page = await searchMods(query, target.gameVersion, target.loader, 0, RESULTS_PER_SEARCH);
  for (const hit of page.hits) seenHits.set(hit.projectId, hit);
  if (page.hits.length === 0) return 'No mods found for that query.';
  return page.hits.map((h) => `${h.projectId}: ${h.title} — ${truncate(h.description, 140)}`).join('\n');
}

/**
 * Runs a tool-calling loop against a local Ollama model to turn a freeform
 * modpack description into a curated mod list. The model never gets to
 * assert a project id directly into the result — `propose_mods` output is
 * filtered against `seenHits`, which only contains ids that came back from a
 * real search_mods call this session. Anything else is dropped.
 */
export async function runAiModSearch(
  description: string,
  target: PackTarget,
  onProgress: (progress: AiSearchProgress) => void,
): Promise<AiSearchResult> {
  const seenHits = new Map<string, ModrinthSearchHit>();
  const messages: OllamaMessage[] = [
    { role: 'system', content: buildSystemPrompt(target) },
    { role: 'user', content: description },
  ];

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    onProgress({ message: turn === 0 ? 'Thinking…' : 'Thinking about the results so far…' });
    const reply = await ollamaChat(messages, TOOLS);
    messages.push(reply);

    if (!reply.tool_calls || reply.tool_calls.length === 0) {
      messages.push({
        role: 'user',
        content: 'You must call the propose_mods tool now with the project ids you have found so far — do not just describe them in text.',
      });
      continue;
    }

    for (const call of reply.tool_calls) {
      if (call.function.name === 'propose_mods') {
        const rawIds = Array.isArray(call.function.arguments.project_ids) ? (call.function.arguments.project_ids as unknown[]) : [];
        const proposedIds = rawIds.filter((id): id is string => typeof id === 'string');
        const droppedHallucinatedIds = proposedIds.filter((id) => !seenHits.has(id));
        const validIds = proposedIds.filter((id) => seenHits.has(id)).slice(0, MAX_PROPOSED_MODS);

        // The model made up every id instead of copying real ones from its own
        // search results — give it one more chance rather than surfacing an
        // empty result when real candidates were sitting right there.
        if (proposedIds.length > 0 && validIds.length === 0 && seenHits.size > 0) {
          messages.push({
            role: 'user',
            content: `None of those project ids match a real search_mods result. Copy the exact ids from your search results, e.g. one of: ${Array.from(
              seenHits.keys(),
            )
              .slice(0, 8)
              .join(', ')}. Call propose_mods again with real ids only.`,
          });
          break;
        }

        return {
          hits: validIds.map((id) => seenHits.get(id)!),
          droppedHallucinatedIds,
        };
      }

      if (call.function.name === 'search_mods') {
        const query = typeof call.function.arguments.query === 'string' ? call.function.arguments.query : '';
        onProgress({ message: `Searching for "${query}"…` });
        const toolContent = query ? await runSearchTool(query, target, seenHits) : 'No query provided.';
        messages.push({ role: 'tool', tool_name: 'search_mods', content: toolContent });
      }
    }
  }

  throw new Error('The AI did not settle on a final mod list in time. Try a shorter or more specific description.');
}
