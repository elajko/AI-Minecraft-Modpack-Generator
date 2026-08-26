export interface ModrinthSearchHit {
  projectId: string;
  slug: string;
  title: string;
  author: string;
  description: string;
  iconUrl: string | null;
  downloads: number;
  categories: string[];
  /** Every Minecraft version this project claims to support. */
  versions: string[];
}

export interface ModrinthVersionDependency {
  versionId: string | null;
  projectId: string | null;
  dependencyType: 'required' | 'optional' | 'incompatible' | 'embedded';
}

export interface ModrinthVersion {
  id: string;
  projectId: string;
  name: string;
  versionNumber: string;
  gameVersions: string[];
  loaders: string[];
  dependencies: ModrinthVersionDependency[];
  downloadUrl: string;
  filename: string;
  sha512: string;
}

interface RawSearchHit {
  project_id: string;
  slug: string;
  title: string;
  author: string;
  description: string;
  icon_url: string | null;
  downloads: number;
  categories: string[];
  versions: string[];
}

interface RawVersionDependency {
  version_id: string | null;
  project_id: string | null;
  dependency_type: 'required' | 'optional' | 'incompatible' | 'embedded';
}

interface RawVersion {
  id: string;
  project_id: string;
  name: string;
  version_number: string;
  game_versions: string[];
  loaders: string[];
  dependencies: RawVersionDependency[];
  files: { url: string; filename: string; primary: boolean; hashes: { sha512: string } }[];
}

const API_BASE = 'https://api.modrinth.com/v2';

async function modrinthFetch<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`);
  if (!res.ok) {
    throw new Error(`Modrinth API returned ${res.status} ${res.statusText} for ${path}`);
  }
  return res.json() as Promise<T>;
}

export interface ModrinthSearchPage {
  hits: ModrinthSearchHit[];
  offset: number;
  limit: number;
  totalHits: number;
}

/**
 * Searches Modrinth without a game-version facet — the version facet is
 * genuinely optional on Modrinth's search endpoint (verified: a bare
 * `query=sodium` returns the same 343 hits with `versions:1.20.1` narrowing
 * it to 116, rather than the endpoint requiring one). Every hit still
 * carries its own `versions` list, so callers can cache the full result and
 * filter by whichever version is currently selected without re-querying.
 */
export async function searchMods(query: string, loader: string, offset = 0, limit = 20): Promise<ModrinthSearchPage> {
  const facets = JSON.stringify([['project_type:mod'], [`categories:${loader}`]]);
  const params = new URLSearchParams({ query, facets, offset: String(offset), limit: String(limit) });
  const data = await modrinthFetch<{ hits: RawSearchHit[]; offset: number; limit: number; total_hits: number }>(
    `/search?${params.toString()}`,
  );
  return {
    hits: data.hits.map((hit) => ({
      projectId: hit.project_id,
      slug: hit.slug,
      title: hit.title,
      author: hit.author,
      description: hit.description,
      iconUrl: hit.icon_url,
      downloads: hit.downloads,
      categories: hit.categories,
      versions: hit.versions,
    })),
    offset: data.offset,
    limit: data.limit,
    totalHits: data.total_hits,
  };
}

function normalizeVersion(v: RawVersion): ModrinthVersion {
  const file = v.files.find((f) => f.primary) ?? v.files[0];
  return {
    id: v.id,
    projectId: v.project_id,
    name: v.name,
    versionNumber: v.version_number,
    gameVersions: v.game_versions,
    loaders: v.loaders,
    dependencies: v.dependencies.map((d) => ({
      versionId: d.version_id,
      projectId: d.project_id,
      dependencyType: d.dependency_type,
    })),
    downloadUrl: file?.url ?? '',
    filename: file?.filename ?? '',
    sha512: file?.hashes.sha512 ?? '',
  };
}

export async function getCompatibleVersions(
  projectId: string,
  gameVersion: string,
  loader: string,
): Promise<ModrinthVersion[]> {
  const params = new URLSearchParams({ loaders: JSON.stringify([loader]), game_versions: JSON.stringify([gameVersion]) });
  const data = await modrinthFetch<RawVersion[]>(`/project/${projectId}/version?${params.toString()}`);
  return data.map(normalizeVersion);
}

export async function getProjectTitles(projectIds: string[]): Promise<Record<string, string>> {
  if (projectIds.length === 0) return {};
  const params = new URLSearchParams({ ids: JSON.stringify(projectIds) });
  const data = await modrinthFetch<{ id: string; title: string }[]>(`/projects?${params.toString()}`);
  return Object.fromEntries(data.map((p) => [p.id, p.title]));
}

interface RawProject {
  id: string;
  slug: string;
  title: string;
  description: string;
  icon_url: string | null;
  downloads: number;
  categories: string[];
  game_versions: string[];
}

/**
 * Batch-fetches full project details by id, for turning a set of ground-truth
 * project ids (e.g. ones an AI tool-calling loop has actually seen via
 * search_mods) back into displayable result cards. The batch endpoint has no
 * `author` field, only a team id, so author is left blank here.
 */
export async function getProjectsByIds(projectIds: string[]): Promise<ModrinthSearchHit[]> {
  if (projectIds.length === 0) return [];
  const params = new URLSearchParams({ ids: JSON.stringify(projectIds) });
  const data = await modrinthFetch<RawProject[]>(`/projects?${params.toString()}`);
  return data.map((p) => ({
    projectId: p.id,
    slug: p.slug,
    title: p.title,
    author: '',
    description: p.description,
    iconUrl: p.icon_url,
    downloads: p.downloads,
    categories: p.categories,
    versions: p.game_versions,
  }));
}

export async function fetchModLoaders(): Promise<string[]> {
  const data = await modrinthFetch<{ name: string; supported_project_types: string[] }[]>('/tag/loader');
  return data.filter((l) => l.supported_project_types.includes('mod')).map((l) => l.name);
}
