import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

export interface Store {
  id: string;
  user_id: string;
  name: string;
  domain: string;
  sender_name: string | null;
  sender_email: string | null;
  email_signature: string | null;
  resend_api_key: string | null;
  resend_api_key_configured: boolean | null;
  openai_api_key: string | null;
  ai_system_prompt: string | null;
  ai_model: string | null;
  ai_is_active: boolean | null;
  ai_response_delay: number | null;
  created_at: string;
  updated_at: string;
}

interface StoreContextType {
  stores: Store[];
  currentStore: Store | null;
  isLoading: boolean;
  setCurrentStore: (store: Store) => void;
  refetchStores: () => Promise<void>;
  createStore: (name: string, domain: string) => Promise<Store | null>;
}

const StoreContext = createContext<StoreContextType | undefined>(undefined);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [stores, setStores] = useState<Store[]>([]);
  const [currentStore, setCurrentStore] = useState<Store | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const { user } = useAuth();

  const fetchStores = async () => {
    if (!user) {
      setStores([]);
      setCurrentStore(null);
      setIsLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('stores')
        .select('*')
        .order('created_at', { ascending: true });

      if (error) throw error;

      setStores(data || []);

      // Auto-select first store if none selected
      if (data && data.length > 0 && !currentStore) {
        setCurrentStore(data[0]);
      }
    } catch (error) {
      console.error('Error fetching stores:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const createStore = async (name: string, domain: string): Promise<Store | null> => {
    if (!user) return null;

    try {
      // 1. Create the store
      const { data: newStore, error: storeError } = await supabase
        .from('stores')
        .insert({
          user_id: user.id,
          name,
          domain,
        })
        .select()
        .single();

      if (storeError) throw storeError;

      // 2. Create default settings for the new store
      const { error: settingsError } = await supabase
        .from('settings')
        .insert({
          store_id: newStore.id,
          ai_response_delay: 5,
          ai_is_active: false,
          ai_model: 'gpt-4o',
        });

      if (settingsError) {
        console.error('Error creating settings for store:', settingsError);
        // Don't fail store creation if settings fail
      }

      toast.success(`Loja "${name}" criada com sucesso!`);
      await fetchStores();
      return newStore;
    } catch (error) {
      console.error('Error creating store:', error);
      toast.error('Erro ao criar loja');
      return null;
    }
  };

  useEffect(() => {
    fetchStores();
  }, [user]);

  return (
    <StoreContext.Provider
      value={{
        stores,
        currentStore,
        isLoading,
        setCurrentStore,
        refetchStores: fetchStores,
        createStore,
      }}
    >
      {children}
    </StoreContext.Provider>
  );
}

export function useStore() {
  const context = useContext(StoreContext);
  if (context === undefined) {
    throw new Error('useStore must be used within a StoreProvider');
  }
  return context;
}
