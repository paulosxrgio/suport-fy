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
    const store = await createStore(newStoreName.trim(), newStoreDomain.trim());
    setIsCreating(false);
    if (store) {
      setNewStoreName('');
      setNewStoreDomain('');
      setIsDialogOpen(false);
      setCurrentStore(store);
    }
  };

  if (isLoading) {
    return (
      <div className="w-full px-3 py-3">
        <div className="h-9 bg-muted animate-pulse rounded-full" />
      </div>
    );
  }

  if (stores.length === 0) {
    return (
      <div className="w-full px-3 py-3">
        <Button
          variant="outline"
          className="w-full justify-start gap-2 rounded-full"
          onClick={() => setIsDialogOpen(true)}
        >
          <Plus className="h-4 w-4" />
          Criar primeira loja
        </Button>

        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogContent className="rounded-[14px] shadow-elevated">
            <DialogHeader>
              <DialogTitle>Criar nova loja</DialogTitle>
              <DialogDescription>
                Configure sua primeira loja para começar a receber tickets.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="name">Nome da loja</Label>
                <Input id="name" placeholder="Minha Loja" value={newStoreName} onChange={(e) => setNewStoreName(e.target.value)} className="rounded-lg h-[38px]" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="domain">Domínio</Label>
                <Input id="domain" placeholder="minhaloja.com.br" value={newStoreDomain} onChange={(e) => setNewStoreDomain(e.target.value)} className="rounded-lg h-[38px]" />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsDialogOpen(false)} className="rounded-lg">Cancelar</Button>
              <Button onClick={handleCreateStore} disabled={isCreating} className="rounded-lg">{isCreating ? 'Criando...' : 'Criar loja'}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  return (
    <div className="w-full px-3 py-3">
      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverTrigger asChild>
          <button
            className="w-full flex items-center gap-2 px-3 py-2 rounded-full border border-border text-sm font-medium text-foreground hover:bg-muted transition-all duration-150"
          >
            <Store className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="truncate flex-1 text-left">{currentStore?.name || 'Selecionar loja'}</span>
            <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-[200px] p-1 rounded-lg shadow-elevated" align="start">
          <div className="flex flex-col">
            {stores.map((store) => (
              <button
                key={store.id}
                onClick={() => { setCurrentStore(store); setIsOpen(false); }}
                className={cn(
                  'flex items-center gap-2 px-3 py-2 text-sm rounded-md transition-all duration-150',
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
                className="flex items-center gap-2 px-3 py-2 text-sm rounded-md hover:bg-muted w-full text-left text-muted-foreground transition-all duration-150"
              >
                <Plus className="h-3.5 w-3.5" />
                Nova loja
              </button>
            </div>
          </div>
        </PopoverContent>
      </Popover>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="rounded-[14px] shadow-elevated">
          <DialogHeader>
            <DialogTitle>Criar nova loja</DialogTitle>
            <DialogDescription>Adicione uma nova loja para gerenciar tickets separadamente.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="new-name">Nome da loja</Label>
              <Input id="new-name" placeholder="Minha Loja" value={newStoreName} onChange={(e) => setNewStoreName(e.target.value)} className="rounded-lg h-[38px]" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-domain">Domínio</Label>
              <Input id="new-domain" placeholder="minhaloja.com.br" value={newStoreDomain} onChange={(e) => setNewStoreDomain(e.target.value)} className="rounded-lg h-[38px]" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)} className="rounded-lg">Cancelar</Button>
            <Button onClick={handleCreateStore} disabled={isCreating} className="rounded-lg">{isCreating ? 'Criando...' : 'Criar loja'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
