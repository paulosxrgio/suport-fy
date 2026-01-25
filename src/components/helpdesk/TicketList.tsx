import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { Ticket } from '@/types/helpdesk';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Mail } from 'lucide-react';

interface TicketListProps {
  tickets: Ticket[] | undefined;
  isLoading: boolean;
  selectedTicketId: string | null;
  onSelectTicket: (ticketId: string) => void;
}

export function TicketList({ tickets, isLoading, selectedTicketId, onSelectTicket }: TicketListProps) {
  if (isLoading) {
    return (
      <div className="flex flex-col">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="p-4 border-b border-border">
            <Skeleton className="h-4 w-20 mb-2" />
            <Skeleton className="h-5 w-3/4 mb-1" />
            <Skeleton className="h-4 w-full mb-2" />
            <Skeleton className="h-3 w-16" />
          </div>
        ))}
      </div>
    );
  }

  if (!tickets || tickets.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground py-12">
        <Mail className="w-12 h-12 mb-4 opacity-50" />
        <p className="text-sm">Nenhum ticket encontrado</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col overflow-y-auto scrollbar-thin">
      {tickets.map((ticket) => {
        const isSelected = selectedTicketId === ticket.id;
        
        return (
          <div
            key={ticket.id}
            onClick={() => onSelectTicket(ticket.id)}
            className={cn(
              'ticket-item animate-fade-in',
              isSelected && 'ticket-item-selected'
            )}
          >
            {/* Status Badge */}
            <div className="flex items-center justify-between mb-2">
              <Badge 
                variant="secondary"
                className={cn(
                  'status-badge',
                  ticket.status === 'open' ? 'status-badge-open' : 'status-badge-closed'
                )}
              >
                {ticket.status === 'open' ? 'Aberto' : 'Fechado'}
              </Badge>
              <span className="text-xs text-muted-foreground">
                {formatDistanceToNow(new Date(ticket.last_message_at), { 
                  addSuffix: true, 
                  locale: ptBR 
                })}
              </span>
            </div>
            
            {/* Customer Name */}
            <h4 className="font-medium text-sm text-foreground truncate">
              {ticket.customer_name || ticket.customer_email}
            </h4>
            
            {/* Subject */}
            <p className="text-sm text-foreground/80 truncate mt-0.5">
              {ticket.subject}
            </p>
            
            {/* Customer Email (if name is shown) */}
            {ticket.customer_name && (
              <p className="text-xs text-muted-foreground mt-1 truncate">
                {ticket.customer_email}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
