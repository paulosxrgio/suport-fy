import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Ticket } from '@/types/helpdesk';

export function useTickets(status?: 'open' | 'closed', storeId?: string | null) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['tickets', status, storeId],
    queryFn: async () => {
      let q = supabase
        .from('tickets')
        .select('*')
        .order('last_message_at', { ascending: false });
      
      if (status) {
        q = q.eq('status', status);
      }

      // Filter by store if provided
      if (storeId) {
        q = q.eq('store_id', storeId);
      }
      
      const { data, error } = await q;
      
      if (error) throw error;
      return data as Ticket[];
    },
  });

  // Subscribe to realtime updates for tickets
  useEffect(() => {
    const channel = supabase
      .channel('tickets-realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'tickets',
        },
        () => {
          // Invalidate all ticket queries when any change happens
          queryClient.invalidateQueries({ queryKey: ['tickets'] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  return query;
}

export function useTicket(ticketId: string | null) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['ticket', ticketId],
    queryFn: async () => {
      if (!ticketId) return null;
      
      const { data, error } = await supabase
        .from('tickets')
        .select('*')
        .eq('id', ticketId)
        .maybeSingle();
      
      if (error) throw error;
      return data as Ticket | null;
    },
    enabled: !!ticketId,
  });

  // Subscribe to realtime updates for the specific ticket
  useEffect(() => {
    if (!ticketId) return;

    const channel = supabase
      .channel(`ticket-${ticketId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'tickets',
          filter: `id=eq.${ticketId}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['ticket', ticketId] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [ticketId, queryClient]);

  return query;
}

export function useUpdateTicketStatus() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ ticketId, status }: { ticketId: string; status: 'open' | 'closed' }) => {
      const { error } = await supabase
        .from('tickets')
        .update({ status })
        .eq('id', ticketId);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tickets'] });
      queryClient.invalidateQueries({ queryKey: ['ticket'] });
    },
  });
}

export function useMarkTicketAsRead() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (ticketId: string) => {
      const { error } = await supabase
        .from('tickets')
        .update({ is_read: true })
        .eq('id', ticketId);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tickets'] });
      queryClient.invalidateQueries({ queryKey: ['ticket'] });
    },
  });
}
