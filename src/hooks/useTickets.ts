import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Ticket } from '@/types/helpdesk';

export function useTickets(status?: 'open' | 'closed') {
  return useQuery({
    queryKey: ['tickets', status],
    queryFn: async () => {
      let query = supabase
        .from('tickets')
        .select('*')
        .order('last_message_at', { ascending: false });
      
      if (status) {
        query = query.eq('status', status);
      }
      
      const { data, error } = await query;
      
      if (error) throw error;
      return data as Ticket[];
    },
  });
}

export function useTicket(ticketId: string | null) {
  return useQuery({
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
