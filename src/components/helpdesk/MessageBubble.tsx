import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { User, Headphones } from 'lucide-react';
import { useMemo } from 'react';

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
}

// Simple HTML sanitizer - removes script tags and event handlers
function sanitizeHtml(html: string): string {
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/\s*on\w+\s*=\s*["'][^"']*["']/gi, '')
    .replace(/\s*on\w+\s*=\s*[^\s>]+/gi, '')
    .replace(/javascript:/gi, '');
}

export function MessageBubble({ message }: MessageBubbleProps) {
  const isOutbound = message.direction === 'outbound';
  
  const sanitizedHtml = useMemo(() => {
    if (message.html_body) {
      return sanitizeHtml(message.html_body);
    }
    return null;
  }, [message.html_body]);
  
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
      <div className={cn('flex flex-col max-w-[70%]', isOutbound ? 'items-end' : 'items-start')}>
        <div
          className={cn(
            'message-bubble',
            isOutbound ? 'message-bubble-outbound' : 'message-bubble-inbound'
          )}
        >
          {sanitizedHtml ? (
            <div 
              className="text-sm prose prose-sm max-w-none dark:prose-invert"
              dangerouslySetInnerHTML={{ __html: sanitizedHtml }}
            />
          ) : (
            <p className="text-sm whitespace-pre-wrap">{message.content}</p>
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
