import { useState } from 'react';
import { useRequests, useResolveRequest } from '@/hooks/useRequests';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CheckCircle, Clock, Package, MapPin, Repeat, XCircle, Filter } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { format } from 'date-fns';

const TYPE_CONFIG: Record<string, { label: string; icon: typeof Package; color: string }> = {
  edition_change: { label: 'Troca de Edição', icon: Repeat, color: 'bg-blue-100 text-blue-700' },
  address_change: { label: 'Alteração de Endereço', icon: MapPin, color: 'bg-amber-100 text-amber-700' },
  model_change: { label: 'Troca de Modelo', icon: Package, color: 'bg-purple-100 text-purple-700' },
  cancellation: { label: 'Cancelamento', icon: XCircle, color: 'bg-red-100 text-red-700' },
};

const STATUS_FILTERS = [
  { id: 'all', label: 'Todas' },
  { id: 'pending', label: 'Pendentes' },
  { id: 'resolved', label: 'Resolvidas' },
];

const TYPE_FILTERS = [
  { id: 'all', label: 'Todos os Tipos' },
  { id: 'edition_change', label: 'Edição' },
  { id: 'address_change', label: 'Endereço' },
  { id: 'model_change', label: 'Modelo' },
  { id: 'cancellation', label: 'Cancelamento' },
];

export function RequestsPage() {
  const [statusFilter, setStatusFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const { data: requests, isLoading } = useRequests(statusFilter, typeFilter);
  const resolveRequest = useResolveRequest();

  const handleResolve = async (id: string) => {
    try {
      await resolveRequest.mutateAsync(id);
      toast.success('Solicitação marcada como resolvida');
    } catch {
      toast.error('Erro ao resolver solicitação');
    }
  };

  const pendingCount = requests?.filter(r => r.status === 'pending').length || 0;

  return (
    <div className="flex-1 flex flex-col bg-background overflow-hidden">
      {/* Header */}
      <div className="px-8 pt-8 pb-4">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-semibold text-foreground">Solicitações</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Solicitações detectadas automaticamente pela IA
            </p>
          </div>
          {pendingCount > 0 && (
            <Badge className="bg-warning/15 text-warning border-warning/20 text-sm px-3 py-1">
              <Clock className="w-3.5 h-3.5 mr-1.5" />
              {pendingCount} pendente{pendingCount !== 1 ? 's' : ''}
            </Badge>
          )}
        </div>

        {/* Filters */}
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-muted-foreground" />
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Status:</span>
            <div className="flex gap-1">
              {STATUS_FILTERS.map((f) => (
                <button
                  key={f.id}
                  onClick={() => setStatusFilter(f.id)}
                  className={cn(
                    'px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-150',
                    statusFilter === f.id
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-muted-foreground hover:bg-muted/80'
                  )}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Tipo:</span>
            <div className="flex gap-1">
              {TYPE_FILTERS.map((f) => (
                <button
                  key={f.id}
                  onClick={() => setTypeFilter(f.id)}
                  className={cn(
                    'px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-150',
                    typeFilter === f.id
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-muted-foreground hover:bg-muted/80'
                  )}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto px-8 pb-8">
        {isLoading ? (
          <div className="space-y-3 mt-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-24 rounded-xl bg-muted animate-pulse" />
            ))}
          </div>
        ) : !requests || requests.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
              <CheckCircle className="w-8 h-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-medium text-foreground mb-1">Nenhuma solicitação encontrada</h3>
            <p className="text-sm text-muted-foreground max-w-sm">
              As solicitações dos clientes aparecerão aqui quando forem detectadas automaticamente pela IA.
            </p>
          </div>
        ) : (
          <div className="space-y-2 mt-4">
            {requests.map((req, index) => {
              const typeConfig = TYPE_CONFIG[req.type] || {
                label: req.type,
                icon: Package,
                color: 'bg-muted text-muted-foreground',
              };
              const TypeIcon = typeConfig.icon;
              const isPending = req.status === 'pending';

              return (
                <div
                  key={req.id}
                  className={cn(
                    'rounded-xl border border-border bg-card p-5 transition-all duration-150',
                    'hover:shadow-sm',
                    isPending && 'border-l-[3px] border-l-warning'
                  )}
                  style={{
                    animation: `fade-in 200ms ease-out ${index * 30}ms both`,
                  }}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2.5 mb-2">
                        <Badge className={cn('text-xs font-medium gap-1', typeConfig.color)}>
                          <TypeIcon className="w-3 h-3" />
                          {typeConfig.label}
                        </Badge>
                        <Badge
                          variant="outline"
                          className={cn(
                            'text-xs',
                            isPending
                              ? 'border-warning/30 text-warning bg-warning/5'
                              : 'border-success/30 text-success bg-success/5'
                          )}
                        >
                          {isPending ? 'Pendente' : 'Resolvida'}
                        </Badge>
                      </div>

                      <p className="text-sm text-foreground font-medium mb-1">{req.description}</p>

                      <div className="flex items-center gap-4 text-xs text-muted-foreground">
                        <span className="font-medium">{req.customer_name || req.customer_email}</span>
                        {req.customer_name && req.customer_email && (
                          <span>{req.customer_email}</span>
                        )}
                        <span>{format(new Date(req.created_at), 'dd/MM/yyyy HH:mm')}</span>
                      </div>

                      {/* Details */}
                      {req.details && Object.keys(req.details).length > 0 && (
                        <div className="mt-3 flex flex-wrap gap-2">
                          {req.details.order_number && (
                            <span className="text-xs bg-muted px-2 py-1 rounded-md text-muted-foreground">
                              Pedido: {req.details.order_number}
                            </span>
                          )}
                          {req.details.from && (
                            <span className="text-xs bg-muted px-2 py-1 rounded-md text-muted-foreground">
                              De: {req.details.from}
                            </span>
                          )}
                          {req.details.to && (
                            <span className="text-xs bg-muted px-2 py-1 rounded-md text-muted-foreground">
                              Para: {req.details.to}
                            </span>
                          )}
                          {req.details.new_address && (
                            <span className="text-xs bg-muted px-2 py-1 rounded-md text-muted-foreground">
                              Novo endereço: {req.details.new_address}
                            </span>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Resolve button */}
                    {isPending && (
                      <Button
                        size="sm"
                        onClick={() => handleResolve(req.id)}
                        disabled={resolveRequest.isPending}
                        className="bg-success hover:bg-success/90 text-white shrink-0"
                      >
                        <CheckCircle className="w-4 h-4 mr-1.5" />
                        Resolver
                      </Button>
                    )}

                    {!isPending && req.resolved_at && (
                      <span className="text-xs text-muted-foreground shrink-0">
                        Resolvida em {format(new Date(req.resolved_at), 'dd/MM/yyyy')}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
