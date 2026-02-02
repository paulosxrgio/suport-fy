import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Store } from '@/types/store';

export function useStores() {
  return useQuery({
    queryKey: ['stores'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('stores')
        .select('*')
        .order('created_at', { ascending: true });
      
      if (error) throw error;
      return data as Store[];
    },
  });
}

export function useStore(storeId: string | null) {
  return useQuery({
    queryKey: ['store', storeId],
    queryFn: async () => {
      if (!storeId) return null;
      
      const { data, error } = await supabase
        .from('stores')
        .select('*')
        .eq('id', storeId)
        .maybeSingle();
      
      if (error) throw error;
      return data as Store | null;
    },
    enabled: !!storeId,
  });
}

export function useCreateStore() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (storeData: {
      name: string;
      domain: string;
      sender_name?: string;
      sender_email?: string;
    }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Usuário não autenticado');
      
      const { data, error } = await supabase
        .from('stores')
        .insert({
          ...storeData,
          user_id: user.id,
        })
        .select()
        .single();
      
      if (error) throw error;
      return data as Store;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stores'] });
    },
  });
}

export function useUpdateStore() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ 
      storeId, 
      updates 
    }: { 
      storeId: string; 
      updates: Partial<Store> 
    }) => {
      const { data, error } = await supabase
        .from('stores')
        .update(updates)
        .eq('id', storeId)
        .select()
        .single();
      
      if (error) throw error;
      return data as Store;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stores'] });
      queryClient.invalidateQueries({ queryKey: ['store'] });
    },
  });
}

export function useDeleteStore() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (storeId: string) => {
      const { error } = await supabase
        .from('stores')
        .delete()
        .eq('id', storeId);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stores'] });
    },
  });
}
