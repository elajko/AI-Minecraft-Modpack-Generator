import { searchMods, type ModrinthSearchHit } from './modrinthApi';

export interface ModSearchQuery {
  /** One theme/mechanic/feature to search for. */
  positive: string;
  /** The full cumulative negative list, applied alongside every positive. */
  negatives: string[];
  loader: string;
}

/**
 * Turns one (positive, negatives, loader) query into real Modrinth results.
 * Deliberately has no notion of game version — searches are version-agnostic
 * by design, so results can be cached once and re-filtered locally whenever
 * the selected version changes, instead of re-querying. Swappable — a
 * smarter implementation could judge relevance with an LLM instead of a
 * keyword filter, without the orchestrator needing to change.
 */
export interface ModSearcher {
  search(query: ModSearchQuery): Promise<ModrinthSearchHit[]>;
}

const RESULTS_PER_SEARCH = 40;

export function textMatchesAnyKeyword(text: string, keywords: string[]): boolean {
  const lower = text.toLowerCase();
  return keywords.some((keyword) => keyword.trim() !== '' && lower.includes(keyword.toLowerCase()));
}

export function filterOutNegativeMatches(hits: ModrinthSearchHit[], negatives: string[]): ModrinthSearchHit[] {
  if (negatives.length === 0) return hits;
  return hits.filter((hit) => !textMatchesAnyKeyword(`${hit.title} ${hit.description}`, negatives));
}

/** Keeps only hits that claim support for the given Minecraft version. */
export function filterByGameVersion(hits: ModrinthSearchHit[], gameVersion: string): ModrinthSearchHit[] {
  return hits.filter((hit) => hit.versions.includes(gameVersion));
}

export interface VersionCount {
  version: string;
  count: number;
}

/**
 * Tallies how many hits support each Minecraft version, across every version
 * each hit claims to support (not just whichever one is currently selected).
 * Order is unspecified — see sortVersionCountsByRecency for display order.
 */
export function countHitsByVersion(hits: ModrinthSearchHit[]): VersionCount[] {
  const counts = new Map<string, number>();
  for (const hit of hits) {
    for (const version of hit.versions) {
      counts.set(version, (counts.get(version) ?? 0) + 1);
    }
  }
  return Array.from(counts.entries()).map(([version, count]) => ({ version, count }));
}

/**
 * Orders version counts newest-release-first, using each version's release
 * date (e.g. from fetchModrinthVersions). A version with no known date sorts
 * after every dated one, falling back to alphabetical order among those.
 */
export function sortVersionCountsByRecency(counts: VersionCount[], releasedAtByVersion: Map<string, string>): VersionCount[] {
  return [...counts].sort((a, b) => {
    const dateA = releasedAtByVersion.get(a.version);
    const dateB = releasedAtByVersion.get(b.version);
    if (dateA && dateB) return Date.parse(dateB) - Date.parse(dateA);
    if (dateA) return -1;
    if (dateB) return 1;
    return a.version.localeCompare(b.version);
  });
}

/**
 * Searches Modrinth for the positive phrase and drops any result whose title
 * or description mentions a negative keyword. No LLM involved in this step —
 * fast and deterministic, since the model's only job in this pipeline is
 * splitting the request, not judging individual mods. No game-version facet
 * either — see filterByGameVersion for why that's applied later, not here.
 */
export class KeywordFilteredModSearcher implements ModSearcher {
  async search({ positive, negatives, loader }: ModSearchQuery): Promise<ModrinthSearchHit[]> {
    const page = await searchMods(positive, loader, 0, RESULTS_PER_SEARCH);
    return filterOutNegativeMatches(page.hits, negatives);
  }
}

export const defaultModSearcher: ModSearcher = new KeywordFilteredModSearcher();

/**
 * Runs one search per positive — always combined with the *entire* negative
 * list — and dedupes the results by project id. Shared by both the AI
 * pipeline (positives/negatives come from splitting a freeform description)
 * and the plain search bar's comma syntax (positives/negatives come from
 * parsing the typed query directly), so both paths behave identically for
 * the same effective query. Results are not filtered by game version; that's
 * left to the caller so switching the selected version doesn't require
 * searching again.
 */
export async function searchAcrossPositives(
  positives: string[],
  negatives: string[],
  loader: string,
  searcher: ModSearcher = defaultModSearcher,
  onSearching?: (positive: string) => void,
): Promise<ModrinthSearchHit[]> {
  const seen = new Map<string, ModrinthSearchHit>();
  for (const positive of positives) {
    onSearching?.(positive);
    const hits = await searcher.search({ positive, negatives, loader });
    for (const hit of hits) seen.set(hit.projectId, hit);
  }
  return Array.from(seen.values());
}
