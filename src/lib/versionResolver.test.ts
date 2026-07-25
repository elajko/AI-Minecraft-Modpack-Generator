import { describe, expect, it } from 'vitest';
import { resolveVersions, type ResolveResult, type VersionRecord } from './versionResolver';

// Illustrative fixture only — dates are approximate/synthetic, chosen purely to
// exercise cross-era chronological ordering (pre-classic -> indev/infdev ->
// alpha -> beta -> release -> snapshot), not to be historically authoritative.
const HISTORY: VersionRecord[] = [
  { id: 'rd-132211', type: 'other', releasedAt: '2009-05-13' },
  { id: 'rd-160052', type: 'other', releasedAt: '2009-05-16' },
  { id: 'c0.0.11a', type: 'other', releasedAt: '2009-05-17' },
  { id: 'c0.30_01c', type: 'other', releasedAt: '2010-02-19' },
  { id: 'in-20100223', type: 'other', releasedAt: '2010-02-23' },
  { id: 'inf-20100618', type: 'other', releasedAt: '2010-06-30' },
  { id: 'a1.0.4', type: 'alpha', releasedAt: '2010-07-02' },
  { id: 'a1.2.6', type: 'alpha', releasedAt: '2010-11-03' },
  { id: 'b1.0', type: 'beta', releasedAt: '2010-12-20' },
  { id: 'b1.7.3', type: 'beta', releasedAt: '2011-06-30' },
  { id: 'b1.8.1', type: 'beta', releasedAt: '2011-09-18' },
  { id: '1.0', type: 'release', releasedAt: '2011-11-18' },
  { id: '1.5.2', type: 'release', releasedAt: '2013-04-25' },
  { id: '15w14a', type: 'snapshot', releasedAt: '2015-04-01' },
  { id: '1.9', type: 'release', releasedAt: '2016-02-29' },
  { id: '1.9.4', type: 'release', releasedAt: '2016-05-10' },
  { id: '1.12.2', type: 'release', releasedAt: '2017-09-18' },
  { id: '1.16.5', type: 'release', releasedAt: '2021-01-14' },
  { id: '1.20.1', type: 'release', releasedAt: '2023-06-12' },
  { id: '23w31a', type: 'snapshot', releasedAt: '2023-08-02' },
];

function shuffled<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(((i * 2654435761) % (i + 1) + (i + 1)) % (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function ids(result: ResolveResult): string[] {
  expect(result.ok, result.ok ? '' : `expected ok, got error: ${(result as { error: string }).error}`).toBe(true);
  return (result as { ok: true; versions: VersionRecord[] }).versions.map((v) => v.id);
}

describe('resolveVersions', () => {
  it('defaults to release-only, in chronological order, independent of input order', () => {
    const result = resolveVersions(shuffled(HISTORY), { kind: 'unconstrained' });
    expect(ids(result)).toEqual(['1.0', '1.5.2', '1.9', '1.9.4', '1.12.2', '1.16.5', '1.20.1']);
  });

  it('resolves exact matches across every era, including non-release types, case/whitespace insensitive', () => {
    expect(ids(resolveVersions(HISTORY, { kind: 'exact', value: ' INF-20100618 ' }))).toEqual(['inf-20100618']);
    expect(ids(resolveVersions(HISTORY, { kind: 'exact', value: 'rd-132211' }))).toEqual(['rd-132211']);
    expect(ids(resolveVersions(HISTORY, { kind: 'exact', value: 'b1.7.3' }))).toEqual(['b1.7.3']);
  });

  it('fails an unknown/typo version with close suggestions instead of guessing', () => {
    const result = resolveVersions(HISTORY, { kind: 'exact', value: 'a1.2.7' });
    expect(result.ok).toBe(false);
    expect((result as { suggestions: string[] }).suggestions).toContain('a1.2.6');
  });

  it('gte "1.9" release-only excludes earlier snapshots/betas/alphas and later snapshots', () => {
    const result = resolveVersions(HISTORY, { kind: 'gte', value: '1.9' });
    expect(ids(result)).toEqual(['1.9', '1.9.4', '1.12.2', '1.16.5', '1.20.1']);
  });

  it('distinguishes gte from gt at the boundary', () => {
    const gte = resolveVersions(HISTORY, { kind: 'gte', value: '1.9' });
    const gt = resolveVersions(HISTORY, { kind: 'gt', value: '1.9' });
    expect(ids(gte)).toContain('1.9');
    expect(ids(gt)).not.toContain('1.9');
  });

  it('gte "1.9" with snapshots opted in pulls in the later snapshot but correctly excludes the earlier one', () => {
    const result = resolveVersions(HISTORY, { kind: 'gte', value: '1.9' }, { includeTypes: ['release', 'snapshot'] });
    const list = ids(result);
    expect(list).not.toContain('15w14a');
    expect(list).toContain('23w31a');
  });

  it('lte "1.5.2" release-only returns everything up to and including 1.5.2', () => {
    const result = resolveVersions(HISTORY, { kind: 'lte', value: '1.5.2' });
    expect(ids(result)).toEqual(['1.0', '1.5.2']);
  });

  it('resolves a range spanning the beta -> release era boundary', () => {
    const result = resolveVersions(
      HISTORY,
      { kind: 'range', min: 'b1.7.3', max: '1.0' },
      { includeTypes: ['beta', 'release'] },
    );
    expect(ids(result)).toEqual(['b1.7.3', 'b1.8.1', '1.0']);
  });

  it('rejects a range whose min is chronologically after its max', () => {
    const result = resolveVersions(HISTORY, { kind: 'range', min: '1.9', max: 'b1.0' });
    expect(result.ok).toBe(false);
    expect((result as { error: string }).error).toMatch(/chronologically after/);
  });

  it('fails a range with an unknown boundary with suggestions instead of silently dropping the constraint', () => {
    const result = resolveVersions(HISTORY, { kind: 'range', min: '1.9', max: '1.99' });
    expect(result.ok).toBe(false);
    expect((result as { suggestions: string[] }).suggestions.length).toBeGreaterThan(0);
  });
});
