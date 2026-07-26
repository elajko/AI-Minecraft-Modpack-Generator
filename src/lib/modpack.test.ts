import { describe, expect, it } from 'vitest';
import { addModToPack, removeModFromPack, type AddModCandidate, type Pack } from './modpack';
import type { ModrinthVersion, ModrinthVersionDependency } from './modrinthApi';

function version(overrides: Partial<ModrinthVersion> = {}): ModrinthVersion {
  return {
    id: 'v1',
    projectId: 'proj1',
    name: 'v1.0.0',
    versionNumber: '1.0.0',
    gameVersions: ['1.20.1'],
    loaders: ['fabric'],
    dependencies: [],
    downloadUrl: 'https://cdn.modrinth.com/v1.jar',
    filename: 'v1.jar',
    sha512: 'abc',
    ...overrides,
  };
}

function candidate(overrides: Partial<AddModCandidate> = {}): AddModCandidate {
  return {
    projectId: 'proj1',
    title: 'Mod One',
    iconUrl: null,
    version: version(),
    ...overrides,
  };
}

function emptyPack(target: Partial<Pack['target']> = {}): Pack {
  return { target: { gameVersion: '1.20.1', loader: 'fabric', ...target }, mods: [] };
}

describe('addModToPack', () => {
  it('adds a compatible mod to an empty pack', () => {
    const result = addModToPack(emptyPack(), candidate());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.pack.mods).toHaveLength(1);
      expect(result.requiredDependencies).toEqual([]);
    }
  });

  it('rejects a mod that targets a different game version', () => {
    const result = addModToPack(emptyPack({ gameVersion: '1.19.4' }), candidate());
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/1.19.4/);
  });

  it('rejects a mod that does not support the target loader', () => {
    const result = addModToPack(emptyPack({ loader: 'forge' }), candidate());
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/forge/);
  });

  it('rejects a duplicate project', () => {
    const pack = emptyPack();
    const first = addModToPack(pack, candidate());
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const second = addModToPack(first.pack, candidate());
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.error).toMatch(/already in the pack/);
  });

  it('rejects a candidate that declares an existing pack mod incompatible', () => {
    const pack = emptyPack();
    const sodium = candidate({ projectId: 'sodium', title: 'Sodium' });
    const afterSodium = addModToPack(pack, sodium);
    expect(afterSodium.ok).toBe(true);
    if (!afterSodium.ok) return;

    const incompatibleDep: ModrinthVersionDependency = { versionId: null, projectId: 'sodium', dependencyType: 'incompatible' };
    const rival = candidate({
      projectId: 'rival-renderer',
      title: 'Rival Renderer',
      version: version({ projectId: 'rival-renderer', dependencies: [incompatibleDep] }),
    });
    const result = addModToPack(afterSodium.pack, rival);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/Rival Renderer.*incompatible.*Sodium/);
  });

  it('rejects a candidate that an already-added mod declares incompatible (symmetric check)', () => {
    const incompatibleDep: ModrinthVersionDependency = { versionId: null, projectId: 'newcomer', dependencyType: 'incompatible' };
    const existingMod = candidate({
      projectId: 'incumbent',
      title: 'Incumbent Mod',
      version: version({ projectId: 'incumbent', dependencies: [incompatibleDep] }),
    });
    const afterFirst = addModToPack(emptyPack(), existingMod);
    expect(afterFirst.ok).toBe(true);
    if (!afterFirst.ok) return;

    const result = addModToPack(afterFirst.pack, candidate({ projectId: 'newcomer', title: 'Newcomer Mod' }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/Incumbent Mod.*incompatible.*Newcomer Mod/);
  });

  it('surfaces required dependencies without auto-adding them', () => {
    const requiredDep: ModrinthVersionDependency = { versionId: null, projectId: 'fabric-api', dependencyType: 'required' };
    const result = addModToPack(emptyPack(), candidate({ version: version({ dependencies: [requiredDep] }) }));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.requiredDependencies).toEqual(['fabric-api']);
      expect(result.pack.mods.map((m) => m.projectId)).toEqual(['proj1']);
    }
  });

  it('does not surface a required dependency that is already in the pack', () => {
    const fabricApi = candidate({ projectId: 'fabric-api', title: 'Fabric API' });
    const afterApi = addModToPack(emptyPack(), fabricApi);
    expect(afterApi.ok).toBe(true);
    if (!afterApi.ok) return;

    const requiredDep: ModrinthVersionDependency = { versionId: null, projectId: 'fabric-api', dependencyType: 'required' };
    const result = addModToPack(afterApi.pack, candidate({ version: version({ dependencies: [requiredDep] }) }));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.requiredDependencies).toEqual([]);
  });

  it('ignores optional and embedded dependencies entirely', () => {
    const deps: ModrinthVersionDependency[] = [
      { versionId: null, projectId: 'nice-to-have', dependencyType: 'optional' },
      { versionId: null, projectId: 'bundled-lib', dependencyType: 'embedded' },
    ];
    const result = addModToPack(emptyPack(), candidate({ version: version({ dependencies: deps }) }));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.requiredDependencies).toEqual([]);
  });
});

describe('removeModFromPack', () => {
  it('removes a mod by project id', () => {
    const pack = emptyPack();
    const afterAdd = addModToPack(pack, candidate());
    expect(afterAdd.ok).toBe(true);
    if (!afterAdd.ok) return;
    const afterRemove = removeModFromPack(afterAdd.pack, 'proj1');
    expect(afterRemove.mods).toEqual([]);
  });

  it('is a no-op when the project id is not in the pack', () => {
    const pack = emptyPack();
    expect(removeModFromPack(pack, 'nonexistent').mods).toEqual(pack.mods);
  });
});
