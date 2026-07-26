export interface ModrinthSearchHit {
  projectId: string;
  slug: string;
  title: string;
  author: string;
  description: string;
  iconUrl: string | null;
  downloads: number;
  categories: string[];
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

export async function searchMods(query: string, gameVersion: string, loader: string): Promise<ModrinthSearchHit[]> {
  const facets = JSON.stringify([['project_type:mod'], [`versions:${gameVersion}`], [`categories:${loader}`]]);
  const params = new URLSearchParams({ query, facets, limit: '20' });
  const data = await modrinthFetch<{ hits: RawSearchHit[] }>(`/search?${params.toString()}`);
  return data.hits.map((hit) => ({
    projectId: hit.project_id,
    slug: hit.slug,
    title: hit.title,
    author: hit.author,
    description: hit.description,
    iconUrl: hit.icon_url,
    downloads: hit.downloads,
    categories: hit.categories,
  }));
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

export async function fetchModLoaders(): Promise<string[]> {
  const data = await modrinthFetch<{ name: string; supported_project_types: string[] }[]>('/tag/loader');
  return data.filter((l) => l.supported_project_types.includes('mod')).map((l) => l.name);
}
