import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { resolveVersions, type ResolveResult, type VersionConstraint, type VersionRecord } from '../lib/versionResolver';
import { fetchModrinthVersions, SYNTHETIC_FIXTURE } from '../lib/modrinthVersions';
import './VersionResolverTab.css';

type ConstraintKind = VersionConstraint['kind'];

const TYPE_COLORS: Record<string, string> = {
  release: '#4caf50',
  snapshot: '#ff9800',
  beta: '#2196f3',
  alpha: '#f44336',
  other: '#9e9e9e',
};

function colorFor(type: string): string {
  return TYPE_COLORS[type] ?? '#9c27b0';
}

export function VersionResolverTab() {
  const [source, setSource] = useState<'fixture' | 'live'>('fixture');
  const [liveVersions, setLiveVersions] = useState<VersionRecord[] | null>(null);
  const [liveError, setLiveError] = useState<string | null>(null);
  const [liveLoading, setLiveLoading] = useState(false);

  const [kind, setKind] = useState<ConstraintKind>('gte');
  const [value, setValue] = useState('1.9');
  const [minValue, setMinValue] = useState('b1.7.3');
  const [maxValue, setMaxValue] = useState('1.0');
  const [includeTypes, setIncludeTypes] = useState<Set<string>>(new Set(['release']));

  useEffect(() => {
    if (source !== 'live' || liveVersions || liveLoading) return;
    setLiveLoading(true);
    setLiveError(null);
    fetchModrinthVersions()
      .then(setLiveVersions)
      .catch((e) => setLiveError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLiveLoading(false));
  }, [source, liveVersions, liveLoading]);

  const versions = source === 'fixture' ? SYNTHETIC_FIXTURE : (liveVersions ?? []);

  const availableTypes = useMemo(() => Array.from(new Set(versions.map((v) => v.type))).sort(), [versions]);

  const sorted = useMemo(
    () => [...versions].sort((a, b) => Date.parse(a.releasedAt) - Date.parse(b.releasedAt)),
    [versions],
  );

  const constraint: VersionConstraint = useMemo(() => {
    if (kind === 'unconstrained') return { kind: 'unconstrained' };
    if (kind === 'range') return { kind: 'range', min: minValue, max: maxValue };
    return { kind, value };
  }, [kind, value, minValue, maxValue]);

  const result: ResolveResult | null = versions.length
    ? resolveVersions(versions, constraint, { includeTypes: Array.from(includeTypes) })
    : null;

  const resolvedIds = useMemo(() => {
    if (!result || !result.ok) return new Set<string>();
    return new Set(result.versions.map((v) => v.id));
  }, [result]);

  function toggleType(type: string) {
    setIncludeTypes((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  }

  return (
    <div className="resolver-tab">
      <section className="panel">
        <h2>Data source</h2>
        <div className="source-toggle">
          <label>
            <input type="radio" checked={source === 'fixture'} onChange={() => setSource('fixture')} />
            Synthetic fixture ({SYNTHETIC_FIXTURE.length} versions, rd- through modern snapshots)
          </label>
          <label>
            <input type="radio" checked={source === 'live'} onChange={() => setSource('live')} />
            Live Modrinth data {liveVersions ? `(${liveVersions.length} versions loaded)` : ''}
          </label>
        </div>
        {source === 'live' && liveLoading && <p className="status">Fetching from api.modrinth.com…</p>}
        {source === 'live' && liveError && <p className="status error">Failed to load: {liveError}</p>}
      </section>

      <section className="panel">
        <h2>Constraint</h2>
        <div className="constraint-form">
          <label>
            Kind
            <select value={kind} onChange={(e) => setKind(e.target.value as ConstraintKind)}>
              <option value="unconstrained">unconstrained</option>
              <option value="exact">exact</option>
              <option value="gte">gte (&#8805;)</option>
              <option value="gt">gt (&gt;)</option>
              <option value="lte">lte (&#8804;)</option>
              <option value="lt">lt (&lt;)</option>
              <option value="range">range</option>
            </select>
          </label>

          {kind !== 'unconstrained' && kind !== 'range' && (
            <label>
              Version
              <input list="version-ids" value={value} onChange={(e) => setValue(e.target.value)} />
            </label>
          )}

          {kind === 'range' && (
            <>
              <label>
                Min
                <input list="version-ids" value={minValue} onChange={(e) => setMinValue(e.target.value)} />
              </label>
              <label>
                Max
                <input list="version-ids" value={maxValue} onChange={(e) => setMaxValue(e.target.value)} />
              </label>
            </>
          )}

          <datalist id="version-ids">
            {sorted.map((v) => (
              <option key={v.id} value={v.id} />
            ))}
          </datalist>

          <fieldset className="type-filter">
            <legend>Include types</legend>
            {availableTypes.map((type) => (
              <label key={type} className="type-checkbox" style={{ '--type-color': colorFor(type) } as CSSProperties}>
                <input type="checkbox" checked={includeTypes.has(type)} onChange={() => toggleType(type)} />
                <span className="dot" />
                {type}
              </label>
            ))}
          </fieldset>
        </div>
      </section>

      <section className="panel">
        <h2>Result</h2>
        {!result && <p className="status">No versions loaded yet.</p>}
        {result && !result.ok && (
          <div className="status error">
            <p>{result.error}</p>
            {result.suggestions && result.suggestions.length > 0 && <p>Did you mean: {result.suggestions.join(', ')}?</p>}
          </div>
        )}
        {result && result.ok && (
          <p className="status">
            {result.versions.length} of {versions.length} versions match.
          </p>
        )}
      </section>

      <section className="panel timeline-panel">
        <h2>Timeline ({sorted.length} versions, oldest &rarr; newest)</h2>
        <div className="timeline">
          {sorted.map((v) => (
            <div
              key={v.id}
              className={`tick ${resolvedIds.has(v.id) ? 'included' : 'excluded'}`}
              style={{ '--type-color': colorFor(v.type) } as CSSProperties}
              title={`${v.id} · ${v.type} · ${v.releasedAt}`}
            />
          ))}
        </div>
        <div className="legend">
          {Object.entries(TYPE_COLORS).map(([type, color]) => (
            <span key={type} className="legend-item">
              <span className="dot" style={{ background: color }} />
              {type}
            </span>
          ))}
        </div>
      </section>
    </div>
  );
}
