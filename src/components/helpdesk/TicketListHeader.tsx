import { Search, Filter } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface TicketListHeaderProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  statusFilter: 'all' | 'open' | 'closed';
  onStatusFilterChange: (status: 'all' | 'open' | 'closed') => void;
  ticketCount: number;
}

export function TicketListHeader({
  searchQuery,
  onSearchChange,
  statusFilter,
  onStatusFilterChange,
  ticketCount,
}: TicketListHeaderProps) {
  const statusLabels = {
    all: 'Todos',
    open: 'Abertos',
    closed: 'Fechados',
  };

  return (
    <div className="p-4 border-b border-border bg-card">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-semibold text-foreground">
          Tickets
          <span className="ml-2 text-sm font-normal text-muted-foreground">
            ({ticketCount})
          </span>
        </h2>
        
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="h-8">
              <Filter className="w-4 h-4 mr-1" />
              {statusLabels[statusFilter]}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => onStatusFilterChange('all')}>
              Todos
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onStatusFilterChange('open')}>
              Abertos
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onStatusFilterChange('closed')}>
              Fechados
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Buscar tickets..."
          className="pl-9 h-9"
        />
      </div>
    </div>
  );
}
