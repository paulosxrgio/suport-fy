import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useStore } from '@/contexts/StoreContext';

export interface Request {
  id: string;
  ticket_id: string;
  store_id: string;
  customer_name: string | null;
  customer_email: string | null;
  type: string;
  description: string;
  details: Record<string, any>;
  status: string;
  created_at: string;
  resolved_at: string | null;
}

export function useRequests(statusFilter?: string, typeFilter?: string) {
  const { currentStore } = useStore();

  return useQuery({
    queryKey: ['requests', currentStore?.id, statusFilter, typeFilter],
    queryFn: async () => {
      if (!currentStore?.id) return [];

      let query = supabase
        .from('requests')
        .select('*')
        .eq('store_id', currentStore.id)
        .order('created_at', { ascending: false });

      if (statusFilter && statusFilter !== 'all') {
        query = query.eq('status', statusFilter);
      }
      if (typeFilter && typeFilter !== 'all') {
        query = query.eq('type', typeFilter);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as Request[];
    },
    enabled: !!currentStore?.id,
  });
}

export function useResolveRequest() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (requestId: string) => {
      const { error } = await supabase
        .from('requests')
        .update({ status: 'resolved', resolved_at: new Date().toISOString() })
        .eq('id', requestId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['requests'] });
    },
  });
}
