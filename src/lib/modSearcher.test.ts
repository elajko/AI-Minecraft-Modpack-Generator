import { describe, expect, it } from 'vitest';
import { filterOutNegativeMatches, searchAcrossPositives, textMatchesAnyKeyword, type ModSearchQuery, type ModSearcher } from './modSearcher';
import type { ModrinthSearchHit } from './modrinthApi';
import type { PackTarget } from './modpack';

function hit(overrides: Partial<ModrinthSearchHit> = {}): ModrinthSearchHit {
  return {
    projectId: 'proj1',
    slug: 'proj1',
    title: 'Some Mod',
    author: 'someone',
    description: 'A mod that does things.',
    iconUrl: null,
    downloads: 0,
    categories: [],
    ...overrides,
  };
}

describe('textMatchesAnyKeyword', () => {
  it('matches case-insensitively', () => {
    expect(textMatchesAnyKeyword('Adds a MINIMAP to your screen', ['minimap'])).toBe(true);
  });

  it('returns false when no keyword is present', () => {
    expect(textMatchesAnyKeyword('Adds new biomes', ['minimap', 'guns'])).toBe(false);
  });

  it('ignores blank keywords', () => {
    expect(textMatchesAnyKeyword('Adds new biomes', ['', '  '])).toBe(false);
  });
});

describe('filterOutNegativeMatches', () => {
  it('returns every hit unchanged when there are no negatives', () => {
    const hits = [hit({ projectId: 'a' }), hit({ projectId: 'b', title: 'Minimap Mod' })];
    expect(filterOutNegativeMatches(hits, [])).toEqual(hits);
  });

  it('drops a hit whose title matches a negative', () => {
    const hits = [hit({ projectId: 'a', title: 'Xaero Minimap' }), hit({ projectId: 'b', title: 'Terralith' })];
    const result = filterOutNegativeMatches(hits, ['minimap']);
    expect(result.map((h) => h.projectId)).toEqual(['b']);
  });

  it('drops a hit whose description matches a negative', () => {
    const hits = [hit({ projectId: 'a', description: 'Adds modern guns and rifles.' })];
    expect(filterOutNegativeMatches(hits, ['guns'])).toEqual([]);
  });

  it('keeps a hit that matches none of the negatives', () => {
    const hits = [hit({ projectId: 'a', title: 'Dark Fantasy Weapons' })];
    expect(filterOutNegativeMatches(hits, ['minimap', 'guns'])).toEqual(hits);
  });
});

class FakeSearcher implements ModSearcher {
  public calls: ModSearchQuery[] = [];
  constructor(private readonly hitsByPositive: Record<string, ModrinthSearchHit[]>) {}
  async search(query: ModSearchQuery): Promise<ModrinthSearchHit[]> {
    this.calls.push(query);
    return this.hitsByPositive[query.positive] ?? [];
  }
}

const target: PackTarget = { gameVersion: '1.20.1', loader: 'fabric' };

describe('searchAcrossPositives', () => {
  it('searches once per positive, each combined with the full negative list', async () => {
    const searcher = new FakeSearcher({ weapons: [hit({ projectId: 'a' })], exploration: [hit({ projectId: 'b' })] });

    await searchAcrossPositives(['weapons', 'exploration'], ['minimap'], target, searcher);

    expect(searcher.calls).toEqual([
      { positive: 'weapons', negatives: ['minimap'] },
      { positive: 'exploration', negatives: ['minimap'] },
    ]);
  });

  it('deduplicates hits found by more than one positive search', async () => {
    const searcher = new FakeSearcher({
      weapons: [hit({ projectId: 'shared' }), hit({ projectId: 'a' })],
      combat: [hit({ projectId: 'shared' }), hit({ projectId: 'b' })],
    });

    const result = await searchAcrossPositives(['weapons', 'combat'], [], target, searcher);

    expect(result.map((h) => h.projectId).sort()).toEqual(['a', 'b', 'shared']);
  });

  it('calls the onSearching callback with each positive as it goes', async () => {
    const searcher = new FakeSearcher({ weapons: [], combat: [] });
    const seen: string[] = [];

    await searchAcrossPositives(['weapons', 'combat'], [], target, searcher, (positive) => seen.push(positive));

    expect(seen).toEqual(['weapons', 'combat']);
  });

  it('returns no hits when there are no positives to search', async () => {
    const searcher = new FakeSearcher({});
    expect(await searchAcrossPositives([], [], target, searcher)).toEqual([]);
    expect(searcher.calls).toEqual([]);
  });
});
