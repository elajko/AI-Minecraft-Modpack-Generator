import { describe, expect, it } from 'vitest';
import { buildTimelineSegments } from './timelineSegments';
import type { VersionRecord } from './versionResolver';

function v(id: string, type: string): VersionRecord {
  return { id, type, releasedAt: '2020-01-01' };
}

describe('buildTimelineSegments', () => {
  it('merges a consecutive run of excluded versions sharing a type into one segment', () => {
    const versions = [v('a1.0', 'alpha'), v('a1.1', 'alpha'), v('a1.2', 'alpha')];
    const segments = buildTimelineSegments(versions, new Set());
    expect(segments).toHaveLength(1);
    expect(segments[0].versions.map((x) => x.id)).toEqual(['a1.0', 'a1.1', 'a1.2']);
    expect(segments[0].included).toBe(false);
  });

  it('never merges included versions with each other, even when consecutive and same type', () => {
    const versions = [v('1.9', 'release'), v('1.9.4', 'release'), v('1.12.2', 'release')];
    const included = new Set(['1.9', '1.9.4', '1.12.2']);
    const segments = buildTimelineSegments(versions, included);
    expect(segments).toHaveLength(3);
    expect(segments.every((s) => s.versions.length === 1)).toBe(true);
  });

  it('breaks a run when the type changes, even if all excluded', () => {
    const versions = [v('a1.0', 'alpha'), v('a1.1', 'alpha'), v('b1.0', 'beta'), v('b1.1', 'beta')];
    const segments = buildTimelineSegments(versions, new Set());
    expect(segments).toHaveLength(2);
    expect(segments[0].type).toBe('alpha');
    expect(segments[1].type).toBe('beta');
  });

  it('breaks a run when inclusion state changes mid-type', () => {
    const versions = [v('a1.0', 'alpha'), v('a1.1', 'alpha'), v('a1.2', 'alpha')];
    const segments = buildTimelineSegments(versions, new Set(['a1.1']));
    expect(segments.map((s) => s.versions.map((x) => x.id))).toEqual([['a1.0'], ['a1.1'], ['a1.2']]);
  });

  it('keeps earliest/latest in order for a merged pill', () => {
    const versions = [v('15w14a', 'snapshot'), v('15w14b', 'snapshot'), v('15w14c', 'snapshot')];
    const segments = buildTimelineSegments(versions, new Set());
    expect(segments[0].versions[0].id).toBe('15w14a');
    expect(segments[0].versions[segments[0].versions.length - 1].id).toBe('15w14c');
  });
});
