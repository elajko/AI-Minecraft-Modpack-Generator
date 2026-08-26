import { useEffect, useMemo, useRef, useState, type Dispatch, type FormEvent, type SetStateAction } from 'react';
import { fetchModLoaders, getCompatibleVersions, getProjectTitles, searchMods, type ModrinthSearchHit } from '../lib/modrinthApi';
import { fetchModrinthVersions } from '../lib/modrinthVersions';
import { addModToPack, type PackMod, type PackTarget } from '../lib/modpack';
import { runAiModSearch } from '../lib/aiModSearch';
import { defaultModSearcher, searchAcrossPositives } from '../lib/modSearcher';
import { formatKeywordQuery, parseKeywordQuery } from '../lib/keywordQuery';
import './ModSearchTab.css';

const PAGE_SIZE = 20;
const MAX_QUERY_DISPLAY_LENGTH = 30;

function truncateForDisplay(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

interface ModSearchTabProps {
  target: PackTarget;
  setTarget: Dispatch<SetStateAction<PackTarget>>;
  mods: PackMod[];
  setMods: Dispatch<SetStateAction<PackMod[]>>;
}

interface RowStatus {
  ok: boolean;
  message: string;
}

export function ModSearchTab({ target, setTarget, mods, setMods }: ModSearchTabProps) {
  const [gameVersions, setGameVersions] = useState<string[]>([]);
  const [loaders, setLoaders] = useState<string[]>([]);
  const [targetsError, setTargetsError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([fetchModrinthVersions(), fetchModLoaders()])
      .then(([versions, loaderList]) => {
        const releases = versions
          .filter((v) => v.type === 'release')
          .sort((a, b) => Date.parse(b.releasedAt) - Date.parse(a.releasedAt));
        setGameVersions(releases.map((v) => v.id));
        setLoaders(loaderList);
        setTarget((prev) => ({
          gameVersion: prev.gameVersion || releases[0]?.id || '',
          loader: prev.loader || (loaderList.includes('fabric') ? 'fabric' : (loaderList[0] ?? '')),
        }));
      })
      .catch((e) => setTargetsError(e instanceof Error ? e.message : String(e)));
  }, [setTarget]);

  const locked = mods.length > 0;
  const targetReady = target.gameVersion !== '' && target.loader !== '';

  const [query, setQuery] = useState('');
  const [submittedQuery, setSubmittedQuery] = useState<string | null>(null);
  // 'browse': blank query, server-paginated (Modrinth's full catalog, one page fetched at a time).
  // 'keyword' / 'ai': the full deduped aggregate is fetched once and paginated client-side.
  const [resultsMode, setResultsMode] = useState<'browse' | 'keyword' | 'ai' | null>(null);
  const [results, setResults] = useState<ModrinthSearchHit[] | null>(null);
  const [offset, setOffset] = useState(0);
  const [totalHits, setTotalHits] = useState(0);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [rowStatus, setRowStatus] = useState<Record<string, RowStatus>>({});
  const [addingId, setAddingId] = useState<string | null>(null);

  const visibleResults = useMemo(() => {
    if (!results) return null;
    return resultsMode === 'browse' ? results : results.slice(offset, offset + PAGE_SIZE);
  }, [results, resultsMode, offset]);

  const [aiDescription, setAiDescription] = useState('');
  const [submittedAiDescription, setSubmittedAiDescription] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiProgressMessage, setAiProgressMessage] = useState<string | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiSummary, setAiSummary] = useState<string | null>(null);
  const [aiElapsedSeconds, setAiElapsedSeconds] = useState(0);

  useEffect(() => {
    if (!aiLoading) return;
    const start = Date.now();
    setAiElapsedSeconds(0);
    const interval = setInterval(() => setAiElapsedSeconds(Math.floor((Date.now() - start) / 1000)), 1000);
    return () => clearInterval(interval);
  }, [aiLoading]);

  // Blank query: browse Modrinth's full catalog, one server page at a time —
  // there's nothing to split into keywords, so this bypasses the searcher.
  async function performBrowseSearch(newOffset: number) {
    setSearchLoading(true);
    setSearchError(null);
    try {
      const page = await searchMods('', target.gameVersion, target.loader, newOffset, PAGE_SIZE);
      setResults(page.hits);
      setResultsMode('browse');
      setOffset(page.offset);
      setTotalHits(page.totalHits);
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : String(err));
    } finally {
      setSearchLoading(false);
    }
  }

  // Non-blank query: parse the comma/bang syntax into positives/negatives and
  // run it through the same searcher the AI pipeline uses. Fetches the whole
  // deduped aggregate once; pagination over it is client-side from here on.
  async function performKeywordSearch(q: string) {
    setSearchLoading(true);
    setSearchError(null);
    try {
      const { positives, negatives } = parseKeywordQuery(q);
      const hits = await searchAcrossPositives(positives, negatives, target, defaultModSearcher);
      setResults(hits);
      setResultsMode('keyword');
      setOffset(0);
      setTotalHits(hits.length);
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : String(err));
    } finally {
      setSearchLoading(false);
    }
  }

  async function runSearch(e: FormEvent) {
    e.preventDefault();
    if (!targetReady) return;
    setSubmittedQuery(query);
    if (query.trim() === '') {
      await performBrowseSearch(0);
    } else {
      await performKeywordSearch(query);
    }
  }

  function goToPage(newOffset: number) {
    if (resultsMode === 'browse') {
      performBrowseSearch(newOffset);
    } else {
      setOffset(newOffset);
    }
  }

  async function clearSearch() {
    setQuery('');
    setSubmittedQuery('');
    await performBrowseSearch(0);
  }

  const autoSearchedRef = useRef(false);
  useEffect(() => {
    if (!targetReady || autoSearchedRef.current) return;
    autoSearchedRef.current = true;
    setSubmittedQuery('');
    performBrowseSearch(0);
  }, [targetReady]);

  const queryEmpty = query.trim() === '';
  const onNonEmptySearch = submittedQuery !== null && submittedQuery !== '';
  const showClearButton = queryEmpty && onNonEmptySearch;

  async function runAiSearch(e: FormEvent) {
    e.preventDefault();
    const description = aiDescription.trim();
    if (!targetReady || !description) return;
    setAiLoading(true);
    setAiError(null);
    setAiSummary(null);
    setAiProgressMessage('Thinking…');
    setSubmittedAiDescription(description);
    try {
      const result = await runAiModSearch(description, target, (progress) => setAiProgressMessage(progress.message));
      setResults(result.hits);
      setResultsMode('ai');
      setOffset(0);
      setTotalHits(result.hits.length);
      // Mirror the AI's query into the plain search bar using the same
      // comma/bang syntax it understands, so re-running it (or tweaking it
      // by hand) reproduces this exact result via the same searcher.
      setQuery(formatKeywordQuery({ positives: result.positives, negatives: result.negatives }));
      const count = result.hits.length;
      let summary = `Found ${count} mod${count === 1 ? '' : 's'} across ${result.positives.length} theme${result.positives.length === 1 ? '' : 's'}: ${result.positives.join(', ')}.`;
      if (result.negatives.length > 0) {
        summary += ` Excluded: ${result.negatives.join(', ')}.`;
      }
      setAiSummary(summary);
    } catch (err) {
      setAiError(err instanceof Error ? err.message : String(err));
    } finally {
      setAiLoading(false);
      setAiProgressMessage(null);
    }
  }

  async function handleAdd(hit: ModrinthSearchHit) {
    setAddingId(hit.projectId);
    setRowStatus((prev) => {
      const next = { ...prev };
      delete next[hit.projectId];
      return next;
    });
    try {
      const versions = await getCompatibleVersions(hit.projectId, target.gameVersion, target.loader);
      if (versions.length === 0) {
        setRowStatus((prev) => ({
          ...prev,
          [hit.projectId]: { ok: false, message: `No version of ${hit.title} supports ${target.loader} ${target.gameVersion}` },
        }));
        return;
      }
      const result = addModToPack(
        { target, mods },
        { projectId: hit.projectId, title: hit.title, iconUrl: hit.iconUrl, version: versions[0] },
      );
      if (!result.ok) {
        setRowStatus((prev) => ({ ...prev, [hit.projectId]: { ok: false, message: result.error } }));
        return;
      }
      setMods(result.pack.mods);
      let suffix = '';
      if (result.requiredDependencies.length > 0) {
        const titles = await getProjectTitles(result.requiredDependencies);
        const names = result.requiredDependencies.map((id) => titles[id] ?? id);
        suffix = ` (also requires: ${names.join(', ')} — add manually)`;
      }
      setRowStatus((prev) => ({ ...prev, [hit.projectId]: { ok: true, message: `Added${suffix}` } }));
    } catch (err) {
      setRowStatus((prev) => ({
        ...prev,
        [hit.projectId]: { ok: false, message: err instanceof Error ? err.message : String(err) },
      }));
    } finally {
      setAddingId(null);
    }
  }

  const addedIds = useMemo(() => new Set(mods.map((m) => m.projectId)), [mods]);

  return (
    <div className="mod-search-layout">
      <aside className="mod-search-sidebar">
        <section className="panel">
          <h2>Target</h2>
          {targetsError && <p className="status error">Failed to load versions/loaders: {targetsError}</p>}
          <div className="target-form">
            <label>
              Minecraft version
              <select
                value={target.gameVersion}
                disabled={locked || gameVersions.length === 0}
                onChange={(e) => setTarget((prev) => ({ ...prev, gameVersion: e.target.value }))}
              >
                {gameVersions.length === 0 && <option value="">Loading…</option>}
                {gameVersions.map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Loader
              <select
                value={target.loader}
                disabled={locked || loaders.length === 0}
                onChange={(e) => setTarget((prev) => ({ ...prev, loader: e.target.value }))}
              >
                {loaders.length === 0 && <option value="">Loading…</option>}
                {loaders.map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {locked && <p className="status">Locked while the pack has mods in it — clear the pack to change the target.</p>}
        </section>
      </aside>

      <div className="mod-search-main">
        <section className="panel search-panel">
          <form className="ai-search-form" onSubmit={runAiSearch}>
            <textarea
              placeholder="Describe your modpack and AI will search for matching mods, e.g. dark fantasy, lots of exploration, no minimaps…"
              value={aiDescription}
              onChange={(e) => setAiDescription(e.target.value)}
              rows={3}
            />
            <button type="submit" disabled={!targetReady || !aiDescription.trim() || aiLoading}>
              {aiLoading ? 'Searching…' : 'Search with AI'}
            </button>
          </form>
          {aiLoading && aiProgressMessage && (
            <p className="status">
              {aiProgressMessage} ({aiElapsedSeconds}s)
            </p>
          )}
          {!aiLoading && aiError && <p className="status error">{aiError}</p>}
          {!aiLoading && aiSummary && <p className="status success">{aiSummary}</p>}

          <form className="search-form" onSubmit={runSearch}>
            <input type="text" placeholder="Search mod by name…" value={query} onChange={(e) => setQuery(e.target.value)} />
            {showClearButton ? (
              <button type="button" onClick={clearSearch}>
                Clear search
              </button>
            ) : (
              <button type="submit" disabled={!targetReady || searchLoading || queryEmpty}>
                {searchLoading ? 'Searching…' : 'Search'}
              </button>
            )}
          </form>
          {searchError && <p className="status error">{searchError}</p>}
        </section>

        {results && (
          <section className="panel">
            <div className="results-header">
              <h2>
                {resultsMode === 'ai'
                  ? `AI results for ${truncateForDisplay(submittedAiDescription ?? '', MAX_QUERY_DISPLAY_LENGTH)}`
                  : resultsMode === 'keyword'
                    ? `Results for ${truncateForDisplay(submittedQuery ?? '', MAX_QUERY_DISPLAY_LENGTH)}`
                    : 'Mods'}{' '}
                ({totalHits})
              </h2>
              {totalHits > PAGE_SIZE && (
                <div className="pagination">
                  <button type="button" onClick={() => goToPage(offset - PAGE_SIZE)} disabled={searchLoading || offset === 0}>
                    Prev
                  </button>
                  <span className="status">
                    {offset + 1}–{Math.min(offset + PAGE_SIZE, totalHits)} of {totalHits}
                  </span>
                  <button
                    type="button"
                    onClick={() => goToPage(offset + PAGE_SIZE)}
                    disabled={searchLoading || offset + PAGE_SIZE >= totalHits}
                  >
                    Next
                  </button>
                </div>
              )}
            </div>
            {results.length === 0 && <p className="status">No mods matched that search for {target.loader} {target.gameVersion}.</p>}
            <ul className="mod-list">
              {visibleResults?.map((hit) => (
                <li key={hit.projectId} className="mod-row">
                  {hit.iconUrl ? <img src={hit.iconUrl} alt="" className="mod-row-icon" /> : <div className="mod-row-icon" />}
                  <div className="mod-row-body">
                    <div className="mod-row-title">
                      {hit.title}
                      {hit.author && <span className="mod-row-author"> by {hit.author}</span>}
                    </div>
                    <p className="mod-row-description">{hit.description}</p>
                    {rowStatus[hit.projectId] && (
                      <p className={`status ${rowStatus[hit.projectId].ok ? 'success' : 'error'}`}>{rowStatus[hit.projectId].message}</p>
                    )}
                  </div>
                  <button onClick={() => handleAdd(hit)} disabled={addedIds.has(hit.projectId) || addingId === hit.projectId}>
                    {addedIds.has(hit.projectId) ? 'Added' : addingId === hit.projectId ? 'Adding…' : 'Add'}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}
