import { Search, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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
  const filters: Array<{ key: 'all' | 'open' | 'closed'; label: string }> = [
    { key: 'all', label: 'All' },
    { key: 'open', label: 'Open' },
    { key: 'closed', label: 'Closed' },
  ];

  return (
    <div className="px-4 py-3 border-b border-border bg-card">
      {/* Title row */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-foreground tracking-tight">Tickets</h2>
          <Badge variant="secondary" className="rounded-full px-2 text-[10px] font-medium h-5">
            {ticketCount}
          </Badge>
        </div>

        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-muted-foreground hover:text-foreground"
          onClick={onRefresh}
          disabled={isRefreshing}
          title="Refresh list"
        >
          <RefreshCw className={cn('w-3.5 h-3.5', isRefreshing && 'animate-spin')} />
        </Button>
      </div>

      {/* Search */}
      <div className="relative mb-3">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
        <input
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search tickets..."
          className="w-full h-8 pl-8 pr-3 text-xs bg-muted rounded-lg border-0 outline-none focus:ring-2 focus:ring-primary/20 placeholder:text-muted-foreground"
        />
      </div>

      {/* Filter pills */}
      <div className="flex items-center gap-1 bg-muted/60 rounded-lg p-0.5">
        {filters.map((f) => (
          <button
            key={f.key}
            onClick={() => onStatusFilterChange(f.key)}
            className={cn(
              'flex-1 py-1 text-xs font-medium rounded-md transition-all',
              statusFilter === f.key
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {f.label}
          </button>
        ))}
      </div>
    </div>
  );
}
