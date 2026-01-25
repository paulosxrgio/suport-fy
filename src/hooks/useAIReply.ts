import { useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

interface GenerateAIReplyParams {
  ticketId: string;
  lastMessageContent?: string;
}

interface GenerateAIReplyResponse {
  reply: string;
}

export function useGenerateAIReply() {
  return useMutation({
    mutationFn: async ({ ticketId, lastMessageContent }: GenerateAIReplyParams): Promise<string> => {
      const { data, error } = await supabase.functions.invoke<GenerateAIReplyResponse>('generate-ai-reply', {
        body: { ticketId, lastMessageContent },
      });

      if (error) {
        throw new Error(error.message || 'Failed to generate AI reply');
      }

      if (!data?.reply) {
        throw new Error('No reply generated');
      }

      return data.reply;
    },
  });
}
