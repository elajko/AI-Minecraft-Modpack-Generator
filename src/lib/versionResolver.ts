export interface VersionRecord {
  id: string;
  type: string; // e.g. "release", "snapshot", "beta", "alpha", "other"
  releasedAt: string; // ISO 8601 date/time string
}

export type VersionConstraint =
  | { kind: 'unconstrained' }
  | { kind: 'exact'; value: string }
  | { kind: 'gte' | 'gt' | 'lte' | 'lt'; value: string }
  | { kind: 'range'; min: string; max: string };

export interface ResolveOptions {
  includeTypes?: string[];
}

export type ResolveResult =
  | { ok: true; versions: VersionRecord[] }
  | { ok: false; error: string; suggestions?: string[] };

function normalize(id: string): string {
  return id.trim().toLowerCase();
}

function sortByDate(versions: VersionRecord[]): VersionRecord[] {
  return [...versions].sort((a, b) => Date.parse(a.releasedAt) - Date.parse(b.releasedAt));
}

function findIndexById(sorted: VersionRecord[], id: string): number {
  const target = normalize(id);
  return sorted.findIndex((v) => normalize(v.id) === target);
}

function levenshtein(a: string, b: string): number {
  const dp: number[][] = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i++) dp[i][0] = i;
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] =
        a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[a.length][b.length];
}

function suggestClosest(sorted: VersionRecord[], id: string, count = 3): string[] {
  const target = normalize(id);
  return sorted
    .map((v) => ({ id: v.id, distance: levenshtein(target, normalize(v.id)) }))
    .sort((a, b) => a.distance - b.distance)
    .slice(0, count)
    .map((v) => v.id);
}

/**
 * Resolves a version constraint against a list of known versions.
 *
 * `includeTypes` filters which version *types* are allowed into range/gte/lte/
 * unconstrained results (defaults to release-only). It does NOT apply to an
 * `exact` lookup — naming a specific version, even a beta/alpha/snapshot, is
 * always honored if it exists, since there's nothing ambiguous to filter.
 *
 * Versions are never ordered by parsing their id — only `releasedAt` decides
 * order, since Minecraft version strings (rd-132211, inf-20100618, a1.2.6,
 * b1.7.3, 15w14a, 1.20.1 ...) don't share a comparable scheme.
 */
export function resolveVersions(
  allVersions: VersionRecord[],
  constraint: VersionConstraint,
  options: ResolveOptions = {},
): ResolveResult {
  const includeTypes = options.includeTypes || ['release'];
  const sorted = sortByDate(allVersions);

  const err = (message: string, suggestions?: string[]): ResolveResult =>
    suggestions ? { ok: false, error: message, suggestions } : { ok: false, error: message };
  const ok = (versions: VersionRecord[]): ResolveResult => ({ ok: true, versions });

  const lookup = (value: string): { idx: number; error?: ResolveResult } => {
    const idx = findIndexById(sorted, value);
    if (idx === -1) return { idx: -1, error: err(`Unknown version "${value}"`, suggestClosest(sorted, value)) };
    return { idx };
  };

  switch (constraint.kind) {
    case 'unconstrained': {
      return ok(sorted.filter((v) => includeTypes.includes(v.type)));
    }

    case 'exact': {
      const { idx, error } = lookup(constraint.value);
      if (idx === -1) return error!;
      return ok([sorted[idx]]);
    }

    case 'gte':
    case 'gt': {
      const { idx, error } = lookup(constraint.value);
      if (idx === -1) return error!;
      const start = constraint.kind === 'gt' ? idx + 1 : idx;
      return ok(sorted.slice(start).filter((v) => includeTypes.includes(v.type)));
    }

    case 'lte':
    case 'lt': {
      const { idx, error } = lookup(constraint.value);
      if (idx === -1) return error!;
      const end = constraint.kind === 'lt' ? idx : idx + 1;
      return ok(sorted.slice(0, end).filter((v) => includeTypes.includes(v.type)));
    }

    case 'range': {
      const min = lookup(constraint.min);
      if (min.idx === -1) return min.error!;
      const max = lookup(constraint.max);
      if (max.idx === -1) return max.error!;
      if (Date.parse(sorted[min.idx].releasedAt) > Date.parse(sorted[max.idx].releasedAt)) {
        return err(`"${constraint.min}" is chronologically after "${constraint.max}"`);
      }
      return ok(sorted.slice(min.idx, max.idx + 1).filter((v) => includeTypes.includes(v.type)));
    }

    default:
      return err(`Unknown constraint kind`);
  }
}
