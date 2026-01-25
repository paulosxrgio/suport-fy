import { useMemo } from 'react';
import { BarChart3, Ticket, CheckCircle, Clock } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Ticket as TicketType } from '@/types/helpdesk';

interface AnalyticsPageProps {
  tickets: TicketType[];
}

export function AnalyticsPage({ tickets }: AnalyticsPageProps) {
  const stats = useMemo(() => {
    const total = tickets.length;
    const open = tickets.filter((t) => t.status === 'open').length;
    const closed = tickets.filter((t) => t.status === 'closed').length;
    
    // Calculate average resolution time (for closed tickets)
    const closedTickets = tickets.filter((t) => t.status === 'closed');
    const avgResolutionTime = closedTickets.length > 0
      ? closedTickets.reduce((acc, t) => {
          const created = new Date(t.created_at).getTime();
          const lastMessage = new Date(t.last_message_at).getTime();
          return acc + (lastMessage - created);
        }, 0) / closedTickets.length
      : 0;
    
    // Convert to hours
    const avgResolutionHours = Math.round(avgResolutionTime / (1000 * 60 * 60));
    
    return {
      total,
      open,
      closed,
      avgResolutionHours,
    };
  }, [tickets]);

  const statCards = [
    {
      title: 'Total de Tickets',
      value: stats.total,
      icon: Ticket,
      color: 'text-primary',
      bgColor: 'bg-primary/10',
    },
    {
      title: 'Tickets Abertos',
      value: stats.open,
      icon: Clock,
      color: 'text-status-open',
      bgColor: 'bg-status-open/10',
    },
    {
      title: 'Tickets Fechados',
      value: stats.closed,
      icon: CheckCircle,
      color: 'text-muted-foreground',
      bgColor: 'bg-muted',
    },
    {
      title: 'Tempo Médio de Resolução',
      value: stats.avgResolutionHours > 0 ? `${stats.avgResolutionHours}h` : 'N/A',
      icon: BarChart3,
      color: 'text-primary',
      bgColor: 'bg-primary/10',
    },
  ];

  return (
    <div className="flex-1 overflow-y-auto bg-background p-6">
      <div className="max-w-5xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Analytics</h1>
          <p className="text-muted-foreground mt-1">
            Visualize métricas e estatísticas do seu help desk.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {statCards.map((stat) => {
            const Icon = stat.icon;
            return (
              <Card key={stat.title}>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    {stat.title}
                  </CardTitle>
                  <div className={`p-2 rounded-lg ${stat.bgColor}`}>
                    <Icon className={`w-4 h-4 ${stat.color}`} />
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-bold text-foreground">{stat.value}</p>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Placeholder for future charts */}
        <Card className="min-h-[300px] flex items-center justify-center">
          <div className="text-center text-muted-foreground">
            <BarChart3 className="w-12 h-12 mx-auto mb-4 opacity-30" />
            <p>Gráficos detalhados em breve</p>
          </div>
        </Card>
      </div>
    </div>
  );
}
