import React, { useState } from 'react';
import { EventsTab } from '../views/events/EventsTab.tsx';

type TabId = 'events';

const TABS: { id: TabId; label: string }[] = [
  { id: 'events', label: 'Events' },
];

export const App = () => {
  const [activeTab, setActiveTab] = useState<TabId>('events');

  return (
    <div className="app">
      <header className="app-header">
        <h1>RaceSweet</h1>
      </header>
      <nav className="tab-bar" role="tablist">
        {TABS.map(({ id, label }) => (
          <button
            key={id}
            role="tab"
            aria-selected={activeTab === id}
            className={`tab-button${activeTab === id ? ' active' : ''}`}
            onClick={() => setActiveTab(id)}
          >
            {label}
          </button>
        ))}
      </nav>
      <main className="tab-content">
        {activeTab === 'events' && <EventsTab />}
      </main>
    </div>
  );
};
