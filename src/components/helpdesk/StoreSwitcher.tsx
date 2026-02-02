import { Check, ChevronsUpDown, Plus, Store } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { useStoreContext } from '@/contexts/StoreContext';
import { useState } from 'react';

interface StoreSwitcherProps {
  onAddStore: () => void;
}

export function StoreSwitcher({ onAddStore }: StoreSwitcherProps) {
  const { stores, activeStore, setActiveStoreId, isLoading } = useStoreContext();
  const [open, setOpen] = useState(false);

  if (isLoading) {
    return (
      <div className="w-full px-2">
        <div className="h-10 bg-sidebar-accent/30 rounded-lg animate-pulse" />
      </div>
    );
  }

  if (stores.length === 0) {
    return (
      <div className="w-full px-2">
        <Button
          variant="outline"
          size="sm"
          className="w-full justify-start gap-2 bg-sidebar-accent/50 border-sidebar-border text-sidebar-foreground hover:bg-sidebar-accent"
          onClick={onAddStore}
        >
          <Plus className="w-4 h-4" />
          <span className="text-xs">Adicionar Loja</span>
        </Button>
      </div>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-label="Selecionar loja"
          className="w-full justify-between bg-sidebar-accent/50 border-sidebar-border text-sidebar-foreground hover:bg-sidebar-accent px-2"
        >
          <div className="flex items-center gap-2 truncate">
            <Store className="w-4 h-4 flex-shrink-0" />
            <span className="truncate text-xs font-medium">
              {activeStore?.name || 'Selecionar loja'}
            </span>
          </div>
          <ChevronsUpDown className="w-3 h-3 flex-shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-52 p-0" align="start">
        <Command>
          <CommandInput placeholder="Buscar loja..." className="h-9" />
          <CommandList>
            <CommandEmpty>Nenhuma loja encontrada.</CommandEmpty>
            <CommandGroup heading="Suas Lojas">
              {stores.map((store) => (
                <CommandItem
                  key={store.id}
                  value={store.name}
                  onSelect={() => {
                    setActiveStoreId(store.id);
                    setOpen(false);
                  }}
                  className="text-sm"
                >
                  <Store className="mr-2 h-4 w-4" />
                  <span className="truncate">{store.name}</span>
                  <Check
                    className={cn(
                      'ml-auto h-4 w-4',
                      activeStore?.id === store.id ? 'opacity-100' : 'opacity-0'
                    )}
                  />
                </CommandItem>
              ))}
            </CommandGroup>
            <CommandSeparator />
            <CommandGroup>
              <CommandItem
                onSelect={() => {
                  setOpen(false);
                  onAddStore();
                }}
                className="text-sm"
              >
                <Plus className="mr-2 h-4 w-4" />
                Adicionar Loja
              </CommandItem>
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
