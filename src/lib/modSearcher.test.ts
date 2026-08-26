import { describe, expect, it } from 'vitest';
import { filterOutNegativeMatches, textMatchesAnyKeyword } from './modSearcher';
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
