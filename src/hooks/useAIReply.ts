import { useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

interface GenerateAIReplyParams {
  ticketId: string;
  lastMessageContent?: string;
}

interface GenerateAIReplyResponse {
  reply?: string;
  blocked?: boolean;
  reason?: string;
}

export function useGenerateAIReply() {
  return useMutation({
    mutationFn: async ({ ticketId, lastMessageContent }: GenerateAIReplyParams): Promise<string> => {
      const { data, error } = await supabase.functions.invoke<GenerateAIReplyResponse>('generate-ai-reply', {
        body: { ticketId, lastMessageContent },
      });

      if (error) {
        throw new Error(error.message || 'Falha ao gerar resposta com IA');
      }

      if (data?.blocked) {
        throw new Error(`Resposta automática bloqueada: ${data.reason || 'possível loop detectado'}`);
      }

      if (!data?.reply) {
        throw new Error('Nenhuma resposta gerada');
      }

      return data.reply;
    },
  });
}
