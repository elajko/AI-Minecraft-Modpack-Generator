import { searchMods, type ModrinthSearchHit } from './modrinthApi';
import type { PackTarget } from './modpack';

export interface ModSearchQuery {
  /** One theme/mechanic/feature to search for. */
  positive: string;
  /** The full cumulative negative list, applied alongside every positive. */
  negatives: string[];
}

/**
 * Turns one (positive, negatives) query into real Modrinth results. Swappable
 * — a smarter implementation could judge relevance with an LLM instead of a
 * keyword filter, without the orchestrator needing to change.
 */
export interface ModSearcher {
  search(query: ModSearchQuery, target: PackTarget): Promise<ModrinthSearchHit[]>;
}

const RESULTS_PER_SEARCH = 10;

export function textMatchesAnyKeyword(text: string, keywords: string[]): boolean {
  const lower = text.toLowerCase();
  return keywords.some((keyword) => keyword.trim() !== '' && lower.includes(keyword.toLowerCase()));
}

export function filterOutNegativeMatches(hits: ModrinthSearchHit[], negatives: string[]): ModrinthSearchHit[] {
  if (negatives.length === 0) return hits;
  return hits.filter((hit) => !textMatchesAnyKeyword(`${hit.title} ${hit.description}`, negatives));
}

/**
 * Searches Modrinth for the positive phrase and drops any result whose title
 * or description mentions a negative keyword. No LLM involved in this step —
 * fast and deterministic, since the model's only job in this pipeline is
 * splitting the request, not judging individual mods.
 */
export class KeywordFilteredModSearcher implements ModSearcher {
  async search({ positive, negatives }: ModSearchQuery, target: PackTarget): Promise<ModrinthSearchHit[]> {
    const page = await searchMods(positive, target.gameVersion, target.loader, 0, RESULTS_PER_SEARCH);
    return filterOutNegativeMatches(page.hits, negatives);
  }
}
