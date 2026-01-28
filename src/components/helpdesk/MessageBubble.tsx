import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { User, Headphones, Languages, Loader2 } from 'lucide-react';
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
  translatedContent?: string;
  isTranslating?: boolean;
  showTranslated?: boolean;
}

export function MessageBubble({ message, senderName, translatedContent, isTranslating, showTranslated }: MessageBubbleProps) {
  const isOutbound = message.direction === 'outbound';
  const isInbound = message.direction === 'inbound';
  
  // Clean quoted content from messages
  const cleanedContent = useMemo(() => {
    return stripQuotedText(message.content);
  }, [message.content]);

  // Determine which content to show
  const displayContent = useMemo(() => {
    if (showTranslated && isInbound && translatedContent) {
      return translatedContent;
    }
    return cleanedContent;
  }, [showTranslated, isInbound, translatedContent, cleanedContent]);

  const isShowingTranslation = showTranslated && isInbound && translatedContent;

  const sanitizedHtml = useMemo(() => {
    // Don't use HTML when showing translation (translation is plain text)
    if (isShowingTranslation) return null;
    
    if (message.html_body) {
      const cleanedHtml = stripQuotedHtml(message.html_body);
      return DOMPurify.sanitize(cleanedHtml, {
        ALLOWED_TAGS: ['p', 'br', 'b', 'i', 'u', 'strong', 'em', 'a', 'ul', 'ol', 'li', 'span', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'],
        ALLOWED_ATTR: ['href', 'target', 'rel', 'style'],
      });
    }
    return null;
  }, [message.html_body, isShowingTranslation]);

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
          {/* Translation loading indicator */}
          {isTranslating && isInbound && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1">
              <Loader2 className="w-3 h-3 animate-spin" />
              <span>Traduzindo...</span>
            </div>
          )}
          
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
              {displayContent}
            </p>
          )}
          
          {/* Translation indicator */}
          {isShowingTranslation && (
            <div className="flex items-center gap-1 mt-2 pt-2 border-t border-border/50">
              <Languages className="w-3 h-3 text-primary" />
              <span className="text-xs text-primary font-medium">Traduzido</span>
            </div>
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
