import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
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
  
  // Subscribe to realtime updates - this is the ONLY source of truth for new messages
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
          // Debounce the invalidation to prevent multiple rapid refreshes
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
  const isSendingRef = useRef(false);
  
  return useMutation({
    mutationFn: async ({ ticketId, content }: { 
      ticketId: string; 
      content: string;
    }) => {
      // Prevent duplicate sends
      if (isSendingRef.current) {
        console.log('Send already in progress, ignoring duplicate');
        throw new Error('Envio já em andamento');
      }
      
      isSendingRef.current = true;
      
      try {
        const { data, error } = await supabase.functions.invoke('send-email-reply', {
          body: { ticketId, content },
        });
        
        if (error) throw error;
        return data;
      } finally {
        // Reset after a delay to prevent rapid re-clicks
        setTimeout(() => {
          isSendingRef.current = false;
        }, 1000);
      }
    },
    onSuccess: (_, variables) => {
      // DON'T invalidate messages here - let Realtime handle it
      // This prevents the "double message" issue
      queryClient.invalidateQueries({ queryKey: ['tickets'] });
    },
    onError: () => {
      // Reset on error so user can retry
      isSendingRef.current = false;
    },
  });
}
