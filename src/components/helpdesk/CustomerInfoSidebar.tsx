import { useState, useEffect } from 'react';
import { ChevronRight, Mail, User, Calendar, ShoppingBag, ExternalLink, Package, Truck, CreditCard } from 'lucide-react';
import { format } from 'date-fns';
import { enUS } from 'date-fns/locale';
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
    return <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px] px-1.5 py-0">Delivered</Badge>;
  if (s === 'IN_TRANSIT' || s === 'SHIPPED')
    return <Badge className="bg-sky-50 text-sky-700 border-sky-200 text-[10px] px-1.5 py-0">Shipped</Badge>;
  if (s === 'CANCELLED')
    return <Badge className="bg-rose-50 text-rose-700 border-rose-200 text-[10px] px-1.5 py-0">Cancelled</Badge>;
  return <Badge className="bg-amber-50 text-amber-700 border-amber-200 text-[10px] px-1.5 py-0">Pending</Badge>;
}

function getFinancialBadge(status: string) {
  const s = status?.toUpperCase() || '';
  if (s === 'PAID')
    return <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-emerald-700 border-emerald-200">Paid</Badge>;
  if (s === 'REFUNDED')
    return <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-muted-foreground border-border">Refunded</Badge>;
  if (s === 'PARTIALLY_REFUNDED')
    return <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-orange-700 border-orange-200">Partial</Badge>;
  if (s === 'PENDING')
    return <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-amber-700 border-amber-200">Pending</Badge>;
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
          'absolute right-0 top-1/2 -translate-y-1/2 z-10 bg-card border border-border',
          'rounded-l-lg rounded-r-none h-12 w-6 shadow-card',
          'transition-all duration-150',
          isOpen && 'right-[280px]'
        )}
      >
        <ChevronRight className={cn('w-4 h-4 transition-transform duration-150', isOpen && 'rotate-180')} />
      </Button>

      <div
        className={cn(
          'w-[280px] border-l border-border bg-card transition-all duration-200',
          'overflow-y-auto scrollbar-thin',
          isOpen ? 'translate-x-0' : 'translate-x-full absolute right-0 h-full'
        )}
      >
        <div className="p-5">
          {/* Section label */}
          <p className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground font-medium mb-4">
            Customer Info
          </p>

          <div className="space-y-5">
            {/* Avatar + Name */}
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-full bg-primary/10 flex items-center justify-center">
                <User className="w-5 h-5 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-heading text-lg text-foreground truncate">
                  {ticket.customer_name || 'No name'}
                </p>
                <p className="text-xs text-muted-foreground">Customer</p>
              </div>
            </div>

            <Separator />

            {/* Email */}
            <div className="flex items-start gap-3">
              <Mail className="w-4 h-4 text-muted-foreground mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground font-medium mb-1">Email</p>
                <p className="text-sm text-foreground break-all">{ticket.customer_email}</p>
              </div>
            </div>

            {/* Created At */}
            <div className="flex items-start gap-3">
              <Calendar className="w-4 h-4 text-muted-foreground mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground font-medium mb-1">Ticket created</p>
                <p className="text-sm text-foreground">
                  {format(new Date(ticket.created_at), "MMMM dd, yyyy", { locale: enUS })}
                </p>
                <p className="text-xs text-muted-foreground">{format(new Date(ticket.created_at), 'HH:mm')}</p>
              </div>
            </div>

            {/* Shopify Section */}
            <div className="rounded-[10px] border border-border overflow-hidden shadow-card">
              <div className="flex items-center gap-2 px-3 py-2.5 bg-muted/50 border-b border-border">
                <ShoppingBag className="w-4 h-4 text-muted-foreground" />
                <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-[0.08em]">Shopify</span>
              </div>

              <div className="p-3 space-y-3">
                {loadingOrders && (
                  <div className="space-y-2">
                    <Skeleton className="h-8 w-full" />
                    <Skeleton className="h-20 w-full" />
                  </div>
                )}

                {!loadingOrders && notConfigured && (
                  <p className="text-xs text-muted-foreground italic">Integration not configured</p>
                )}

                {!loadingOrders && !notConfigured && (
                  <>
                    {customer && (
                      <div className="flex items-center gap-2.5 pb-2 border-b border-border">
                        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                          <User className="w-4 h-4 text-primary" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">
                            {customer.name || ticket?.customer_name || '—'}
                          </p>
                          <p className="text-[11px] text-muted-foreground">
                            {customer.numberOfOrders} order{customer.numberOfOrders !== '1' ? 's' : ''} · {customer.totalSpent?.currencyCode} {customer.totalSpent?.amount}
                          </p>
                        </div>
                      </div>
                    )}

                    {orders.length === 0 && (
                      <p className="text-xs text-muted-foreground italic">No orders found</p>
                    )}

                    {orders.map((order, orderIdx) => (
                      <div key={orderIdx} className="space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5">
                            <span className="text-sm font-semibold text-foreground">{order.order_number}</span>
                            <span className="text-[11px] text-muted-foreground">
                              · {order.created_at ? format(new Date(order.created_at), "MMM dd, yyyy", { locale: enUS }) : '—'}
                            </span>
                          </div>
                          {getFulfillmentBadge(order.status)}
                        </div>

                        {order.items.length > 0 && (
                          <div className="space-y-1 pl-0.5">
                            {order.items.map((item, idx) => (
                              <div key={idx} className="flex items-start gap-1.5">
                                <Package className="w-3 h-3 text-muted-foreground mt-0.5 shrink-0" />
                                <p className="text-xs text-foreground leading-tight">
                                  {item.name}
                                  {item.variant && <span className="text-muted-foreground"> ({item.variant})</span>}
                                  <span className="text-muted-foreground"> ×{item.quantity}</span>
                                </p>
                              </div>
                            ))}
                          </div>
                        )}

                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5">
                            <CreditCard className="w-3 h-3 text-muted-foreground" />
                            <span className="text-xs font-medium text-foreground">
                              {order.currency} {order.total_price}
                            </span>
                          </div>
                          {getFinancialBadge(order.financial_status)}
                        </div>

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
                                  className="text-primary underline hover:no-underline inline-flex items-center gap-0.5"
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
                            <span className="text-xs text-muted-foreground italic">Tracking not available</span>
                          </div>
                        )}

                        {orderIdx < orders.length - 1 && <Separator />}
                      </div>
                    ))}
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
