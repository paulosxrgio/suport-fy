import { Inbox, Settings, BarChart3, HelpCircle, Bot, LogOut } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useAuth } from '@/hooks/useAuth';

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
    <div className="w-16 bg-sidebar flex flex-col items-center py-4 gap-2">
      {/* Logo */}
      <div className="w-10 h-10 rounded-xl bg-sidebar-primary flex items-center justify-center mb-6">
        <HelpCircle className="w-6 h-6 text-sidebar-primary-foreground" />
      </div>
      
      {/* Navigation Items */}
      <nav className="flex flex-col items-center gap-1 flex-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeNav === item.id;
          
          return (
            <Tooltip key={item.id}>
              <TooltipTrigger asChild>
                <button
                  onClick={() => onNavChange(item.id)}
                  className={cn(
                    'nav-icon',
                    isActive && 'nav-icon-active'
                  )}
                >
                  <Icon className="w-5 h-5 text-sidebar-foreground" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right">
                {item.label}
              </TooltipContent>
            </Tooltip>
          );
        })}
      </nav>
      
      {/* Logout Button */}
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onClick={signOut}
            className="nav-icon hover:bg-destructive/20"
          >
            <LogOut className="w-5 h-5 text-sidebar-foreground" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="right">
          Sair
        </TooltipContent>
      </Tooltip>
    </div>
  );
}
