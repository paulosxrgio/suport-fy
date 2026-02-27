import { useState, useRef, useEffect } from 'react';
import { PaperPlaneRight, SpinnerGap, Sparkle, Translate } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { Ticket, Message } from '@/types/helpdesk';
import { MessageBubble } from './MessageBubble';
import { useSendMessage } from '@/hooks/useMessages';
import { useGenerateAIReply } from '@/hooks/useAIReply';
import { useTranslation } from '@/hooks/useTranslation';
import { toast } from 'sonner';

interface ConversationViewProps {
  ticket: Ticket | null;
  messages: Message[] | undefined;
  isLoading: boolean;
}

export function ConversationView({ ticket, messages, isLoading }: ConversationViewProps) {
  const [replyContent, setReplyContent] = useState('');
  const [isTranslateEnabled, setIsTranslateEnabled] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const sendMessage = useSendMessage();
  const generateAIReply = useGenerateAIReply();
  const { 
    isTranslating, 
    translateMessages, 
    getTranslation, 
    isMessageTranslating,
    clearTranslations 
  } = useTranslation();

  useEffect(() => {
    setIsTranslateEnabled(false);
    clearTranslations();
  }, [ticket?.id, clearTranslations]);

  useEffect(() => {
    if (messages && messages.length > 0) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'instant' });
    }
  }, [ticket?.id]);

  useEffect(() => {
    if (messages && messages.length > 0) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages?.length]);

  const handleSendReply = async () => {
    if (!ticket || !replyContent.trim() || sendMessage.isPending) return;
    const contentToSend = replyContent.trim();
    try {
      await sendMessage.mutateAsync({ ticketId: ticket.id, content: contentToSend });
      setReplyContent('');
      toast.success('Resposta enviada com sucesso!');
    } catch (error: any) {
      if (error?.message !== 'Envio já em andamento') {
        toast.error('Erro ao enviar resposta. Verifique a configuração do Resend.');
      }
    }
  };

  const handleTranslateToggle = async () => {
    const newState = !isTranslateEnabled;
    setIsTranslateEnabled(newState);
    if (newState && messages && ticket) {
      await translateMessages(messages, ticket.id, ticket.store_id || undefined);
      toast.success('Tradução ativada!');
    } else {
      toast.info('Tradução desativada');
    }
  };

  const handleGenerateAIReply = async () => {
    if (!ticket || generateAIReply.isPending) return;
    const lastInboundMessage = messages?.filter(m => m.direction === 'inbound').pop();
    try {
      const reply = await generateAIReply.mutateAsync({
        ticketId: ticket.id,
        lastMessageContent: lastInboundMessage?.content,
      });
      setReplyContent(reply);
      toast.success('Resposta gerada com sucesso!');
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Erro ao gerar resposta';
      toast.error(message);
    }
  };

  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setReplyContent(e.target.value);
    const ta = e.target;
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 200) + 'px';
  };

  if (!ticket) {
    return (
      <div className="flex-1 flex items-center justify-center bg-background">
        <div className="text-center text-muted-foreground">
          <PaperPlaneRight className="w-12 h-12 mx-auto mb-4 opacity-20" />
          <p className="text-sm">Selecione um ticket para ver a conversa</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col bg-background">
      {/* Header */}
      <div className="h-16 border-b border-border px-6 flex items-center justify-between">
        <div className="flex-1 min-w-0">
          <h2 className="font-display italic text-xl text-foreground truncate">
            {ticket.customer_name || ticket.customer_email}
          </h2>
          <p className="text-sm text-muted-foreground truncate">{ticket.subject}</p>
        </div>
        
        <div className="flex items-center gap-2 ml-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleTranslateToggle}
            disabled={isTranslating}
            className={cn(
              "transition-all duration-150 rounded-lg",
              isTranslateEnabled 
                ? "bg-primary/10 text-primary hover:bg-primary/15" 
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {isTranslating ? (
              <>
                <SpinnerGap className="w-4 h-4 mr-1 animate-spin" />
                Traduzindo...
              </>
            ) : (
              <>
                <Translate className="w-4 h-4 mr-1" />
                {isTranslateEnabled ? 'Traduzido' : 'Traduzir'}
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-6 space-y-5 scrollbar-thin">
        {isLoading ? (
          <div className="space-y-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className={cn('flex gap-3', i % 2 === 0 ? '' : 'flex-row-reverse')}>
                <Skeleton className="w-8 h-8 rounded-full" />
                <Skeleton className="h-20 w-64 rounded-xl" />
              </div>
            ))}
          </div>
        ) : messages && messages.length > 0 ? (
          messages.map((message) => (
            <MessageBubble 
              key={message.id} 
              message={message} 
              senderName={message.direction === 'inbound' ? (ticket?.customer_name || undefined) : undefined}
              translatedContent={getTranslation(message.id)}
              isTranslating={isMessageTranslating(message.id)}
              showTranslated={isTranslateEnabled}
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
      <div className="border-t border-border p-4">
        <div className="bg-muted rounded-xl border border-border focus-within:border-primary/60 transition-all duration-150">
          <textarea
            ref={textareaRef}
            value={replyContent}
            onChange={handleTextareaChange}
            placeholder="Digite sua resposta..."
            className="w-full bg-transparent px-4 pt-3 pb-2 text-sm resize-none outline-none min-h-[80px] max-h-[200px] placeholder:text-muted-foreground"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && !sendMessage.isPending) {
                e.preventDefault();
                handleSendReply();
              }
            }}
          />
          
          {/* Toolbar */}
          <div className="flex items-center justify-between px-3 pb-3">
            <p className="text-[11px] text-muted-foreground">
              Cmd+Enter para enviar
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleGenerateAIReply}
                disabled={generateAIReply.isPending}
                className="text-muted-foreground hover:bg-ai-accent-muted hover:text-primary rounded-lg h-8 transition-all duration-150"
              >
                {generateAIReply.isPending ? (
                  <>
                    <SpinnerGap className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                    Escrevendo...
                  </>
                ) : (
                  <>
                    <Sparkle className="w-3.5 h-3.5 mr-1.5" />
                    Gerar Resposta IA
                  </>
                )}
              </Button>
              <Button
                onClick={handleSendReply}
                disabled={!replyContent.trim() || sendMessage.isPending}
                size="sm"
                className="rounded-lg h-8 shadow-card btn-press transition-all duration-150"
              >
                {sendMessage.isPending ? (
                  <SpinnerGap className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <>
                    <PaperPlaneRight className="w-3.5 h-3.5 mr-1.5" />
                    Enviar
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
