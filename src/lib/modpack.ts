import type { ModrinthVersion } from './modrinthApi';

export interface PackTarget {
  gameVersion: string;
  loader: string;
}

export interface PackMod {
  projectId: string;
  title: string;
  iconUrl: string | null;
  version: ModrinthVersion;
}

export interface Pack {
  target: PackTarget;
  mods: PackMod[];
}

export interface AddModCandidate {
  projectId: string;
  title: string;
  iconUrl: string | null;
  version: ModrinthVersion;
}

export type AddModResult =
  | { ok: true; pack: Pack; requiredDependencies: string[] }
  | { ok: false; error: string };

/**
 * Adds a mod to the pack, or rejects it. This is the ground-truth gate the UI
 * must go through — it never trusts the caller's judgment about compatibility,
 * only what Modrinth's own version data says (game_versions/loaders match,
 * and each version's declared `incompatible` dependency edges).
 *
 * Required dependencies are surfaced back to the caller rather than
 * auto-added, so adding a mod never silently pulls in others.
 */
export function addModToPack(pack: Pack, candidate: AddModCandidate): AddModResult {
  if (pack.mods.some((m) => m.projectId === candidate.projectId)) {
    return { ok: false, error: `${candidate.title} is already in the pack` };
  }

  if (!candidate.version.gameVersions.includes(pack.target.gameVersion)) {
    return {
      ok: false,
      error: `${candidate.version.name} does not support Minecraft ${pack.target.gameVersion}`,
    };
  }

  if (!candidate.version.loaders.includes(pack.target.loader)) {
    return { ok: false, error: `${candidate.version.name} does not support ${pack.target.loader}` };
  }

  const candidateIncompatibleWith = new Set(
    candidate.version.dependencies.filter((d) => d.dependencyType === 'incompatible').map((d) => d.projectId),
  );
  const conflictFromCandidate = pack.mods.find((m) => candidateIncompatibleWith.has(m.projectId));
  if (conflictFromCandidate) {
    return { ok: false, error: `${candidate.title} is marked incompatible with ${conflictFromCandidate.title}` };
  }

  const conflictFromExisting = pack.mods.find((m) =>
    m.version.dependencies.some((d) => d.dependencyType === 'incompatible' && d.projectId === candidate.projectId),
  );
  if (conflictFromExisting) {
    return { ok: false, error: `${conflictFromExisting.title} is marked incompatible with ${candidate.title}` };
  }

  const existingIds = new Set(pack.mods.map((m) => m.projectId));
  const requiredDependencies = candidate.version.dependencies
    .filter((d) => d.dependencyType === 'required' && d.projectId && !existingIds.has(d.projectId))
    .map((d) => d.projectId as string);

  return {
    ok: true,
    pack: { ...pack, mods: [...pack.mods, { projectId: candidate.projectId, title: candidate.title, iconUrl: candidate.iconUrl, version: candidate.version }] },
    requiredDependencies,
  };
}

export function removeModFromPack(pack: Pack, projectId: string): Pack {
  return { ...pack, mods: pack.mods.filter((m) => m.projectId !== projectId) };
}
