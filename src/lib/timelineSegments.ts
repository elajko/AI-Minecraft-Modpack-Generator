import type { VersionRecord } from './versionResolver';

export interface TimelineSegment {
  type: string;
  included: boolean;
  versions: VersionRecord[];
}

/**
 * Collapses consecutive runs of *excluded* versions that share a type into a
 * single segment, so a long unbroken stretch (e.g. hundreds of pre-1.9
 * releases) renders as one pill instead of one tick per version. Included
 * versions are never merged with each other, since those are the ones the
 * constraint actually matched and each one stays individually visible.
 *
 * `sortedVersions` must already be in chronological order.
 */
export function buildTimelineSegments(
  sortedVersions: VersionRecord[],
  includedIds: ReadonlySet<string>,
): TimelineSegment[] {
  const segments: TimelineSegment[] = [];
  for (const v of sortedVersions) {
    const included = includedIds.has(v.id);
    const last = segments[segments.length - 1];
    if (last && !included && !last.included && last.type === v.type) {
      last.versions.push(v);
    } else {
      segments.push({ type: v.type, included, versions: [v] });
    }
  }
  return segments;
}
