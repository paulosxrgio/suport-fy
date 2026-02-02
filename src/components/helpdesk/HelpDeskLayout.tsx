import { useState, useMemo } from 'react';
import { NavigationSidebar } from './NavigationSidebar';
import { TicketListHeader } from './TicketListHeader';
import { TicketList } from './TicketList';
import { ConversationView } from './ConversationView';
import { CustomerInfoSidebar } from './CustomerInfoSidebar';
import { SettingsPage } from './SettingsPage';
import { AnalyticsPage } from './AnalyticsPage';
import { AIAgentPage } from './AIAgentPage';
import { StoresPage } from './StoresPage';
import { NewTicketDialog } from './NewTicketDialog';
import { useTickets, useTicket } from '@/hooks/useTickets';
import { useMessages } from '@/hooks/useMessages';
import { useStoreContext } from '@/contexts/StoreContext';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

export function HelpDeskLayout() {
  const [activeNav, setActiveNav] = useState<'inbox' | 'ai-agent' | 'analytics' | 'settings' | 'stores'>('inbox');
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<'all' | 'open' | 'closed'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [isCustomerInfoOpen, setIsCustomerInfoOpen] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const queryClient = useQueryClient();
  const { activeStoreId, stores } = useStoreContext();

  // Fetch tickets for active store
  const { data: allTickets, isLoading: isLoadingTickets } = useTickets(
    statusFilter === 'all' ? undefined : statusFilter,
    activeStoreId
  );
  
  // Fetch selected ticket details
  const { data: selectedTicket } = useTicket(selectedTicketId);
  
  // Fetch messages for selected ticket
  const { data: messages, isLoading: isLoadingMessages } = useMessages(selectedTicketId);

  // Handle manual refresh
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

  // Filter tickets by search query
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

  // Reset selected ticket when switching stores
  useMemo(() => {
    setSelectedTicketId(null);
  }, [activeStoreId]);

  // Render content based on active nav
  const renderContent = () => {
    switch (activeNav) {
      case 'settings':
        return <SettingsPage />;
      case 'analytics':
        return <AnalyticsPage tickets={allTickets || []} />;
      case 'ai-agent':
        return <AIAgentPage />;
      case 'stores':
        return <StoresPage />;
      case 'inbox':
      default:
        // Note: We no longer block the inbox if no stores exist
        // This allows users to see legacy tickets without store_id

        return (
          <div className="flex-1 flex">
            {/* Ticket List */}
            <div className="w-80 border-r border-border flex flex-col bg-card">
              {/* New Ticket Button */}
              <div className="p-3 border-b border-border">
                <NewTicketDialog storeId={activeStoreId} />
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
      {/* Navigation Sidebar */}
      <NavigationSidebar activeNav={activeNav} onNavChange={setActiveNav} />
      
      {/* Main Content */}
      {renderContent()}
    </div>
  );
}
