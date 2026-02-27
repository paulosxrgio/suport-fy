import { Search, RefreshCw } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface TicketListHeaderProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  statusFilter: 'all' | 'open' | 'closed';
  onStatusFilterChange: (status: 'all' | 'open' | 'closed') => void;
  ticketCount: number;
  onRefresh: () => void;
  isRefreshing: boolean;
}

export function TicketListHeader({
  searchQuery,
  onSearchChange,
  statusFilter,
  onStatusFilterChange,
  ticketCount,
  onRefresh,
  isRefreshing,
}: TicketListHeaderProps) {
  const filters = [
    { key: 'all' as const, label: 'Todos' },
    { key: 'open' as const, label: 'Abertos' },
    { key: 'closed' as const, label: 'Fechados' },
  ];

  return (
    <div className="p-4 border-b border-border">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-semibold text-foreground tracking-tight">
          Tickets
          <span className="ml-2 text-sm font-normal text-muted-foreground">
            {ticketCount}
          </span>
        </h2>
        
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-muted-foreground hover:text-foreground"
          onClick={onRefresh}
          disabled={isRefreshing}
          title="Atualizar lista"
        >
          <RefreshCw className={cn("w-4 h-4", isRefreshing && "animate-spin")} />
        </Button>
      </div>

      {/* Filter Pills */}
      <div className="flex items-center gap-1.5 mb-3">
        {filters.map((f) => (
          <button
            key={f.key}
            onClick={() => onStatusFilterChange(f.key)}
            className={cn(
              'filter-pill',
              statusFilter === f.key && 'filter-pill-active'
            )}
          >
            {f.label}
          </button>
        ))}
      </div>
      
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Buscar tickets..."
          className="pl-9 h-[38px] rounded-lg"
        />
      </div>
    </div>
  );
}
