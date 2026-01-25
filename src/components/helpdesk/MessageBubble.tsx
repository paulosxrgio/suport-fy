import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { User, Headphones } from 'lucide-react';
import { useMemo } from 'react';
import DOMPurify from 'dompurify';

interface Message {
  id: string;
  ticket_id: string;
  content: string;
  html_body: string | null;
  direction: 'inbound' | 'outbound';
  sender_email: string;
  created_at: string;
}

interface MessageBubbleProps {
  message: Message;
  senderName?: string;
}

export function MessageBubble({ message, senderName }: MessageBubbleProps) {
  const isOutbound = message.direction === 'outbound';
  
  const sanitizedHtml = useMemo(() => {
    if (message.html_body) {
      return DOMPurify.sanitize(message.html_body, {
        ALLOWED_TAGS: ['p', 'br', 'b', 'i', 'u', 'strong', 'em', 'a', 'ul', 'ol', 'li', 'blockquote', 'span', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'],
        ALLOWED_ATTR: ['href', 'target', 'rel', 'style'],
      });
    }
    return null;
  }, [message.html_body]);

  // Extract display name for inbound messages
  const displayName = useMemo(() => {
    if (isOutbound) return null;
    if (senderName) return senderName;
    // Fallback: use email prefix
    return message.sender_email.split('@')[0] || 'Cliente';
  }, [isOutbound, senderName, message.sender_email]);
  
  return (
    <div
      className={cn(
        'flex gap-3 animate-fade-in',
        isOutbound ? 'flex-row-reverse' : 'flex-row'
      )}
    >
      {/* Avatar */}
      <div
        className={cn(
          'w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0',
          isOutbound ? 'bg-primary' : 'bg-muted'
        )}
      >
        {isOutbound ? (
          <Headphones className="w-4 h-4 text-primary-foreground" />
        ) : (
          <User className="w-4 h-4 text-muted-foreground" />
        )}
      </div>
      
      {/* Bubble */}
      <div className={cn('flex flex-col min-w-0 max-w-[75%]', isOutbound ? 'items-end' : 'items-start')}>
        {/* Sender name for inbound messages */}
        {displayName && (
          <span className="text-xs font-semibold text-muted-foreground mb-1 px-1">
            {displayName}
          </span>
        )}
        
        <div
          className={cn(
            'message-bubble min-w-0',
            isOutbound ? 'message-bubble-outbound' : 'message-bubble-inbound'
          )}
        >
          {sanitizedHtml ? (
            <div 
              className="text-sm prose prose-sm max-w-none dark:prose-invert 
                         prose-p:my-1 prose-p:leading-relaxed
                         prose-a:text-primary prose-a:no-underline hover:prose-a:underline
                         break-words overflow-hidden"
              dangerouslySetInnerHTML={{ __html: sanitizedHtml }}
            />
          ) : (
            <p className="text-sm whitespace-pre-wrap break-words leading-relaxed">
              {message.content}
            </p>
          )}
        </div>
        
        {/* Timestamp */}
        <span className="text-xs text-muted-foreground mt-1 px-1">
          {formatDistanceToNow(new Date(message.created_at), { 
            addSuffix: true, 
            locale: ptBR 
          })}
        </span>
      </div>
    </div>
  );
}
