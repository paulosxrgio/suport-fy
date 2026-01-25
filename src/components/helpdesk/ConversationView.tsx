import { useState, useRef, useEffect } from 'react';
import { Send, CheckCircle, XCircle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { Ticket, Message } from '@/types/helpdesk';
import { MessageBubble } from './MessageBubble';
import { useUpdateTicketStatus } from '@/hooks/useTickets';
import { useSendMessage } from '@/hooks/useMessages';
import { toast } from 'sonner';

interface ConversationViewProps {
  ticket: Ticket | null;
  messages: Message[] | undefined;
  isLoading: boolean;
}

export function ConversationView({ ticket, messages, isLoading }: ConversationViewProps) {
  const [replyContent, setReplyContent] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const updateStatus = useUpdateTicketStatus();
  const sendMessage = useSendMessage();

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSendReply = async () => {
    // Double-check to prevent duplicate sends
    if (!ticket || !replyContent.trim() || sendMessage.isPending) return;

    const contentToSend = replyContent.trim();
    
    try {
      await sendMessage.mutateAsync({
        ticketId: ticket.id,
        content: contentToSend,
      });
      // Clear input only after successful send
      setReplyContent('');
      toast.success('Resposta enviada com sucesso!');
    } catch (error: any) {
      // Don't show error for duplicate prevention
      if (error?.message !== 'Envio já em andamento') {
        toast.error('Erro ao enviar resposta. Verifique a configuração do Resend.');
      }
    }
  };

  const handleStatusChange = async (status: 'open' | 'closed') => {
    if (!ticket) return;

    try {
      await updateStatus.mutateAsync({ ticketId: ticket.id, status });
      toast.success(status === 'closed' ? 'Ticket fechado!' : 'Ticket reaberto!');
    } catch (error) {
      toast.error('Erro ao atualizar status');
    }
  };

  if (!ticket) {
    return (
      <div className="flex-1 flex items-center justify-center bg-background">
        <div className="text-center text-muted-foreground">
          <Send className="w-12 h-12 mx-auto mb-4 opacity-30" />
          <p>Selecione um ticket para ver a conversa</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col bg-background">
      {/* Header */}
      <div className="h-16 border-b border-border px-6 flex items-center justify-between bg-card">
        <div className="flex-1 min-w-0">
          <h2 className="font-semibold text-foreground truncate">{ticket.subject}</h2>
          <p className="text-sm text-muted-foreground truncate">
            {ticket.customer_name || ticket.customer_email}
          </p>
        </div>
        
        <div className="flex items-center gap-2 ml-4">
          {ticket.status === 'open' ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleStatusChange('closed')}
              disabled={updateStatus.isPending}
              className="text-status-open border-status-open/30 hover:bg-status-open/10"
            >
              <CheckCircle className="w-4 h-4 mr-1" />
              Fechar Ticket
            </Button>
          ) : (
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleStatusChange('open')}
              disabled={updateStatus.isPending}
              className="text-muted-foreground"
            >
              <XCircle className="w-4 h-4 mr-1" />
              Reabrir
            </Button>
          )}
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-6 space-y-4 scrollbar-thin">
        {isLoading ? (
          <div className="space-y-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className={cn('flex gap-3', i % 2 === 0 ? '' : 'flex-row-reverse')}>
                <Skeleton className="w-8 h-8 rounded-full" />
                <Skeleton className="h-20 w-64 rounded-2xl" />
              </div>
            ))}
          </div>
        ) : messages && messages.length > 0 ? (
          messages.map((message) => (
            <MessageBubble 
              key={message.id} 
              message={message} 
              senderName={message.direction === 'inbound' ? (ticket?.customer_name || undefined) : undefined}
            />
          ))
        ) : (
          <div className="text-center text-muted-foreground py-8">
            Nenhuma mensagem neste ticket
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Reply Editor */}
      <div className="border-t border-border p-4 bg-card">
        <div className="flex gap-3">
          <Textarea
            value={replyContent}
            onChange={(e) => setReplyContent(e.target.value)}
            placeholder="Digite sua resposta..."
            className="min-h-[80px] resize-none"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && !sendMessage.isPending) {
                e.preventDefault();
                handleSendReply();
              }
            }}
          />
          <Button
            onClick={handleSendReply}
            disabled={!replyContent.trim() || sendMessage.isPending}
            className="self-end"
          >
            {sendMessage.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground mt-2">
          Pressione Cmd+Enter ou Ctrl+Enter para enviar
        </p>
      </div>
    </div>
  );
}
