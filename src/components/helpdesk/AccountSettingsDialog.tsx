import { useState, useEffect } from 'react';
import { User, GripVertical, Store as StoreIcon } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

interface StoreItem {
  id: string;
  name: string;
  domain: string;
  is_visible_in_dashboard: boolean;
  display_order: number;
}

export function AccountSettingsDialog() {
  const [isOpen, setIsOpen] = useState(false);
  const [stores, setStores] = useState<StoreItem[]>([]);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: storesData, isLoading } = useQuery({
    queryKey: ['all-stores-settings'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('stores')
        .select('id, name, domain, is_visible_in_dashboard, display_order')
        .order('display_order', { ascending: true });
      if (error) throw error;
      return data as StoreItem[];
    },
    enabled: isOpen && !!user,
  });

  useEffect(() => {
    if (storesData) setStores(storesData);
  }, [storesData]);

  const toggleVisibilityMutation = useMutation({
    mutationFn: async ({ storeId, isVisible }: { storeId: string; isVisible: boolean }) => {
      const { error } = await supabase
        .from('stores')
        .update({ is_visible_in_dashboard: isVisible })
        .eq('id', storeId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stores'] });
      queryClient.invalidateQueries({ queryKey: ['all-stores-settings'] });
    },
    onError: () => toast.error('Failed to update visibility'),
  });

  const updateOrderMutation = useMutation({
    mutationFn: async (orderedStores: { id: string; display_order: number }[]) => {
      for (const store of orderedStores) {
        const { error } = await supabase
          .from('stores')
          .update({ display_order: store.display_order })
          .eq('id', store.id);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stores'] });
      queryClient.invalidateQueries({ queryKey: ['all-stores-settings'] });
      toast.success('Order updated!');
    },
    onError: () => toast.error('Failed to update order'),
  });

  const handleToggleVisibility = (storeId: string, currentValue: boolean) => {
    setStores(prev => prev.map(s => s.id === storeId ? { ...s, is_visible_in_dashboard: !currentValue } : s));
    toggleVisibilityMutation.mutate({ storeId, isVisible: !currentValue });
  };

  const handleDragStart = (index: number) => setDraggedIndex(index);

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === index) return;
    const newStores = [...stores];
    const draggedStore = newStores[draggedIndex];
    newStores.splice(draggedIndex, 1);
    newStores.splice(index, 0, draggedStore);
    setStores(newStores);
    setDraggedIndex(index);
  };

  const handleDragEnd = () => {
    if (draggedIndex !== null) {
      const orderedStores = stores.map((store, index) => ({ id: store.id, display_order: index }));
      updateOrderMutation.mutate(orderedStores);
    }
    setDraggedIndex(null);
  };

  const visibleCount = stores.filter(s => s.is_visible_in_dashboard).length;

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <button
          className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium w-full text-sidebar-foreground/70 hover:bg-sidebar-accent/40 hover:text-sidebar-foreground transition-all duration-150"
        >
          <User className="w-[18px] h-[18px]" />
          <span>My Stores</span>
        </button>
      </DialogTrigger>

      <DialogContent className="max-w-md rounded-[14px] shadow-elevated backdrop-blur-sm">
        <DialogHeader>
          <DialogTitle>Manage Stores</DialogTitle>
          <DialogDescription>
            Choose which stores appear in the panel and their display order.
            Drag to reorder.
          </DialogDescription>
        </DialogHeader>

        <div className="mt-4">
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2].map(i => (
                <div key={i} className="h-16 bg-muted animate-pulse rounded-lg" />
              ))}
            </div>
          ) : stores.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <StoreIcon className="w-10 h-10 mx-auto mb-2 opacity-30" />
              <p>No stores found</p>
            </div>
          ) : (
            <>
              <div className="text-xs text-muted-foreground mb-3">
                {visibleCount} of {stores.length} stores visible in panel
              </div>
              <div className="space-y-2">
                {stores.map((store, index) => (
                  <div
                    key={store.id}
                    draggable
                    onDragStart={() => handleDragStart(index)}
                    onDragOver={(e) => handleDragOver(e, index)}
                    onDragEnd={handleDragEnd}
                    className={cn(
                      "flex items-center gap-3 p-3 rounded-lg border border-border bg-card cursor-grab active:cursor-grabbing",
                      "transition-all duration-150",
                      draggedIndex === index && "opacity-50 ring-2 ring-primary",
                      !store.is_visible_in_dashboard && "opacity-60"
                    )}
                  >
                    <GripVertical className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{store.name}</p>
                      <p className="text-xs text-muted-foreground truncate">{store.domain}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Label htmlFor={`visible-${store.id}`} className="text-xs text-muted-foreground">
                        Visible
                      </Label>
                      <Switch
                        id={`visible-${store.id}`}
                        checked={store.is_visible_in_dashboard}
                        onCheckedChange={() => handleToggleVisibility(store.id, store.is_visible_in_dashboard)}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        <div className="mt-4 pt-4 border-t border-border">
          <Button variant="outline" className="w-full rounded-lg" onClick={() => setIsOpen(false)}>
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
