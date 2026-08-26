import { describe, expect, it } from 'vitest';
import {
  countHitsByVersion,
  filterByGameVersion,
  filterOutNegativeMatches,
  searchAcrossPositives,
  sortVersionCountsByRecency,
  textMatchesAnyKeyword,
  type ModSearchQuery,
  type ModSearcher,
} from './modSearcher';
import type { ModrinthSearchHit } from './modrinthApi';

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
    versions: ['1.20.1'],
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

describe('filterByGameVersion', () => {
  it('keeps only hits whose versions list includes the given version', () => {
    const hits = [hit({ projectId: 'a', versions: ['1.20.1', '1.20.2'] }), hit({ projectId: 'b', versions: ['1.19.4'] })];
    expect(filterByGameVersion(hits, '1.20.1').map((h) => h.projectId)).toEqual(['a']);
  });

  it('returns an empty array when nothing supports the version', () => {
    const hits = [hit({ versions: ['1.19.4'] })];
    expect(filterByGameVersion(hits, '1.20.1')).toEqual([]);
  });
});

describe('countHitsByVersion', () => {
  it('counts how many hits support each version, across every version each hit supports', () => {
    const hits = [
      hit({ projectId: 'a', versions: ['1.20.1', '1.19.4'] }),
      hit({ projectId: 'b', versions: ['1.20.1'] }),
      hit({ projectId: 'c', versions: ['1.19.4'] }),
    ];
    const result = countHitsByVersion(hits);
    expect(result).toHaveLength(2);
    expect(result).toEqual(
      expect.arrayContaining([
        { version: '1.19.4', count: 2 },
        { version: '1.20.1', count: 2 },
      ]),
    );
  });

  it('returns an empty array for no hits', () => {
    expect(countHitsByVersion([])).toEqual([]);
  });
});

describe('sortVersionCountsByRecency', () => {
  it('orders newest release first using the provided release dates', () => {
    const counts = [
      { version: '1.19.4', count: 1 },
      { version: '1.20.1', count: 1 },
    ];
    const dates = new Map([
      ['1.19.4', '2022-07-27'],
      ['1.20.1', '2023-06-12'],
    ]);
    expect(sortVersionCountsByRecency(counts, dates).map((c) => c.version)).toEqual(['1.20.1', '1.19.4']);
  });

  it('sorts versions with no known date after every dated version', () => {
    const counts = [
      { version: 'mystery-snapshot', count: 1 },
      { version: '1.20.1', count: 1 },
    ];
    const dates = new Map([['1.20.1', '2023-06-12']]);
    expect(sortVersionCountsByRecency(counts, dates).map((c) => c.version)).toEqual(['1.20.1', 'mystery-snapshot']);
  });

  it('falls back to alphabetical order among versions with no known date', () => {
    const counts = [
      { version: 'zeta', count: 1 },
      { version: 'alpha', count: 1 },
    ];
    expect(sortVersionCountsByRecency(counts, new Map()).map((c) => c.version)).toEqual(['alpha', 'zeta']);
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

describe('searchAcrossPositives', () => {
  it('searches once per positive, each combined with the full negative list and the loader', async () => {
    const searcher = new FakeSearcher({ weapons: [hit({ projectId: 'a' })], exploration: [hit({ projectId: 'b' })] });

    await searchAcrossPositives(['weapons', 'exploration'], ['minimap'], 'fabric', searcher);

    expect(searcher.calls).toEqual([
      { positive: 'weapons', negatives: ['minimap'], loader: 'fabric' },
      { positive: 'exploration', negatives: ['minimap'], loader: 'fabric' },
    ]);
  });

  it('deduplicates hits found by more than one positive search', async () => {
    const searcher = new FakeSearcher({
      weapons: [hit({ projectId: 'shared' }), hit({ projectId: 'a' })],
      combat: [hit({ projectId: 'shared' }), hit({ projectId: 'b' })],
    });

    const result = await searchAcrossPositives(['weapons', 'combat'], [], 'fabric', searcher);

    expect(result.map((h) => h.projectId).sort()).toEqual(['a', 'b', 'shared']);
  });

  it('calls the onSearching callback with each positive as it goes', async () => {
    const searcher = new FakeSearcher({ weapons: [], combat: [] });
    const seen: string[] = [];

    await searchAcrossPositives(['weapons', 'combat'], [], 'fabric', searcher, (positive) => seen.push(positive));

    expect(seen).toEqual(['weapons', 'combat']);
  });

  it('returns no hits when there are no positives to search', async () => {
    const searcher = new FakeSearcher({});
    expect(await searchAcrossPositives([], [], 'fabric', searcher)).toEqual([]);
    expect(searcher.calls).toEqual([]);
  });
});
