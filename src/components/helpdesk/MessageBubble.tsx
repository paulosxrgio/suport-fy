import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { Message } from '@/types/helpdesk';
import { User, Headphones } from 'lucide-react';

interface MessageBubbleProps {
  message: Message;
}

export function MessageBubble({ message }: MessageBubbleProps) {
  const isOutbound = message.direction === 'outbound';
  
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
      <div className={cn('flex flex-col', isOutbound ? 'items-end' : 'items-start')}>
        <div
          className={cn(
            'message-bubble',
            isOutbound ? 'message-bubble-outbound' : 'message-bubble-inbound'
          )}
        >
          <p className="text-sm whitespace-pre-wrap">{message.content}</p>
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
