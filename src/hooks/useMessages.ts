import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Message } from '@/types/helpdesk';

export function useMessages(ticketId: string | null) {
  const queryClient = useQueryClient();
  
  const query = useQuery({
    queryKey: ['messages', ticketId],
    queryFn: async () => {
      if (!ticketId) return [];
      
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .eq('ticket_id', ticketId)
        .order('created_at', { ascending: true });
      
      if (error) throw error;
      return data as Message[];
    },
    enabled: !!ticketId,
  });
  
  // Subscribe to realtime updates
  useEffect(() => {
    if (!ticketId) return;
    
    const channel = supabase
      .channel(`messages-${ticketId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `ticket_id=eq.${ticketId}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['messages', ticketId] });
        }
      )
      .subscribe();
    
    return () => {
      supabase.removeChannel(channel);
    };
  }, [ticketId, queryClient]);
  
  return query;
}

export function useSendMessage() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ ticketId, content, senderEmail }: { 
      ticketId: string; 
      content: string;
      senderEmail: string;
    }) => {
      const { data, error } = await supabase.functions.invoke('send-email-reply', {
        body: { ticketId, content, senderEmail },
      });
      
      if (error) throw error;
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['messages', variables.ticketId] });
      queryClient.invalidateQueries({ queryKey: ['tickets'] });
    },
  });
}
