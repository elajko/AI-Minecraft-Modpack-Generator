import { describe, expect, it } from 'vitest';
import { runAiModSearch } from './aiModSearch';
import type { PromptSplitter, SplitPrompt } from './promptSplitter';
import type { ModSearcher, ModSearchQuery } from './modSearcher';
import type { ModrinthSearchHit } from './modrinthApi';
import type { PackTarget } from './modpack';

function hit(projectId: string, title = projectId): ModrinthSearchHit {
  return { projectId, slug: projectId, title, author: '', description: '', iconUrl: null, downloads: 0, categories: [], versions: [] };
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

// The per-positive search/combine/dedupe behavior itself is tested directly
// against searchAcrossPositives in modSearcher.test.ts. These tests cover
// what's unique to this orchestrator: wiring the splitter's output into that
// shared logic, and propagating splitter failures.
describe('runAiModSearch', () => {
  it('passes the split positives/negatives through to the searcher', async () => {
    const splitter = new FakeSplitter({ positives: ['dark fantasy weapons', 'overhauled combat'], negatives: ['minimap'] });
    const searcher = new FakeSearcher({ 'dark fantasy weapons': [hit('a')], 'overhauled combat': [hit('b')] });

    const result = await runAiModSearch('irrelevant', target, noopProgress, splitter, searcher);

    expect(searcher.calls).toEqual([
      { positive: 'dark fantasy weapons', negatives: ['minimap'], loader: 'fabric' },
      { positive: 'overhauled combat', negatives: ['minimap'], loader: 'fabric' },
    ]);
    expect(result.hits.map((h) => h.projectId).sort()).toEqual(['a', 'b']);
    expect(result.positives).toEqual(['dark fantasy weapons', 'overhauled combat']);
    expect(result.negatives).toEqual(['minimap']);
  });

  it('never calls the searcher if the splitter fails', async () => {
    const splitter = new FakeSplitter(new Error('could not split'));
    const searcher = new FakeSearcher({});

    await expect(runAiModSearch('irrelevant', target, noopProgress, splitter, searcher)).rejects.toThrow('could not split');
    expect(searcher.calls).toEqual([]);
  });

  it('reports progress for the split step and each positive search', async () => {
    const splitter = new FakeSplitter({ positives: ['weapons'], negatives: [] });
    const searcher = new FakeSearcher({ weapons: [] });
    const messages: string[] = [];

    await runAiModSearch('irrelevant', target, (p) => messages.push(p.message), splitter, searcher);

    expect(messages).toEqual(['Splitting the request into searchable themes…', 'Searching for "weapons"…']);
  });
});
