import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface TranslationCache {
  [messageId: string]: string;
}

export function useTranslation() {
  const [isTranslating, setIsTranslating] = useState(false);
  const [translations, setTranslations] = useState<TranslationCache>({});
  const [translatingIds, setTranslatingIds] = useState<Set<string>>(new Set());

  const translateMessage = useCallback(async (messageId: string, text: string): Promise<string | null> => {
    // Check cache first
    if (translations[messageId]) {
      return translations[messageId];
    }

    // Mark as translating
    setTranslatingIds(prev => new Set(prev).add(messageId));

    try {
      const { data, error } = await supabase.functions.invoke('translate-text', {
        body: { text, targetLanguage: 'pt-br' },
      });

      if (error) {
        console.error('Translation error:', error);
        return null;
      }

      const translatedText = data?.translatedText;
      
      if (translatedText) {
        setTranslations(prev => ({
          ...prev,
          [messageId]: translatedText,
        }));
        return translatedText;
      }

      return null;
    } catch (err) {
      console.error('Translation failed:', err);
      return null;
    } finally {
      setTranslatingIds(prev => {
        const next = new Set(prev);
        next.delete(messageId);
        return next;
      });
    }
  }, [translations]);

  const translateMessages = useCallback(async (messages: Array<{ id: string; content: string; direction: string }>) => {
    setIsTranslating(true);
    
    // Filter inbound messages that aren't cached yet
    const toTranslate = messages.filter(
      msg => msg.direction === 'inbound' && !translations[msg.id]
    );

    // Translate in parallel (max 3 at a time to avoid rate limits)
    const batchSize = 3;
    for (let i = 0; i < toTranslate.length; i += batchSize) {
      const batch = toTranslate.slice(i, i + batchSize);
      await Promise.all(
        batch.map(msg => translateMessage(msg.id, msg.content))
      );
    }

    setIsTranslating(false);
  }, [translations, translateMessage]);

  const getTranslation = useCallback((messageId: string): string | undefined => {
    return translations[messageId];
  }, [translations]);

  const isMessageTranslating = useCallback((messageId: string): boolean => {
    return translatingIds.has(messageId);
  }, [translatingIds]);

  const clearTranslations = useCallback(() => {
    setTranslations({});
  }, []);

  return {
    isTranslating,
    translations,
    translateMessages,
    translateMessage,
    getTranslation,
    isMessageTranslating,
    clearTranslations,
  };
}
