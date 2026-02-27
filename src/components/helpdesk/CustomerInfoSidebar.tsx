import { useState, useEffect } from 'react';
import { ChevronRight, Mail, User, Calendar, ShoppingBag, ExternalLink, Package } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { Ticket } from '@/types/helpdesk';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { supabase } from '@/integrations/supabase/client';

interface ShopifyOrderItem {
  name: string;
  variant: string | null;
  quantity: number;
  price: string;
}

interface ShopifyOrder {
  order_number: number;
  status: string;
  financial_status: string;
  total_price: string;
  currency: string;
  created_at: string;
  tracking_number: string | null;
  tracking_company: string | null;
  tracking_url: string | null;
  items: ShopifyOrderItem[];
}

interface CustomerInfoSidebarProps {
  ticket: Ticket | null;
  isOpen: boolean;
  onToggle: () => void;
}

function getStatusBadge(status: string) {
  switch (status) {
    case 'fulfilled':
      return <Badge className="bg-green-500/15 text-green-700 border-green-500/30 text-[10px] px-1.5 py-0">Enviado</Badge>;
    case 'cancelled':
      return <Badge className="bg-red-500/15 text-red-700 border-red-500/30 text-[10px] px-1.5 py-0">Cancelado</Badge>;
    default:
      return <Badge className="bg-yellow-500/15 text-yellow-700 border-yellow-500/30 text-[10px] px-1.5 py-0">Pendente</Badge>;
  }
}

function getFinancialBadge(status: string) {
  switch (status) {
    case 'paid':
      return <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-green-700">Pago</Badge>;
    case 'refunded':
      return <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-red-700">Reembolsado</Badge>;
    case 'partially_refunded':
      return <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-orange-700">Parcial</Badge>;
    default:
      return <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-muted-foreground">{status}</Badge>;
  }
}

export function CustomerInfoSidebar({ ticket, isOpen, onToggle }: CustomerInfoSidebarProps) {
  const [orders, setOrders] = useState<ShopifyOrder[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(false);
  const [notConfigured, setNotConfigured] = useState(false);

  useEffect(() => {
    if (!ticket?.id) return;

    const fetchOrders = async () => {
      setLoadingOrders(true);
      setNotConfigured(false);
      try {
        const { data, error } = await supabase.functions.invoke('get-shopify-customer-orders', {
          body: { ticketId: ticket.id },
        });
        if (error) throw error;
        if (data?.not_configured) {
          setNotConfigured(true);
          setOrders([]);
        } else {
          setOrders(data?.orders || []);
        }
      } catch (err) {
        console.error('Error fetching Shopify orders:', err);
        setOrders([]);
      } finally {
        setLoadingOrders(false);
      }
    };

    fetchOrders();
  }, [ticket?.id]);

  if (!ticket) {
    return null;
  }

  return (
    <>
      {/* Toggle Button (always visible) */}
      <Button
        variant="ghost"
        size="icon"
        onClick={onToggle}
        className={cn(
          'absolute right-0 top-1/2 -translate-y-1/2 z-10 bg-card border shadow-sm',
          'rounded-l-lg rounded-r-none h-12 w-6',
          isOpen && 'right-72'
        )}
      >
        <ChevronRight
          className={cn('w-4 h-4 transition-transform', isOpen && 'rotate-180')}
        />
      </Button>

      {/* Sidebar */}
      <div
        className={cn(
          'w-72 border-l border-border bg-card transition-all duration-200',
          'overflow-y-auto',
          isOpen ? 'translate-x-0' : 'translate-x-full absolute right-0 h-full'
        )}
      >
        <div className="p-4">
          <h3 className="font-semibold text-foreground mb-4">Informações do Cliente</h3>
          
          <div className="space-y-4">
            {/* Avatar */}
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                <User className="w-6 h-6 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-foreground truncate">
                  {ticket.customer_name || 'Sem nome'}
                </p>
                <p className="text-sm text-muted-foreground">Cliente</p>
              </div>
            </div>

            <Separator />

            {/* Email */}
            <div className="flex items-start gap-3">
              <Mail className="w-4 h-4 text-muted-foreground mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">
                  E-mail
                </p>
                <p className="text-sm text-foreground break-all">
                  {ticket.customer_email}
                </p>
              </div>
            </div>

            {/* Created At */}
            <div className="flex items-start gap-3">
              <Calendar className="w-4 h-4 text-muted-foreground mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">
                  Ticket criado
                </p>
                <p className="text-sm text-foreground">
                  {format(new Date(ticket.created_at), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
                </p>
                <p className="text-xs text-muted-foreground">
                  {format(new Date(ticket.created_at), 'HH:mm')}
                </p>
              </div>
            </div>

            <Separator />

            {/* Shopify Orders */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <ShoppingBag className="w-4 h-4 text-muted-foreground" />
                <p className="text-xs text-muted-foreground uppercase tracking-wider">
                  Pedidos Shopify
                </p>
              </div>

              {loadingOrders && (
                <div className="space-y-2">
                  <Skeleton className="h-16 w-full" />
                  <Skeleton className="h-16 w-full" />
                </div>
              )}

              {!loadingOrders && notConfigured && (
                <p className="text-xs text-muted-foreground italic">
                  Integração Shopify não configurada
                </p>
              )}

              {!loadingOrders && !notConfigured && orders.length === 0 && (
                <p className="text-xs text-muted-foreground italic">
                  Nenhum pedido encontrado
                </p>
              )}

              {!loadingOrders && orders.map((order) => (
                <div
                  key={order.order_number}
                  className="border border-border rounded-lg p-3 space-y-2 bg-muted/30"
                >
                  {/* Order header */}
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-foreground">
                      #{order.order_number}
                    </span>
                    {getStatusBadge(order.status)}
                  </div>

                  {/* Items */}
                  <div className="space-y-1">
                    {order.items.map((item, idx) => (
                      <div key={idx} className="flex items-start gap-1.5">
                        <Package className="w-3 h-3 text-muted-foreground mt-0.5 shrink-0" />
                        <p className="text-xs text-foreground leading-tight">
                          {item.name}
                          {item.variant && <span className="text-muted-foreground"> ({item.variant})</span>}
                          {' '}×{item.quantity}
                        </p>
                      </div>
                    ))}
                  </div>

                  {/* Total + financial */}
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-foreground">
                      {order.currency} {order.total_price}
                    </span>
                    {getFinancialBadge(order.financial_status)}
                  </div>

                  {/* Tracking */}
                  {order.tracking_number && (
                    <div className="pt-1 border-t border-border">
                      {order.tracking_url ? (
                        <a
                          href={order.tracking_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-primary hover:underline flex items-center gap-1"
                        >
                          <ExternalLink className="w-3 h-3" />
                          {order.tracking_number}
                          {order.tracking_company && (
                            <span className="text-muted-foreground">via {order.tracking_company}</span>
                          )}
                        </a>
                      ) : (
                        <p className="text-xs text-muted-foreground">
                          Rastreio: {order.tracking_number}
                          {order.tracking_company && ` via ${order.tracking_company}`}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
