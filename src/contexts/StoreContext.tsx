import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useStores } from '@/hooks/useStores';
import { Store } from '@/types/store';

interface StoreContextType {
  activeStoreId: string | null;
  activeStore: Store | null;
  stores: Store[];
  isLoading: boolean;
  setActiveStoreId: (id: string | null) => void;
}

const StoreContext = createContext<StoreContextType | undefined>(undefined);

const ACTIVE_STORE_KEY = 'suportfy_active_store';

export function StoreProvider({ children }: { children: ReactNode }) {
  const { data: stores = [], isLoading } = useStores();
  const [activeStoreId, setActiveStoreIdState] = useState<string | null>(() => {
    return localStorage.getItem(ACTIVE_STORE_KEY);
  });

  // Set first store as active if none selected
  useEffect(() => {
    if (!isLoading && stores.length > 0 && !activeStoreId) {
      const firstStoreId = stores[0].id;
      setActiveStoreIdState(firstStoreId);
      localStorage.setItem(ACTIVE_STORE_KEY, firstStoreId);
    }
  }, [stores, isLoading, activeStoreId]);

  // Validate that active store still exists
  useEffect(() => {
    if (!isLoading && activeStoreId && stores.length > 0) {
      const storeExists = stores.some(s => s.id === activeStoreId);
      if (!storeExists) {
        const firstStoreId = stores[0].id;
        setActiveStoreIdState(firstStoreId);
        localStorage.setItem(ACTIVE_STORE_KEY, firstStoreId);
      }
    }
  }, [stores, isLoading, activeStoreId]);

  const setActiveStoreId = (id: string | null) => {
    setActiveStoreIdState(id);
    if (id) {
      localStorage.setItem(ACTIVE_STORE_KEY, id);
    } else {
      localStorage.removeItem(ACTIVE_STORE_KEY);
    }
  };

  const activeStore = stores.find(s => s.id === activeStoreId) || null;

  return (
    <StoreContext.Provider value={{
      activeStoreId,
      activeStore,
      stores,
      isLoading,
      setActiveStoreId,
    }}>
      {children}
    </StoreContext.Provider>
  );
}

export function useStoreContext() {
  const context = useContext(StoreContext);
  if (context === undefined) {
    throw new Error('useStoreContext must be used within a StoreProvider');
  }
  return context;
}
