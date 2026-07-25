import type { VersionRecord } from './versionResolver';

// Illustrative fixture only — dates are approximate/synthetic, chosen purely to
// exercise cross-era chronological ordering (pre-classic -> indev/infdev ->
// alpha -> beta -> release -> snapshot), not to be historically authoritative.
export const SYNTHETIC_FIXTURE: VersionRecord[] = [
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

interface ModrinthGameVersion {
  version: string;
  version_type: string;
  date: string;
  major: boolean;
}

// Modrinth's CORS policy is wide open (access-control-allow-origin: *),
// confirmed against the live endpoint, so this can be called directly from
// the browser with no backend proxy.
export async function fetchModrinthVersions(): Promise<VersionRecord[]> {
  const res = await fetch('https://api.modrinth.com/v2/tag/game_version');
  if (!res.ok) {
    throw new Error(`Modrinth API returned ${res.status} ${res.statusText}`);
  }
  const data = (await res.json()) as ModrinthGameVersion[];
  return data.map((v) => ({ id: v.version, type: v.version_type, releasedAt: v.date }));
}
