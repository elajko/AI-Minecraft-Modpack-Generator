import { describe, expect, it } from 'vitest';
import { runAiModSearch } from './aiModSearch';
import type { PromptSplitter, SplitPrompt } from './promptSplitter';
import type { ModSearcher, ModSearchQuery } from './modSearcher';
import type { ModrinthSearchHit } from './modrinthApi';
import type { PackTarget } from './modpack';

function hit(projectId: string, title = projectId): ModrinthSearchHit {
  return { projectId, slug: projectId, title, author: '', description: '', iconUrl: null, downloads: 0, categories: [] };
}

class FakeSplitter implements PromptSplitter {
  constructor(private readonly result: SplitPrompt | Error) {}
  async split(): Promise<SplitPrompt> {
    if (this.result instanceof Error) throw this.result;
    return this.result;
  }
}

class FakeSearcher implements ModSearcher {
  public calls: ModSearchQuery[] = [];
  constructor(private readonly hitsByPositive: Record<string, ModrinthSearchHit[]>) {}
  async search(query: ModSearchQuery): Promise<ModrinthSearchHit[]> {
    this.calls.push(query);
    return this.hitsByPositive[query.positive] ?? [];
  }
}

const target: PackTarget = { gameVersion: '1.20.1', loader: 'fabric' };
const noopProgress = () => {};

describe('runAiModSearch', () => {
  it('searches once per positive, each combined with the full negative list', async () => {
    const splitter = new FakeSplitter({ positives: ['dark fantasy weapons', 'overhauled combat'], negatives: ['minimap'] });
    const searcher = new FakeSearcher({ 'dark fantasy weapons': [hit('a')], 'overhauled combat': [hit('b')] });

    await runAiModSearch('irrelevant', target, noopProgress, splitter, searcher);

    expect(searcher.calls).toEqual([
      { positive: 'dark fantasy weapons', negatives: ['minimap'] },
      { positive: 'overhauled combat', negatives: ['minimap'] },
    ]);
  });

  it('deduplicates hits found by more than one positive search', async () => {
    const splitter = new FakeSplitter({ positives: ['weapons', 'combat'], negatives: [] });
    const searcher = new FakeSearcher({ weapons: [hit('shared'), hit('a')], combat: [hit('shared'), hit('b')] });

    const result = await runAiModSearch('irrelevant', target, noopProgress, splitter, searcher);

    expect(result.hits.map((h) => h.projectId).sort()).toEqual(['a', 'b', 'shared']);
  });

  it('returns the positives/negatives the request was split into', async () => {
    const splitter = new FakeSplitter({ positives: ['exploration'], negatives: ['minimap'] });
    const searcher = new FakeSearcher({ exploration: [] });

    const result = await runAiModSearch('irrelevant', target, noopProgress, splitter, searcher);

    expect(result.positives).toEqual(['exploration']);
    expect(result.negatives).toEqual(['minimap']);
  });

  it('never calls the searcher if the splitter fails', async () => {
    const splitter = new FakeSplitter(new Error('could not split'));
    const searcher = new FakeSearcher({});

    await expect(runAiModSearch('irrelevant', target, noopProgress, splitter, searcher)).rejects.toThrow('could not split');
    expect(searcher.calls).toEqual([]);
  });

  it('returns no hits when no positive search finds anything', async () => {
    const splitter = new FakeSplitter({ positives: ['obscure theme'], negatives: [] });
    const searcher = new FakeSearcher({ 'obscure theme': [] });

    const result = await runAiModSearch('irrelevant', target, noopProgress, splitter, searcher);

    expect(result.hits).toEqual([]);
  });
});
