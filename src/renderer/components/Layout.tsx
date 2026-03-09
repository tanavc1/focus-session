import React from 'react';
import { Outlet, NavLink } from 'react-router-dom';
import { Home, History, Settings, Zap } from 'lucide-react';
import { useAppStore } from '../store/useStore';
import PrivacyBadge from './PrivacyBadge';

export default function Layout() {
  const { activeSession } = useAppStore();

  return (
    <div className="flex flex-col h-screen bg-slate-900">
      {/* macOS titlebar drag region */}
      <div className="titlebar-spacer flex items-center px-20 drag-region">
        <span className="text-xs text-slate-500 font-medium tracking-wide">Focus Session</span>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <aside className="w-16 flex flex-col items-center py-4 bg-slate-900/80 border-r border-slate-800 gap-2 no-drag">
          <NavItem to="/" icon={<Home size={18} />} label="Home" />
          <NavItem
            to="/session/active"
            icon={
              <div className="relative">
                <Zap size={18} />
                {activeSession && (
                  <span className="absolute -top-1 -right-1 w-2 h-2 bg-green-400 rounded-full animate-pulse-slow" />
                )}
              </div>
            }
            label="Session"
          />
          <NavItem to="/history" icon={<History size={18} />} label="History" />
          <div className="mt-auto">
            <NavItem to="/settings" icon={<Settings size={18} />} label="Settings" />
          </div>
        </aside>

        {/* Main content */}
        <main className="flex-1 flex flex-col overflow-hidden">
          <div className="flex-1 scrollable">
            <Outlet />
          </div>

          {/* Privacy badge */}
          <div className="px-4 py-2 border-t border-slate-800 flex items-center justify-end">
            <PrivacyBadge />
          </div>
        </main>
      </div>
    </div>
  );
}

function NavItem({
  to,
  icon,
  label,
}: {
  to: string;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <NavLink
      to={to}
      title={label}
      className={({ isActive }) =>
        `w-10 h-10 flex items-center justify-center rounded-lg transition-colors duration-150 ${
          isActive
            ? 'bg-brand-600 text-white'
            : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800'
        }`
      }
    >
      {icon}
    </NavLink>
  );
}
