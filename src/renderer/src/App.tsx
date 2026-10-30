import { useState } from 'react';
import type { JSX } from 'react';
import BakeOffView from './views/BakeOffView';
import HomeView from './views/HomeView';

type ViewId = 'home' | 'bakeoff';

const NAV_ITEMS: { id: ViewId; label: string }[] = [
  { id: 'home', label: 'Home' },
  { id: 'bakeoff', label: 'AI Bake-Off' }
];

export default function App(): JSX.Element {
  const [view, setView] = useState<ViewId>('home');

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <nav className="flex items-center gap-1 border-b border-zinc-800 px-4 py-2">
        {NAV_ITEMS.map((item) => (
          <button
            key={item.id}
            className={
              view === item.id
                ? 'rounded bg-zinc-800 px-3 py-1 text-sm font-medium text-white'
                : 'rounded px-3 py-1 text-sm text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200'
            }
            onClick={() => setView(item.id)}
          >
            {item.label}
          </button>
        ))}
        <span className="ml-auto font-mono text-xs text-zinc-600">cognitive-gym</span>
      </nav>
      {view === 'home' && <HomeView />}
      {view === 'bakeoff' && <BakeOffView />}
    </div>
  );
}
