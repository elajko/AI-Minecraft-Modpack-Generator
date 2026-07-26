import { useState } from 'react';
import { VersionResolverTab } from './tabs/VersionResolverTab';
import { ModSearchTab } from './tabs/ModSearchTab';
import { ModpackTab } from './tabs/ModpackTab';
import type { PackMod, PackTarget } from './lib/modpack';
import './App.css';

type TabId = 'version-resolver' | 'mod-search' | 'modpack';

const TABS: { id: TabId; label: string }[] = [
  { id: 'version-resolver', label: 'Version Resolver' },
  { id: 'mod-search', label: 'Mod Search' },
  { id: 'modpack', label: 'Modpack' },
];

function App() {
  const [active, setActive] = useState<TabId>('mod-search');
  const [target, setTarget] = useState<PackTarget>({ gameVersion: '', loader: '' });
  const [mods, setMods] = useState<PackMod[]>([]);

  return (
    <div className="app">
      <header className="app-header">
        <h1>Minecraft Mod Launcher</h1>
      </header>
      <nav className="tab-bar">
        {TABS.map((tab) => (
          <button key={tab.id} className={`tab-button ${active === tab.id ? 'active' : ''}`} onClick={() => setActive(tab.id)}>
            {tab.label}
            {tab.id === 'modpack' && mods.length > 0 && <span className="tab-count"> ({mods.length})</span>}
          </button>
        ))}
      </nav>
      <main className="tab-content">
        {active === 'version-resolver' && <VersionResolverTab />}
        {active === 'mod-search' && <ModSearchTab target={target} setTarget={setTarget} mods={mods} setMods={setMods} />}
        {active === 'modpack' && <ModpackTab target={target} mods={mods} setMods={setMods} />}
      </main>
    </div>
  );
}

export default App;
