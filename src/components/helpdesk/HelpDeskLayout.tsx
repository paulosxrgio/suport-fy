import { useState, useMemo } from 'react';
import { NavigationSidebar } from './NavigationSidebar';
import { TicketListHeader } from './TicketListHeader';
import { TicketList } from './TicketList';
import { ConversationView } from './ConversationView';
import { CustomerInfoSidebar } from './CustomerInfoSidebar';
import { SettingsPage } from './SettingsPage';
import { AnalyticsPage } from './AnalyticsPage';
import { AIAgentPage } from './AIAgentPage';
import { NewTicketDialog } from './NewTicketDialog';
import { useTickets, useTicket } from '@/hooks/useTickets';
import { useMessages } from '@/hooks/useMessages';
import { useStore } from '@/contexts/StoreContext';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Storefront } from '@phosphor-icons/react';

export function HelpDeskLayout() {
  const [activeNav, setActiveNav] = useState<'inbox' | 'ai-agent' | 'analytics' | 'settings'>('inbox');
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<'all' | 'open' | 'closed'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [isCustomerInfoOpen, setIsCustomerInfoOpen] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const queryClient = useQueryClient();
  const { currentStore, stores, isLoading: isLoadingStores } = useStore();

  const { data: allTickets, isLoading: isLoadingTickets } = useTickets(
    statusFilter === 'all' ? undefined : statusFilter
  );
  const { data: selectedTicket } = useTicket(selectedTicketId);
  const { data: messages, isLoading: isLoadingMessages } = useMessages(selectedTicketId);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await queryClient.invalidateQueries({ queryKey: ['tickets'] });
      await queryClient.invalidateQueries({ queryKey: ['messages'] });
      toast.success('Lista atualizada!');
    } finally {
      setIsRefreshing(false);
    }
  };

  const filteredTickets = useMemo(() => {
    if (!allTickets) return [];
    if (!searchQuery.trim()) return allTickets;
    const query = searchQuery.toLowerCase();
    return allTickets.filter(
      (ticket) =>
        ticket.subject.toLowerCase().includes(query) ||
        ticket.customer_email.toLowerCase().includes(query) ||
        (ticket.customer_name?.toLowerCase().includes(query) ?? false)
    );
  }, [allTickets, searchQuery]);

  const renderEmptyStoreState = () => (
    <div className="flex-1 flex items-center justify-center bg-background">
      <div className="text-center max-w-md px-4">
        <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
          <Storefront className="w-8 h-8 text-muted-foreground" />
        </div>
        <h2 className="text-xl font-semibold mb-2">Crie sua primeira loja</h2>
        <p className="text-muted-foreground mb-4">
          Para começar a receber tickets de suporte, você precisa criar uma loja.
          Use o botão "Criar primeira loja" na barra lateral.
        </p>
      </div>
    </div>
  );

  const renderContent = () => {
    if (isLoadingStores) {
      return (
        <div className="flex-1 flex items-center justify-center">
          <div className="animate-pulse text-muted-foreground">Carregando...</div>
        </div>
      );
    }

    if (stores.length === 0 && activeNav === 'inbox') {
      return renderEmptyStoreState();
    }

    switch (activeNav) {
      case 'settings':
        return <SettingsPage />;
      case 'analytics':
        return <AnalyticsPage tickets={allTickets || []} />;
      case 'ai-agent':
        return <AIAgentPage />;
      case 'inbox':
      default:
        return (
          <div className="flex-1 flex">
            {/* Ticket List — 320px */}
            <div className="w-[320px] border-r border-border flex flex-col bg-card">
              <div className="p-3 border-b border-border">
                <NewTicketDialog />
              </div>
              <TicketListHeader
                searchQuery={searchQuery}
                onSearchChange={setSearchQuery}
                statusFilter={statusFilter}
                onStatusFilterChange={setStatusFilter}
                ticketCount={filteredTickets.length}
                onRefresh={handleRefresh}
                isRefreshing={isRefreshing}
              />
              <TicketList
                tickets={filteredTickets}
                isLoading={isLoadingTickets}
                selectedTicketId={selectedTicketId}
                onSelectTicket={setSelectedTicketId}
              />
            </div>

            {/* Conversation View */}
            <div className="flex-1 flex relative">
              <ConversationView
                ticket={selectedTicket ?? null}
                messages={messages}
                isLoading={isLoadingMessages}
              />
              <CustomerInfoSidebar
                ticket={selectedTicket ?? null}
                isOpen={isCustomerInfoOpen}
                onToggle={() => setIsCustomerInfoOpen(!isCustomerInfoOpen)}
              />
            </div>
          </div>
        );
    }
  };

  return (
    <div className="h-screen flex bg-background">
      <NavigationSidebar activeNav={activeNav} onNavChange={setActiveNav} />
      {renderContent()}
    </div>
  );
}
