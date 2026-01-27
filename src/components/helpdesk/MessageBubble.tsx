import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { Headphones } from 'lucide-react';
import { useMemo } from 'react';
import DOMPurify from 'dompurify';

// Helper: Strip quoted text from email content (fallback for old messages)
function stripQuotedText(text: string): string {
  if (!text) return '';
  
  const lines = text.split('\n');
  const cleanLines: string[] = [];
  
  for (const line of lines) {
    const trimmed = line.trim();
    
    // Quoted message indicators (multi-language)
    if (/^Em\s.+escreveu:/i.test(trimmed)) break;
    if (/^On\s.+wrote:/i.test(trimmed)) break;
    if (/^Le\s.+a\s+écrit\s*:/i.test(trimmed)) break;
    if (/^El\s.+escribi[oó]:/i.test(trimmed)) break;
    if (/^Am\s.+schrieb/i.test(trimmed)) break;
    
    // Match "Name <email> wrote:" pattern
    if (/<[^>]+@[^>]+>\s*(wrote|escreveu|a écrit|escribió|schrieb)\s*:/i.test(trimmed)) break;
    
    // Classic forwarding/reply delimiters
    if (/^-{3,}\s*Original Message\s*-{3,}$/i.test(trimmed)) break;
    if (/^-{3,}\s*Mensagem Original\s*-{3,}$/i.test(trimmed)) break;
    if (/^-{5,}$/i.test(trimmed) && cleanLines.length > 0) break;
    if (/^From:\s/i.test(trimmed) && cleanLines.length > 0) break;
    if (/^De:\s/i.test(trimmed) && cleanLines.length > 0) break;
    
    // Gmail blockquote indicator
    if (trimmed.startsWith('>') && cleanLines.length > 0) continue;
    
    cleanLines.push(line);
  }
  
  let result = cleanLines.join('\n');
  result = result.replace(/\n{3,}/g, '\n\n');
  return result.trim();
}

// Helper: Strip quoted content from HTML
function stripQuotedHtml(html: string): string {
  if (!html) return '';
  
  let cleaned = html;
  
  // Remove Gmail's quoted content div
  cleaned = cleaned.replace(/<div class="gmail_quote"[\s\S]*$/gi, '');
  
  // Remove blockquotes
  cleaned = cleaned.replace(/<blockquote[\s\S]*?<\/blockquote>/gi, '');
  
  // Remove content after "wrote:" patterns
  cleaned = cleaned.replace(/On\s[^<]+wrote:[\s\S]*$/gi, '');
  cleaned = cleaned.replace(/Em\s[^<]+escreveu:[\s\S]*$/gi, '');
  
  // Remove content after email pattern with wrote
  cleaned = cleaned.replace(/<[^>]+@[^>]+>\s*(wrote|escreveu)[^<]*:[\s\S]*$/gi, '');
  
  return cleaned.trim();
}

// Helper: Get initials from name or email
function getInitials(name: string | null | undefined, email: string): string {
  if (name && name.trim()) {
    const parts = name.trim().split(' ').filter(Boolean);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return parts[0].substring(0, 2).toUpperCase();
  }
  // Fallback to email prefix
  const prefix = email.split('@')[0] || 'U';
  return prefix.substring(0, 2).toUpperCase();
}

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
  isLastInbound?: boolean;
}

export function MessageBubble({ message, senderName, isLastInbound }: MessageBubbleProps) {
  const isOutbound = message.direction === 'outbound';
  
  // Clean quoted content from messages
  const cleanedContent = useMemo(() => {
    return stripQuotedText(message.content);
  }, [message.content]);

  const sanitizedHtml = useMemo(() => {
    if (message.html_body) {
      const cleanedHtml = stripQuotedHtml(message.html_body);
      return DOMPurify.sanitize(cleanedHtml, {
        ALLOWED_TAGS: ['p', 'br', 'b', 'i', 'u', 'strong', 'em', 'a', 'ul', 'ol', 'li', 'span', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'],
        ALLOWED_ATTR: ['href', 'target', 'rel', 'style'],
      });
    }
    return null;
  }, [message.html_body]);

  // Get initials for inbound messages
  const initials = useMemo(() => {
    if (isOutbound) return null;
    return getInitials(senderName, message.sender_email);
  }, [isOutbound, senderName, message.sender_email]);

  // Display name for inbound messages
  const displayName = useMemo(() => {
    if (isOutbound) return null;
    if (senderName) return senderName;
    return message.sender_email.split('@')[0] || 'Cliente';
  }, [isOutbound, senderName, message.sender_email]);

  // Format timestamp
  const timestamp = useMemo(() => {
    return format(new Date(message.created_at), "HH:mm", { locale: ptBR });
  }, [message.created_at]);
  
  return (
    <div
      className={cn(
        'flex gap-3 animate-fade-in',
        isOutbound ? 'justify-end' : 'justify-start'
      )}
    >
      {/* Avatar for inbound messages (left side) */}
      {!isOutbound && (
        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-slate-200 to-slate-300 dark:from-slate-600 dark:to-slate-700 flex items-center justify-center flex-shrink-0 shadow-sm">
          <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">
            {initials}
          </span>
        </div>
      )}
      
      {/* Message Content */}
      <div className={cn('flex flex-col min-w-0 max-w-[70%]', isOutbound ? 'items-end' : 'items-start')}>
        {/* Sender name for inbound messages */}
        {displayName && (
          <span className="text-xs font-medium text-muted-foreground mb-1 px-1">
            {displayName}
          </span>
        )}
        
        {/* Message Bubble */}
        <div
          className={cn(
            'relative px-4 py-3 shadow-sm',
            isOutbound 
              ? 'bg-primary text-primary-foreground rounded-2xl rounded-br-md' 
              : 'bg-card border border-border text-foreground rounded-2xl rounded-bl-md',
            // New message indicator for last inbound
            isLastInbound && !isOutbound && 'ring-2 ring-primary/50 ring-offset-1 ring-offset-background'
          )}
        >
          {/* "Novo" badge for last inbound message */}
          {isLastInbound && !isOutbound && (
            <span className="absolute -top-2 -right-2 px-1.5 py-0.5 text-[10px] font-semibold bg-primary text-primary-foreground rounded-full shadow-sm">
              Novo
            </span>
          )}
          
          {sanitizedHtml ? (
            <div 
              className={cn(
                "text-sm prose prose-sm max-w-none",
                "prose-p:my-1 prose-p:leading-relaxed",
                "prose-a:underline hover:prose-a:no-underline",
                "break-words overflow-hidden",
                isOutbound 
                  ? "prose-invert prose-a:text-primary-foreground/90" 
                  : "dark:prose-invert prose-a:text-primary"
              )}
              dangerouslySetInnerHTML={{ __html: sanitizedHtml }}
            />
          ) : (
            <p className="text-sm whitespace-pre-wrap break-words leading-relaxed">
              {cleanedContent}
            </p>
          )}
          
          {/* Timestamp inside bubble */}
          <span className={cn(
            "text-[10px] mt-1 block text-right",
            isOutbound ? "text-primary-foreground/70" : "text-muted-foreground"
          )}>
            {timestamp}
          </span>
        </div>
      </div>

      {/* Small avatar for outbound messages (right side) */}
      {isOutbound && (
        <div className="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
          <Headphones className="w-3.5 h-3.5 text-primary" />
        </div>
      )}
    </div>
  );
}