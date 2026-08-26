import type { SplitPrompt } from './promptSplitter';

/**
 * Parses a comma-separated keyword string typed into the plain search bar
 * into the same {positives, negatives} shape the AI splitter produces. A
 * piece prefixed with `!` is a negative (the bang is stripped); everything
 * else is a positive. Blank pieces (extra commas, whitespace) are ignored.
 */
export function parseKeywordQuery(query: string): SplitPrompt {
  const positives: string[] = [];
  const negatives: string[] = [];
  for (const raw of query.split(',')) {
    const trimmed = raw.trim();
    if (trimmed === '') continue;
    if (trimmed.startsWith('!')) {
      const negative = trimmed.slice(1).trim();
      if (negative !== '') negatives.push(negative);
    } else {
      positives.push(trimmed);
    }
  }
  return { positives, negatives };
}

/**
 * The inverse of parseKeywordQuery — turns a {positives, negatives} split
 * back into a comma-separated string that, if fed back through
 * parseKeywordQuery, reproduces the same split (and therefore the same
 * search results, since both paths run through the same ModSearcher).
 */
export function formatKeywordQuery({ positives, negatives }: SplitPrompt): string {
  return [...positives, ...negatives.map((n) => `!${n}`)].join(', ');
}
