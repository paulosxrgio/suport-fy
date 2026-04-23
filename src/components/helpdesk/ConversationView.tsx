import { useState, useRef, useEffect } from 'react';
import { Send, Loader2, Sparkles, Languages, Printer, Inbox } from 'lucide-react';
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '@/components/ui/tooltip';
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
      toast.success('Reply sent successfully!');
    } catch (error: any) {
      if (error?.message !== 'Envio já em andamento') {
        toast.error('Failed to send reply. Check your Resend configuration.');
      }
    }
  };

  const handleTranslateToggle = async () => {
    const newState = !isTranslateEnabled;
    setIsTranslateEnabled(newState);
    if (newState && messages && ticket) {
      await translateMessages(messages, ticket.id, ticket.store_id || undefined);
      toast.success('Translation enabled!');
    } else {
      toast.info('Translation disabled');
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
      toast.success('Reply generated successfully!');
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to generate reply';
      toast.error(message);
    }
  };

  const handlePrint = () => {
    if (!ticket || !messages) return;
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const html = `<!DOCTYPE html>
<html><head>
<title>Conversation - ${ticket.customer_name || ticket.customer_email}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; padding: 32px; background: #fff; color: #1a1a2e; }
  .header { border-bottom: 2px solid #e8e8ed; padding-bottom: 16px; margin-bottom: 24px; }
  .header h2 { font-size: 18px; font-weight: 600; }
  .header p { font-size: 13px; color: #6b6b80; margin-top: 4px; }
  .message { margin-bottom: 16px; max-width: 72%; }
  .message.inbound { margin-right: auto; }
  .message.outbound { margin-left: auto; text-align: right; }
  .bubble { display: inline-block; padding: 10px 14px; border-radius: 12px; font-size: 14px; line-height: 1.5; text-align: left; }
  .inbound .bubble { background: #f3f3f5; border: 1px solid #e8e8ed; border-radius: 16px 16px 16px 4px; }
  .outbound .bubble { background: #ede9fe; border: 1px solid rgba(124,58,237,0.2); border-radius: 16px 16px 4px 16px; }
  .meta { font-size: 11px; color: #a0a0b0; margin-top: 4px; }
  .inbound .meta { text-align: left; }
  .outbound .meta { text-align: right; }
  @media print { body { padding: 16px; } }
</style>
</head><body>
  <div class="header">
    <h2>${ticket.customer_name || ticket.customer_email}</h2>
    <p>${ticket.customer_email} · ${ticket.subject || 'No subject'} · ${new Date(ticket.created_at).toLocaleDateString('en-US')}</p>
  </div>
  ${messages.map(msg => `
    <div class="message ${msg.direction}">
      <div class="bubble">${msg.content.replace(/\n/g, '<br>')}</div>
      <div class="meta">
        ${msg.direction === 'inbound' ? (ticket.customer_name || 'Customer') : 'Sophia'} · 
        ${new Date(msg.created_at).toLocaleString('en-US', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
      </div>
    </div>
  `).join('')}
</body></html>`;

    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => printWindow.print(), 500);
  };

  // Auto-resize textarea
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
          <Inbox className="w-14 h-14 mx-auto mb-4 opacity-25" />
          <p className="text-base font-medium text-foreground mb-1">Select a conversation</p>
          <p className="text-sm">Select a conversation to get started</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col bg-background">
      {/* Header */}
      <div className="h-16 border-b border-border px-6 flex items-center justify-between bg-card">
        <div className="flex-1 min-w-0">
          <h2 className="font-heading italic text-xl text-foreground truncate">
            {ticket.customer_name || ticket.customer_email}
          </h2>
          <p className="text-sm text-muted-foreground truncate">{ticket.subject}</p>
        </div>
        
        <div className="flex items-center gap-2 ml-4">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handlePrint}
                  className="text-muted-foreground hover:text-foreground transition-all duration-150 rounded-lg"
                >
                  <Printer className="w-4 h-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Print conversation</TooltipContent>
            </Tooltip>
          </TooltipProvider>
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
                <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                Translating...
              </>
            ) : (
              <>
                <Languages className="w-4 h-4 mr-1" />
                {isTranslateEnabled ? 'Translated' : 'Translate'}
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
            No messages in this ticket
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Reply Editor */}
      <div className="border-t border-border p-4 bg-card">
        <div className="bg-muted rounded-xl border border-border focus-within:border-primary/60 transition-all duration-150">
          <textarea
            ref={textareaRef}
            value={replyContent}
            onChange={handleTextareaChange}
            placeholder="Write your reply..."
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
              Cmd+Enter to send
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
                    <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                    Writing...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-3.5 h-3.5 mr-1.5" />
                    Generate AI Reply
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
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <>
                    <Send className="w-3.5 h-3.5 mr-1.5" />
                    Send
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
