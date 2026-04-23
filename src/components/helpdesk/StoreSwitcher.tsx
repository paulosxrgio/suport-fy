import { useState } from 'react';
import { Store, Plus, Check, ChevronDown } from 'lucide-react';
import { useStore } from '@/contexts/StoreContext';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

export function StoreSwitcher() {
  const { stores, currentStore, setCurrentStore, createStore, isLoading } = useStore();
  const [isOpen, setIsOpen] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [newStoreName, setNewStoreName] = useState('');
  const [newStoreDomain, setNewStoreDomain] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  const handleCreateStore = async () => {
    if (!newStoreName.trim() || !newStoreDomain.trim()) return;
    setIsCreating(true);
    try {
      const store = await createStore(newStoreName.trim(), newStoreDomain.trim());
      if (store) {
        setNewStoreName('');
        setNewStoreDomain('');
        setIsDialogOpen(false);
        setCurrentStore(store);
      }
    } finally {
      setIsCreating(false);
    }
  };

  if (isLoading) {
    return (
      <div className="w-full">
        <div className="h-9 bg-white/5 animate-pulse rounded-lg" />
      </div>
    );
  }

  if (!stores || stores.length === 0) {
    return (
      <div className="w-full">
        <Button
          variant="outline"
          className="w-full justify-center gap-2 rounded-lg bg-transparent border-sidebar-border text-sidebar-foreground hover:bg-white/5 hover:text-sidebar-foreground"
          onClick={() => setIsDialogOpen(true)}
        >
          <Plus className="h-4 w-4" />
          Create first store
        </Button>

        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogContent className="rounded-xl shadow-elevated">
            <DialogHeader>
              <DialogTitle>Create new store</DialogTitle>
              <DialogDescription>
                Configure your first store to start receiving tickets.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="name">Store name</Label>
                <Input id="name" placeholder="My Store" value={newStoreName} onChange={(e) => setNewStoreName(e.target.value)} className="rounded-lg h-[38px]" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="domain">Domain</Label>
                <Input id="domain" placeholder="mystore.com" value={newStoreDomain} onChange={(e) => setNewStoreDomain(e.target.value)} className="rounded-lg h-[38px]" />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsDialogOpen(false)} className="rounded-lg">Cancel</Button>
              <Button onClick={handleCreateStore} disabled={isCreating} className="rounded-lg">{isCreating ? 'Creating...' : 'Create store'}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  return (
    <div className="w-full">
      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverTrigger asChild>
          <button
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg border border-sidebar-border bg-white/5 text-sm font-medium text-sidebar-foreground hover:bg-white/10 transition-all"
          >
            <Store className="h-4 w-4 shrink-0 text-sidebar-muted" />
            <span className="truncate flex-1 text-left">{currentStore?.name ?? 'Select store'}</span>
            <ChevronDown className="h-3.5 w-3.5 shrink-0 text-sidebar-muted" />
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-[200px] p-1 rounded-lg shadow-elevated" align="start">
          <div className="flex flex-col">
            {stores.map((store) => (
              <button
                key={store.id}
                onClick={() => { setCurrentStore(store); setIsOpen(false); }}
                className={cn(
                  'flex items-center gap-2 px-3 py-2 text-sm rounded-md transition-all',
                  'hover:bg-muted text-left',
                  currentStore?.id === store.id && 'bg-muted'
                )}
              >
                <Store className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <span className="flex-1 truncate">{store.name}</span>
                {currentStore?.id === store.id && (
                  <Check className="h-3.5 w-3.5 text-primary" />
                )}
              </button>
            ))}
            <div className="border-t border-border mt-1 pt-1">
              <button
                onClick={() => { setIsOpen(false); setIsDialogOpen(true); }}
                className="flex items-center gap-2 px-3 py-2 text-sm rounded-md hover:bg-muted w-full text-left text-muted-foreground transition-all"
              >
                <Plus className="h-3.5 w-3.5" />
                New store
              </button>
            </div>
          </div>
        </PopoverContent>
      </Popover>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="rounded-xl shadow-elevated">
          <DialogHeader>
            <DialogTitle>Create new store</DialogTitle>
            <DialogDescription>Add a new store to manage tickets separately.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="new-name">Store name</Label>
              <Input id="new-name" placeholder="My Store" value={newStoreName} onChange={(e) => setNewStoreName(e.target.value)} className="rounded-lg h-[38px]" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-domain">Domain</Label>
              <Input id="new-domain" placeholder="mystore.com" value={newStoreDomain} onChange={(e) => setNewStoreDomain(e.target.value)} className="rounded-lg h-[38px]" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)} className="rounded-lg">Cancel</Button>
            <Button onClick={handleCreateStore} disabled={isCreating} className="rounded-lg">{isCreating ? 'Creating...' : 'Create store'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
