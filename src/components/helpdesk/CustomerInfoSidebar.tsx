import { ChevronRight, Mail, User, Calendar } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { Ticket } from '@/types/helpdesk';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';

interface CustomerInfoSidebarProps {
  ticket: Ticket | null;
  isOpen: boolean;
  onToggle: () => void;
}

export function CustomerInfoSidebar({ ticket, isOpen, onToggle }: CustomerInfoSidebarProps) {
  if (!ticket) {
    return null;
  }

  return (
    <>
      {/* Toggle Button (always visible) */}
      <Button
        variant="ghost"
        size="icon"
        onClick={onToggle}
        className={cn(
          'absolute right-0 top-1/2 -translate-y-1/2 z-10 bg-card border shadow-sm',
          'rounded-l-lg rounded-r-none h-12 w-6',
          isOpen && 'right-72'
        )}
      >
        <ChevronRight
          className={cn('w-4 h-4 transition-transform', isOpen && 'rotate-180')}
        />
      </Button>

      {/* Sidebar */}
      <div
        className={cn(
          'w-72 border-l border-border bg-card transition-all duration-200',
          'overflow-hidden',
          isOpen ? 'translate-x-0' : 'translate-x-full absolute right-0 h-full'
        )}
      >
        <div className="p-4">
          <h3 className="font-semibold text-foreground mb-4">Informações do Cliente</h3>
          
          <div className="space-y-4">
            {/* Avatar */}
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                <User className="w-6 h-6 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-foreground truncate">
                  {ticket.customer_name || 'Sem nome'}
                </p>
                <p className="text-sm text-muted-foreground">Cliente</p>
              </div>
            </div>

            <Separator />

            {/* Email */}
            <div className="flex items-start gap-3">
              <Mail className="w-4 h-4 text-muted-foreground mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">
                  E-mail
                </p>
                <p className="text-sm text-foreground break-all">
                  {ticket.customer_email}
                </p>
              </div>
            </div>

            {/* Created At */}
            <div className="flex items-start gap-3">
              <Calendar className="w-4 h-4 text-muted-foreground mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">
                  Ticket criado
                </p>
                <p className="text-sm text-foreground">
                  {format(new Date(ticket.created_at), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
                </p>
                <p className="text-xs text-muted-foreground">
                  {format(new Date(ticket.created_at), 'HH:mm')}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
