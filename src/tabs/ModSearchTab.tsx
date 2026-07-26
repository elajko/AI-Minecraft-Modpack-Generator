import { useEffect, useMemo, useState, type Dispatch, type FormEvent, type SetStateAction } from 'react';
import { fetchModLoaders, getCompatibleVersions, getProjectTitles, searchMods, type ModrinthSearchHit } from '../lib/modrinthApi';
import { fetchModrinthVersions } from '../lib/modrinthVersions';
import { addModToPack, type PackMod, type PackTarget } from '../lib/modpack';
import './ModSearchTab.css';

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
  const [results, setResults] = useState<ModrinthSearchHit[] | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [rowStatus, setRowStatus] = useState<Record<string, RowStatus>>({});
  const [addingId, setAddingId] = useState<string | null>(null);

  async function runSearch(e: FormEvent) {
    e.preventDefault();
    if (!targetReady) return;
    setSearchLoading(true);
    setSearchError(null);
    try {
      setResults(await searchMods(query, target.gameVersion, target.loader));
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : String(err));
    } finally {
      setSearchLoading(false);
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
    <div className="tab-panels">
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

      <section className="panel">
        <h2>Search Modrinth</h2>
        <form className="search-form" onSubmit={runSearch}>
          <input type="text" placeholder="Search for mods…" value={query} onChange={(e) => setQuery(e.target.value)} />
          <button type="submit" disabled={!targetReady || searchLoading}>
            {searchLoading ? 'Searching…' : 'Search'}
          </button>
        </form>
        {searchError && <p className="status error">{searchError}</p>}
      </section>

      {results && (
        <section className="panel">
          <h2>Results ({results.length})</h2>
          {results.length === 0 && <p className="status">No mods matched that search for {target.loader} {target.gameVersion}.</p>}
          <ul className="mod-list">
            {results.map((hit) => (
              <li key={hit.projectId} className="mod-row">
                {hit.iconUrl ? <img src={hit.iconUrl} alt="" className="mod-row-icon" /> : <div className="mod-row-icon" />}
                <div className="mod-row-body">
                  <div className="mod-row-title">
                    {hit.title} <span className="mod-row-author">by {hit.author}</span>
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
  );
}
