import type { Dispatch, SetStateAction } from 'react';
import { removeModFromPack, type PackMod, type PackTarget } from '../lib/modpack';

interface ModpackTabProps {
  target: PackTarget;
  mods: PackMod[];
  setMods: Dispatch<SetStateAction<PackMod[]>>;
}

export function ModpackTab({ target, mods, setMods }: ModpackTabProps) {
  const targetReady = target.gameVersion !== '' && target.loader !== '';

  function handleRemove(projectId: string) {
    setMods(removeModFromPack({ target, mods }, projectId).mods);
  }

  return (
    <div className="tab-panels">
      <section className="panel">
        <h2>Target</h2>
        {targetReady ? (
          <p className="status">
            Minecraft {target.gameVersion} · {target.loader}
          </p>
        ) : (
          <p className="status">No target chosen yet — pick one in Mod Search.</p>
        )}
      </section>

      <section className="panel">
        <h2>Mods ({mods.length})</h2>
        {mods.length === 0 && <p className="status">No mods added yet — add some from Mod Search.</p>}
        {mods.length > 0 && (
          <ul className="mod-list">
            {mods.map((mod) => (
              <li key={mod.projectId} className="mod-row">
                {mod.iconUrl ? <img src={mod.iconUrl} alt="" className="mod-row-icon" /> : <div className="mod-row-icon" />}
                <div className="mod-row-body">
                  <div className="mod-row-title">{mod.title}</div>
                  <p className="mod-row-description">
                    {mod.version.name} ({mod.version.versionNumber})
                  </p>
                </div>
                <button onClick={() => handleRemove(mod.projectId)}>Remove</button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
