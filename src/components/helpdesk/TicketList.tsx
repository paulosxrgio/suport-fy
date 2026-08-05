import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { Ticket } from '@/types/helpdesk';
import { Mail, AlertTriangle } from 'lucide-react';
import { useMarkTicketAsRead } from '@/hooks/useTickets';

interface TicketListProps {
  tickets: Ticket[] | undefined;
  isLoading: boolean;
  selectedTicketId: string | null;
  onSelectTicket: (ticketId: string) => void;
}

export function TicketList({ tickets, isLoading, selectedTicketId, onSelectTicket }: TicketListProps) {
  const markAsRead = useMarkTicketAsRead();

  const handleSelectTicket = (ticket: Ticket) => {
    if (!ticket.is_read) markAsRead.mutate(ticket.id);
    onSelectTicket(ticket.id);
  };

  if (isLoading) {
    return (
      <div className="flex flex-col">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="px-4 py-3.5 border-b border-border flex gap-3 animate-pulse">
            <div className="w-9 h-9 rounded-full bg-muted shrink-0" />
            <div className="flex-1 space-y-2 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <div className="h-3.5 w-24 bg-muted rounded" />
                <div className="h-3 w-12 bg-muted rounded" />
              </div>
              <div className="h-3 w-3/4 bg-muted rounded" />
              <div className="h-3 w-16 bg-muted rounded" />
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
        <p className="text-sm">Nenhum ticket encontrado</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col overflow-y-auto scrollbar-thin">
      {tickets.map((ticket, index) => {
        const isSelected = selectedTicketId === ticket.id;
        const isUnread = !ticket.is_read;
        const initial = (ticket.customer_name || ticket.customer_email)?.[0]?.toUpperCase() || '?';

        return (
          <button
            key={ticket.id}
            onClick={() => handleSelectTicket(ticket)}
            className={cn(
              'px-4 py-3.5 cursor-pointer border-b border-border transition-colors text-left stagger-fade-in',
              isSelected
                ? 'bg-ticket-selected border-l-2 border-l-primary'
                : 'hover:bg-ticket-hover',
              isUnread && !isSelected && 'bg-primary/[0.03]'
            )}
            style={{ animationDelay: `${index * 20}ms` }}
          >
            <div className="flex gap-3">
              {/* Avatar */}
              <div className="w-9 h-9 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-semibold shrink-0">
                {initial}
              </div>

              {/* Body */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2 mb-0.5">
                  <h4
                    className={cn(
                      'text-sm text-foreground truncate',
                      isUnread ? 'font-semibold' : 'font-medium'
                    )}
                  >
                    {ticket.customer_name || ticket.customer_email}
                  </h4>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span
                      className={cn(
                        'text-[11px]',
                        isUnread ? 'text-foreground font-medium' : 'text-muted-foreground'
                      )}
                    >
                      {formatDistanceToNow(new Date(ticket.last_message_at), {
                        addSuffix: true,
                        locale: ptBR,
                      })}
                    </span>
                    {isUnread && <span className="w-2 h-2 rounded-full bg-primary shrink-0" />}
                  </div>
                </div>

                <p
                  className={cn(
                    'text-xs truncate mb-1.5',
                    isUnread ? 'text-foreground/80' : 'text-muted-foreground'
                  )}
                >
                  {ticket.subject}
                </p>

                <div className="flex items-center gap-2 flex-wrap">
                  <span
                    className={cn(
                      'text-[10px] font-medium',
                      ticket.status === 'open' ? 'text-status-open' : 'text-muted-foreground'
                    )}
                  >
                    {ticket.status === 'open' ? '● Aberto' : '○ Fechado'}
                  </span>
                  {(ticket.needs_human || ticket.anti_loop_reason) && (
                    <span
                      title={ticket.anti_loop_reason || undefined}
                      className="inline-flex items-center gap-1 rounded bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-400 max-w-full"
                    >
                      <AlertTriangle className="w-2.5 h-2.5 shrink-0" />
                      <span className="truncate">
                        {ticket.needs_human ? 'Requer humano' : 'Auto-resposta ignorada'}
                      </span>
                    </span>
                  )}
                </div>

              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
