import type { ModrinthSearchHit } from './modrinthApi';
import type { PackTarget } from './modpack';
import { OllamaPromptSplitter, type PromptSplitter } from './promptSplitter';
import { defaultModSearcher, searchAcrossPositives, type ModSearcher } from './modSearcher';

export interface AiSearchProgress {
  message: string;
}

export interface AiSearchResult {
  hits: ModrinthSearchHit[];
  positives: string[];
  negatives: string[];
}

const defaultSplitter = new OllamaPromptSplitter();

/**
 * Turns a freeform modpack description into a mod list in two stages:
 *
 * 1. `splitter` breaks the description into individual positive asks (one
 *    theme/mechanic/feature each) and the full negative list.
 * 2. `searchAcrossPositives` runs one search per positive, always combined
 *    with the *entire* negative list, deduped by project id — the exact
 *    same shared logic the plain search bar's comma syntax uses.
 *
 * Splitter and searcher are injected (defaulting to the local-Ollama /
 * keyword-filter pair) so either strategy can be swapped independently —
 * e.g. a different splitting model, or a searcher that judges relevance with
 * an LLM instead of a keyword filter — without touching this orchestration.
 */
export async function runAiModSearch(
  description: string,
  target: PackTarget,
  onProgress: (progress: AiSearchProgress) => void,
  splitter: PromptSplitter = defaultSplitter,
  searcher: ModSearcher = defaultModSearcher,
): Promise<AiSearchResult> {
  onProgress({ message: 'Splitting the request into searchable themes…' });
  const { positives, negatives } = await splitter.split(description);

  const hits = await searchAcrossPositives(positives, negatives, target, searcher, (positive) =>
    onProgress({ message: `Searching for "${positive}"…` }),
  );

  return { hits, positives, negatives };
}
