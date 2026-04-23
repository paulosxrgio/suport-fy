import { Inbox, Settings, BarChart3, Bot, LogOut, ClipboardList } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import { StoreSwitcher } from './StoreSwitcher';
import { AccountSettingsDialog } from './AccountSettingsDialog';

type NavItem = 'inbox' | 'ai-agent' | 'requests' | 'analytics' | 'settings';

interface NavigationSidebarProps {
  activeNav: NavItem;
  onNavChange: (nav: NavItem) => void;
}

export function NavigationSidebar({ activeNav, onNavChange }: NavigationSidebarProps) {
  const { signOut } = useAuth();

  const navItems = [
    { id: 'inbox' as const, icon: Inbox, label: 'Tickets' },
    { id: 'ai-agent' as const, icon: Bot, label: 'AI Agent' },
    { id: 'requests' as const, icon: ClipboardList, label: 'Requests' },
    { id: 'analytics' as const, icon: BarChart3, label: 'Analytics' },
  ];

  return (
    <div className="w-[220px] bg-sidebar text-sidebar-foreground flex flex-col border-r border-sidebar-border">
      {/* Logo */}
      <div className="h-14 flex items-center px-5">
        <span className="font-heading italic text-2xl text-sidebar-foreground">Suportfy</span>
      </div>

      {/* Store Switcher */}
      <div className="px-3 pb-2">
        <StoreSwitcher />
      </div>

      {/* Nav */}
      <nav className="flex flex-col px-3 gap-0.5 flex-1 mt-2">
        <p className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-wider text-sidebar-muted">Menu</p>
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeNav === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onNavChange(item.id)}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all',
                isActive
                  ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                  : 'text-sidebar-muted hover:bg-white/5 hover:text-sidebar-foreground'
              )}
            >
              <Icon className="w-[18px] h-[18px]" />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Bottom: Settings + Account + Sign Out */}
      <div className="px-3 pb-4 space-y-0.5 border-t border-sidebar-border pt-3 mt-2">
        <button
          onClick={() => onNavChange('settings')}
          className={cn(
            'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium w-full transition-all',
            activeNav === 'settings'
              ? 'bg-sidebar-accent text-sidebar-accent-foreground'
              : 'text-sidebar-muted hover:bg-white/5 hover:text-sidebar-foreground'
          )}
        >
          <Settings className="w-[18px] h-[18px]" />
          <span>Settings</span>
        </button>

        <AccountSettingsDialog />

        <button
          onClick={signOut}
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium w-full text-sidebar-muted hover:bg-destructive/15 hover:text-destructive transition-all"
        >
          <LogOut className="w-[18px] h-[18px]" />
          <span>Sign Out</span>
        </button>
      </div>
    </div>
  );
}
