import { useState } from 'react';
import { VersionResolverTab } from './tabs/VersionResolverTab';
import './App.css';

type TabId = 'version-resolver' | 'mod-search' | 'modpack';

const TABS: { id: TabId; label: string; enabled: boolean }[] = [
  { id: 'version-resolver', label: 'Version Resolver', enabled: true },
  { id: 'mod-search', label: 'Mod Search', enabled: false },
  { id: 'modpack', label: 'Modpack', enabled: false },
];

function App() {
  const [active, setActive] = useState<TabId>('version-resolver');

  return (
    <div className="app">
      <header className="app-header">
        <h1>Minecraft Mod Launcher</h1>
      </header>
      <nav className="tab-bar">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            className={`tab-button ${active === tab.id ? 'active' : ''}`}
            disabled={!tab.enabled}
            onClick={() => setActive(tab.id)}
          >
            {tab.label}
            {!tab.enabled && <span className="soon"> (soon)</span>}
          </button>
        ))}
      </nav>
      <main className="tab-content">{active === 'version-resolver' && <VersionResolverTab />}</main>
    </div>
  );
}

export default App;
