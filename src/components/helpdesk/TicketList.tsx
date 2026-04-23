import { formatDistanceToNow } from 'date-fns';
import { enUS } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { Ticket } from '@/types/helpdesk';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Mail } from 'lucide-react';
import { useMarkTicketAsRead } from '@/hooks/useTickets';

interface TicketListProps {
  tickets: Ticket[] | undefined;
  isLoading: boolean;
  selectedTicketId: string | null;
  onSelectTicket: (ticketId: string) => void;
}

function getInitials(name: string | null | undefined, email: string): string {
  if (name) {
    const parts = name.trim().split(/\s+/);
    if (parts.length > 1) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    return parts[0].substring(0, 2).toUpperCase();
  }
  return email.substring(0, 2).toUpperCase();
}

export function TicketList({ tickets, isLoading, selectedTicketId, onSelectTicket }: TicketListProps) {
  const markAsRead = useMarkTicketAsRead();

  const handleSelectTicket = (ticket: Ticket) => {
    if (!ticket.is_read) {
      markAsRead.mutate(ticket.id);
    }
    onSelectTicket(ticket.id);
  };

  if (isLoading) {
    return (
      <div className="flex flex-col">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="px-4 py-3.5 border-b border-border flex gap-3">
            <Skeleton className="h-9 w-9 rounded-full shrink-0" />
            <div className="flex-1 space-y-2">
              <div className="flex items-center justify-between">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-3 w-12" />
              </div>
              <Skeleton className="h-3 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (!tickets || tickets.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground py-12">
        <Mail className="w-12 h-12 mb-4 opacity-30" />
        <p className="text-sm">No tickets found</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col overflow-y-auto scrollbar-thin">
      {tickets.map((ticket, index) => {
        const isSelected = selectedTicketId === ticket.id;
        const isUnread = !ticket.is_read;
        const initials = getInitials(ticket.customer_name, ticket.customer_email);
        
        return (
          <div
            key={ticket.id}
            onClick={() => handleSelectTicket(ticket)}
            className={cn(
              'ticket-item stagger-fade-in flex gap-3',
              isSelected && 'ticket-item-selected',
              isUnread && !isSelected && 'bg-primary/[0.03]'
            )}
            style={{ animationDelay: `${index * 20}ms` }}
          >
            {/* Avatar */}
            <div className="w-9 h-9 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-semibold shrink-0">
              {initials}
            </div>

            <div className="flex-1 min-w-0">
              {/* Top row: name + time */}
              <div className="flex items-center justify-between gap-2 mb-0.5">
                <h4 className={cn(
                  'text-sm text-foreground truncate',
                  isUnread ? 'font-semibold' : 'font-medium'
                )}>
                  {ticket.customer_name || ticket.customer_email}
                </h4>
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className={cn(
                    'text-xs',
                    isUnread ? 'text-foreground font-medium' : 'text-muted-foreground'
                  )}>
                    {formatDistanceToNow(new Date(ticket.last_message_at), { 
                      addSuffix: true, 
                      locale: enUS 
                    })}
                  </span>
                  {isUnread && (
                    <span className="w-2 h-2 rounded-full bg-primary shrink-0" />
                  )}
                </div>
              </div>
              
              {/* Subject */}
              <p className={cn(
                'text-sm truncate',
                isUnread ? 'text-foreground/80' : 'text-muted-foreground'
              )}>
                {ticket.subject}
              </p>
              
              {/* Bottom row: badge + email */}
              <div className="flex items-center gap-2 mt-1.5">
                <Badge 
                  variant="secondary"
                  className={cn(
                    'status-badge',
                    ticket.status === 'open' ? 'status-badge-open' : 'status-badge-closed'
                  )}
                >
                  {ticket.status === 'open' ? 'Open' : 'Closed'}
                </Badge>
                {ticket.customer_name && (
                  <p className="text-xs text-muted-foreground truncate">
                    {ticket.customer_email}
                  </p>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
