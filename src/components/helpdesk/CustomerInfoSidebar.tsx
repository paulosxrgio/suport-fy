import { useState, useEffect } from 'react';
import { ChevronRight, Mail, User, Calendar, ShoppingBag, ExternalLink, Package, Truck, CreditCard, Hash } from 'lucide-react';
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
  order_number: string;
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

interface ShopifyCustomer {
  name: string;
  numberOfOrders: string;
  totalSpent: { amount: string; currencyCode: string };
}

interface CustomerInfoSidebarProps {
  ticket: Ticket | null;
  isOpen: boolean;
  onToggle: () => void;
}

function getFulfillmentBadge(status: string) {
  const s = status?.toUpperCase() || '';
  if (s === 'FULFILLED' || s === 'DELIVERED')
    return <Badge className="bg-green-500/15 text-green-700 border-green-500/30 text-[10px] px-1.5 py-0">Entregue</Badge>;
  if (s === 'IN_TRANSIT' || s === 'SHIPPED')
    return <Badge className="bg-blue-500/15 text-blue-700 border-blue-500/30 text-[10px] px-1.5 py-0">Enviado</Badge>;
  if (s === 'CANCELLED')
    return <Badge className="bg-red-500/15 text-red-700 border-red-500/30 text-[10px] px-1.5 py-0">Cancelado</Badge>;
  return <Badge className="bg-yellow-500/15 text-yellow-700 border-yellow-500/30 text-[10px] px-1.5 py-0">Pendente</Badge>;
}

function getFinancialBadge(status: string) {
  const s = status?.toUpperCase() || '';
  if (s === 'PAID')
    return <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-green-700 border-green-500/30">Pago</Badge>;
  if (s === 'REFUNDED')
    return <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-muted-foreground border-border">Reembolsado</Badge>;
  if (s === 'PARTIALLY_REFUNDED')
    return <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-orange-700 border-orange-500/30">Parcial</Badge>;
  if (s === 'PENDING')
    return <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-yellow-700 border-yellow-500/30">Pendente</Badge>;
  return <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-muted-foreground">{status}</Badge>;
}

export function CustomerInfoSidebar({ ticket, isOpen, onToggle }: CustomerInfoSidebarProps) {
  const [orders, setOrders] = useState<ShopifyOrder[]>([]);
  const [customer, setCustomer] = useState<ShopifyCustomer | null>(null);
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
          setCustomer(null);
        } else {
          setOrders(data?.orders || []);
          setCustomer(data?.customer || null);
        }
      } catch (err) {
        console.error('Error fetching Shopify orders:', err);
        setOrders([]);
        setCustomer(null);
      } finally {
        setLoadingOrders(false);
      }
    };

    fetchOrders();
  }, [ticket?.id]);

  if (!ticket) return null;

  return (
    <>
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
        <ChevronRight className={cn('w-4 h-4 transition-transform', isOpen && 'rotate-180')} />
      </Button>

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
            {/* Avatar + Name */}
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
                <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">E-mail</p>
                <p className="text-sm text-foreground break-all">{ticket.customer_email}</p>
              </div>
            </div>

            {/* Created At */}
            <div className="flex items-start gap-3">
              <Calendar className="w-4 h-4 text-muted-foreground mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Ticket criado</p>
                <p className="text-sm text-foreground">
                  {format(new Date(ticket.created_at), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
                </p>
                <p className="text-xs text-muted-foreground">{format(new Date(ticket.created_at), 'HH:mm')}</p>
              </div>
            </div>

            <Separator />

            {/* Shopify Customer Info */}
            {customer && (
              <div className="flex items-start gap-3">
                <ShoppingBag className="w-4 h-4 text-muted-foreground mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Cliente Shopify</p>
                  <p className="text-sm font-medium text-foreground">{customer.name || ticket.customer_name || '—'}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs text-muted-foreground">
                      {customer.numberOfOrders} pedido{customer.numberOfOrders !== '1' ? 's' : ''}
                    </span>
                    <span className="text-xs text-muted-foreground">•</span>
                    <span className="text-xs text-muted-foreground">
                      {customer.totalSpent?.currencyCode} {customer.totalSpent?.amount}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {customer && <Separator />}

            {/* Orders Section */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Hash className="w-4 h-4 text-muted-foreground" />
                <p className="text-xs text-muted-foreground uppercase tracking-wider">Pedidos Shopify</p>
              </div>

              {loadingOrders && (
                <div className="space-y-2">
                  <Skeleton className="h-20 w-full" />
                  <Skeleton className="h-20 w-full" />
                </div>
              )}

              {!loadingOrders && notConfigured && (
                <p className="text-xs text-muted-foreground italic">Integração Shopify não configurada</p>
              )}

              {!loadingOrders && !notConfigured && orders.length === 0 && (
                <p className="text-xs text-muted-foreground italic">Nenhum pedido encontrado</p>
              )}

              {!loadingOrders && orders.map((order, orderIdx) => (
                <div
                  key={orderIdx}
                  className="border border-border rounded-lg p-3 space-y-2.5 bg-muted/30"
                >
                  {/* Header: order number + fulfillment badge */}
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-foreground">{order.order_number}</span>
                    {getFulfillmentBadge(order.status)}
                  </div>

                  {/* Date */}
                  <p className="text-[11px] text-muted-foreground">
                    {order.created_at
                      ? format(new Date(order.created_at), "dd MMM yyyy", { locale: ptBR })
                      : '—'}
                  </p>

                  {/* Items */}
                  {order.items.length > 0 && (
                    <div className="space-y-1 pt-0.5">
                      {order.items.map((item, idx) => (
                        <div key={idx} className="flex items-start gap-1.5">
                          <Package className="w-3 h-3 text-muted-foreground mt-0.5 shrink-0" />
                          <p className="text-xs text-foreground leading-tight">
                            {item.name}
                            {item.variant && (
                              <span className="text-muted-foreground"> ({item.variant})</span>
                            )}
                            <span className="text-muted-foreground"> ×{item.quantity}</span>
                          </p>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Payment: total + financial badge */}
                  <div className="flex items-center justify-between pt-1 border-t border-border">
                    <div className="flex items-center gap-1.5">
                      <CreditCard className="w-3 h-3 text-muted-foreground" />
                      <span className="text-xs font-medium text-foreground">
                        {order.currency} {order.total_price}
                      </span>
                    </div>
                    {getFinancialBadge(order.financial_status)}
                  </div>

                  {/* Tracking */}
                  <div className="pt-1 border-t border-border">
                    {order.tracking_number ? (
                      <div className="flex items-start gap-1.5">
                        <Truck className="w-3 h-3 text-muted-foreground mt-0.5 shrink-0" />
                        <div className="text-xs">
                          {order.tracking_company && (
                            <span className="text-muted-foreground">{order.tracking_company} · </span>
                          )}
                          {order.tracking_url ? (
                            <a
                              href={order.tracking_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-primary hover:underline inline-flex items-center gap-0.5"
                            >
                              {order.tracking_number}
                              <ExternalLink className="w-2.5 h-2.5" />
                            </a>
                          ) : (
                            <span className="text-foreground">{order.tracking_number}</span>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5">
                        <Truck className="w-3 h-3 text-muted-foreground" />
                        <span className="text-xs text-muted-foreground italic">Rastreamento não disponível</span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
