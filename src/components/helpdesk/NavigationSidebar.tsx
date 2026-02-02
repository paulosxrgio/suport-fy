import { Inbox, Settings, BarChart3, HelpCircle, Bot, LogOut } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useAuth } from '@/hooks/useAuth';
import { StoreSwitcher } from './StoreSwitcher';

type NavItem = 'inbox' | 'ai-agent' | 'analytics' | 'settings';

interface NavigationSidebarProps {
  activeNav: NavItem;
  onNavChange: (nav: NavItem) => void;
}

export function NavigationSidebar({ activeNav, onNavChange }: NavigationSidebarProps) {
  const { signOut } = useAuth();
  
  const navItems = [
    { id: 'inbox' as const, icon: Inbox, label: 'Tickets' },
    { id: 'ai-agent' as const, icon: Bot, label: 'Agente IA' },
    { id: 'analytics' as const, icon: BarChart3, label: 'Analytics' },
    { id: 'settings' as const, icon: Settings, label: 'Configurações' },
  ];

  return (
    <div className="w-64 bg-sidebar flex flex-col border-r border-border">
      {/* Logo */}
      <div className="h-14 flex items-center px-4 border-b border-border">
        <div className="w-8 h-8 rounded-lg bg-sidebar-primary flex items-center justify-center mr-2">
          <HelpCircle className="w-5 h-5 text-sidebar-primary-foreground" />
        </div>
        <span className="font-semibold text-sidebar-foreground">Suportfy</span>
      </div>

      {/* Store Switcher */}
      <StoreSwitcher />
      
      {/* Navigation Items */}
      <nav className="flex flex-col px-2 flex-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeNav === item.id;
          
          return (
            <Tooltip key={item.id}>
              <TooltipTrigger asChild>
                <button
                  onClick={() => onNavChange(item.id)}
                  className={cn(
                    'flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors',
                    isActive 
                      ? 'bg-sidebar-accent text-sidebar-accent-foreground' 
                      : 'text-sidebar-foreground hover:bg-sidebar-accent/50'
                  )}
                >
                  <Icon className="w-5 h-5" />
                  <span>{item.label}</span>
                </button>
              </TooltipTrigger>
              <TooltipContent side="right" className="hidden">
                {item.label}
              </TooltipContent>
            </Tooltip>
          );
        })}
      </nav>
      
      {/* Logout Button */}
      <div className="px-2 pb-4">
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={signOut}
              className="flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium w-full text-sidebar-foreground hover:bg-destructive/20 transition-colors"
            >
              <LogOut className="w-5 h-5" />
              <span>Sair</span>
            </button>
          </TooltipTrigger>
          <TooltipContent side="right" className="hidden">
            Sair
          </TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
}
