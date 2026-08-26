import { describe, expect, it } from 'vitest';
import { formatKeywordQuery, parseKeywordQuery } from './keywordQuery';

describe('parseKeywordQuery', () => {
  it('splits plain comma-separated keywords into positives', () => {
    expect(parseKeywordQuery('weapons, exploration, biomes')).toEqual({
      positives: ['weapons', 'exploration', 'biomes'],
      negatives: [],
    });
  });

  it('treats a single keyword with no comma as one positive', () => {
    expect(parseKeywordQuery('sodium')).toEqual({ positives: ['sodium'], negatives: [] });
  });

  it('routes bang-prefixed keywords to negatives, stripping the bang', () => {
    expect(parseKeywordQuery('weapons, !minimap')).toEqual({ positives: ['weapons'], negatives: ['minimap'] });
  });

  it('trims whitespace around pieces and around the negative after stripping the bang', () => {
    expect(parseKeywordQuery('  weapons  ,  !  minimap  ')).toEqual({ positives: ['weapons'], negatives: ['minimap'] });
  });

  it('ignores blank pieces from extra or trailing commas', () => {
    expect(parseKeywordQuery('weapons,, exploration,')).toEqual({ positives: ['weapons', 'exploration'], negatives: [] });
  });

  it('returns empty positives and negatives for a blank string', () => {
    expect(parseKeywordQuery('   ')).toEqual({ positives: [], negatives: [] });
  });

  it('drops a lone bang with nothing after it', () => {
    expect(parseKeywordQuery('weapons, !')).toEqual({ positives: ['weapons'], negatives: [] });
  });
});

describe('formatKeywordQuery', () => {
  it('joins positives with a comma', () => {
    expect(formatKeywordQuery({ positives: ['weapons', 'exploration'], negatives: [] })).toBe('weapons, exploration');
  });

  it('appends negatives with a bang prefix after the positives', () => {
    expect(formatKeywordQuery({ positives: ['weapons'], negatives: ['minimap'] })).toBe('weapons, !minimap');
  });
});

describe('parseKeywordQuery and formatKeywordQuery round-trip', () => {
  it('reproduces the same split after formatting then reparsing', () => {
    const original = { positives: ['dark fantasy biomes', 'overhauled combat'], negatives: ['minimap', 'guns'] };
    expect(parseKeywordQuery(formatKeywordQuery(original))).toEqual(original);
  });
});
