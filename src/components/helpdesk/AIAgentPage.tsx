import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useStore } from '@/contexts/StoreContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { toast } from 'sonner';
import { Bot, Brain, Loader2, Store, BarChart3, Lightbulb, ChevronDown, Check, X, Sparkles, AlertTriangle, TrendingUp, AlertOctagon, Eye, Zap } from 'lucide-react';

interface AISettings {
  ai_system_prompt: string | null;
  ai_response_delay: number | null;
  ai_is_active: boolean | null;
  prompt_version: number | null;
}

export function AIAgentPage() {
  const queryClient = useQueryClient();
  const { currentStore } = useStore();
  
  const [systemPrompt, setSystemPrompt] = useState('');
  const [responseDelay, setResponseDelay] = useState(2);
  const [isActive, setIsActive] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isForcingBrain, setIsForcingBrain] = useState(false);

  const { data: settings, isLoading } = useQuery({
    queryKey: ['ai-settings', currentStore?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('settings')
        .select('ai_system_prompt, ai_response_delay, ai_is_active, prompt_version')
        .eq('store_id', currentStore!.id)
        .maybeSingle();
      if (error) throw error;
      return data as AISettings | null;
    },
    enabled: !!currentStore,
  });

  // Quality logs
  const { data: qualityData } = useQuery({
    queryKey: ['quality-log', currentStore?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('response_quality_log')
        .select('score, issues, positive_aspects, created_at')
        .eq('store_id', currentStore!.id)
        .order('created_at', { ascending: false })
        .limit(50);
      return data || [];
    },
    enabled: !!currentStore,
  });

  // Prompt suggestions
  const { data: suggestions, refetch: refetchSuggestions } = useQuery({
    queryKey: ['prompt-suggestions', currentStore?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('prompt_suggestions')
        .select('*')
        .eq('store_id', currentStore!.id)
        .order('created_at', { ascending: false })
        .limit(5);
      return data || [];
    },
    enabled: !!currentStore,
  });

  // Brain report (latest)
  const { data: brainReport, refetch: refetchBrain } = useQuery({
    queryKey: ['brain-report', currentStore?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('brain_reports')
        .select('*')
        .eq('store_id', currentStore!.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      return data;
    },
    enabled: !!currentStore,
  });

  const forceBrainAnalysis = async () => {
    if (!currentStore) return;
    setIsForcingBrain(true);
    try {
      const { error } = await supabase.functions.invoke('supervisor-agent', {
        body: { store_id: currentStore.id, force: true },
      });
      if (error) throw error;
      toast.success('Análise concluída!');
      refetchBrain();
    } catch (err) {
      console.error('Brain force analysis error:', err);
      toast.error('Erro ao executar análise.');
    } finally {
      setIsForcingBrain(false);
    }
  };

  useEffect(() => {
    if (settings) {
      setSystemPrompt(settings.ai_system_prompt || '');
      setResponseDelay(settings.ai_response_delay || 2);
      setIsActive(settings.ai_is_active || false);
    } else {
      setSystemPrompt('');
      setResponseDelay(2);
      setIsActive(false);
    }
  }, [settings, currentStore?.id]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!currentStore) throw new Error('Nenhuma loja selecionada');
      const { data: existing } = await supabase
        .from('settings')
        .select('id')
        .eq('store_id', currentStore.id)
        .maybeSingle();

      const settingsData = {
        store_id: currentStore.id,
        ai_system_prompt: systemPrompt || null,
        ai_response_delay: responseDelay,
        ai_is_active: isActive,
        updated_at: new Date().toISOString(),
      };

      if (existing) {
        const { error } = await supabase.from('settings').update(settingsData).eq('id', existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('settings').insert(settingsData);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai-settings', currentStore?.id] });
      toast.success('Configurações salvas com sucesso!');
    },
    onError: (error) => {
      console.error('Error saving settings:', error);
      toast.error('Erro ao salvar configurações');
    },
  });

  // Computed quality metrics
  const avgScore = qualityData?.length
    ? Math.round(qualityData.reduce((a, l) => a + (l.score || 0), 0) / qualityData.length)
    : null;

  const topIssues = qualityData?.length
    ? Object.entries(
        qualityData.flatMap(l => (l.issues as string[]) || []).reduce((acc: Record<string, number>, issue: string) => {
          acc[issue] = (acc[issue] || 0) + 1;
          return acc;
        }, {})
      ).sort((a, b) => b[1] - a[1]).slice(0, 5)
    : [];

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-green-500';
    if (score >= 60) return 'text-yellow-500';
    return 'text-red-500';
  };

  const getScoreBg = (score: number) => {
    if (score >= 80) return 'bg-green-500/10 border-green-500/30';
    if (score >= 60) return 'bg-yellow-500/10 border-yellow-500/30';
    return 'bg-red-500/10 border-red-500/30';
  };

  const applySuggestion = async (suggestion: any) => {
    try {
      await supabase.from('settings')
        .update({
          ai_system_prompt: suggestion.suggested_prompt,
          prompt_version: (settings?.prompt_version || 1) + 1,
        })
        .eq('store_id', currentStore!.id);

      await supabase.from('prompt_suggestions')
        .update({ status: 'applied', applied_at: new Date().toISOString() })
        .eq('id', suggestion.id);

      toast.success('Prompt atualizado com sucesso!');
      queryClient.invalidateQueries({ queryKey: ['ai-settings', currentStore?.id] });
      refetchSuggestions();
    } catch (error) {
      console.error('Error applying suggestion:', error);
      toast.error('Erro ao aplicar sugestão');
    }
  };

  const rejectSuggestion = async (id: string) => {
    try {
      await supabase.from('prompt_suggestions')
        .update({ status: 'rejected' })
        .eq('id', id);
      refetchSuggestions();
      toast.success('Sugestão rejeitada');
    } catch (error) {
      toast.error('Erro ao rejeitar sugestão');
    }
  };

  const generateSuggestionNow = async () => {
    setIsGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke('optimize-prompt');
      if (error) throw error;
      toast.success(`Otimização concluída! ${data?.stores_optimized || 0} loja(s) otimizada(s).`);
      refetchSuggestions();
    } catch (error) {
      console.error('Error generating suggestion:', error);
      toast.error('Erro ao gerar sugestão. Tente novamente.');
    } finally {
      setIsGenerating(false);
    }
  };

  if (!currentStore) {
    return (
      <div className="flex-1 flex items-center justify-center bg-background">
        <div className="text-center text-muted-foreground">
          <Store className="w-12 h-12 mx-auto mb-4 opacity-30" />
          <p>Selecione uma loja para configurar o Agente de IA</p>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto bg-background">
      <div className="max-w-4xl mx-auto p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
            <Bot className="w-7 h-7 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Agente de IA</h1>
            <p className="text-muted-foreground">
              Configurando para: <span className="font-medium text-foreground">{currentStore.name}</span>
            </p>
          </div>
        </div>

        {/* Card 1: Personalidade */}
        <Card>
          <CardHeader className="pb-4">
            <div className="flex items-center gap-2">
              <Brain className="w-5 h-5 text-primary" />
              <CardTitle className="text-lg">Personalidade & Comportamento</CardTitle>
            </div>
            <CardDescription>
              Defina como o agente deve se comportar e responder
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="system-prompt">Instruções do Sistema (System Prompt)</Label>
              <Textarea
                id="system-prompt"
                value={systemPrompt}
                onChange={(e) => setSystemPrompt(e.target.value)}
                placeholder="Você é um especialista de suporte útil e educado. Responda de forma clara e objetiva, sempre mantendo um tom amigável..."
                className="min-h-[200px] resize-y"
              />
              <p className="text-xs text-muted-foreground">
                Defina a personalidade, regras e comportamentos do agente aqui.
                {settings?.prompt_version && (
                  <span className="ml-2 text-primary">Versão atual: v{settings.prompt_version}</span>
                )}
              </p>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Label>Tempo de Espera (Delay)</Label>
                <span className="text-sm font-medium text-primary">
                  {responseDelay} {responseDelay === 1 ? 'minuto' : 'minutos'}
                </span>
              </div>
              <Slider
                value={[responseDelay]}
                onValueChange={(value) => setResponseDelay(value[0])}
                min={0}
                max={10}
                step={1}
                className="w-full"
              />
              <p className="text-xs text-muted-foreground">
                Tempo de espera simulado para a resposta parecer humana. Use 0 para resposta imediata.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Card 2: Status */}
        <Card className={isActive ? 'border-primary/50 bg-primary/5' : ''}>
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Bot className="w-5 h-5 text-primary" />
                <CardTitle className="text-lg">Status do Agente</CardTitle>
              </div>
              <Switch
                checked={isActive}
                onCheckedChange={setIsActive}
                className="scale-125"
              />
            </div>
            <CardDescription>
              {isActive 
                ? 'O agente está ativo e responderá automaticamente aos tickets' 
                : 'O agente está desativado. Ative para começar a automação.'
              }
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className={`flex items-center gap-3 p-4 rounded-lg ${
              isActive ? 'bg-primary/10 text-primary' : 'bg-muted'
            }`}>
              <div className={`w-3 h-3 rounded-full ${isActive ? 'bg-primary animate-pulse' : 'bg-muted-foreground'}`} />
              <span className="font-medium">
                {isActive ? 'Agente Autônomo Ativo' : 'Agente Desativado'}
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Save Button */}
        <div className="flex justify-end pt-4">
          <Button
            size="lg"
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending}
          >
            {saveMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Salvar Configurações
          </Button>
        </div>

        {/* Card 3: Qualidade das Respostas */}
        <Card>
          <CardHeader className="pb-4">
            <div className="flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-primary" />
              <CardTitle className="text-lg">Qualidade das Respostas</CardTitle>
            </div>
            <CardDescription>
              Métricas de qualidade das respostas automáticas da IA
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!qualityData || qualityData.length < 10 ? (
              <div className="flex items-center gap-3 p-6 rounded-lg bg-muted text-muted-foreground text-center justify-center">
                <AlertTriangle className="w-5 h-5" />
                <span>Dados insuficientes. São necessárias pelo menos 10 respostas analisadas para exibir métricas.</span>
              </div>
            ) : (
              <div className="space-y-6">
                {/* Score and count cards */}
                <div className="grid grid-cols-2 gap-4">
                  <div className={`p-6 rounded-xl border ${getScoreBg(avgScore!)}`}>
                    <p className="text-sm text-muted-foreground mb-1">Score Médio</p>
                    <p className={`text-4xl font-bold ${getScoreColor(avgScore!)}`}>
                      {avgScore}<span className="text-lg text-muted-foreground">/100</span>
                    </p>
                  </div>
                  <div className="p-6 rounded-xl border bg-muted/50">
                    <p className="text-sm text-muted-foreground mb-1">Respostas Analisadas</p>
                    <p className="text-4xl font-bold text-foreground">{qualityData.length}</p>
                  </div>
                </div>

                {/* Top issues */}
                {topIssues.length > 0 && (
                  <div className="space-y-3">
                    <p className="text-sm font-medium text-muted-foreground">Problemas mais recorrentes</p>
                    <div className="space-y-2">
                      {topIssues.map(([issue, count], i) => (
                        <div key={i} className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                          <span className="text-sm">{issue}</span>
                          <Badge variant="secondary">{count}x</Badge>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Card 4: Sugestões de Melhoria */}
        <Card>
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Lightbulb className="w-5 h-5 text-primary" />
                <CardTitle className="text-lg">Sugestões de Melhoria</CardTitle>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={generateSuggestionNow}
                disabled={isGenerating}
              >
                {isGenerating ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Sparkles className="w-4 h-4 mr-2" />
                )}
                Gerar sugestão agora
              </Button>
            </div>
            <CardDescription>
              Sugestões automáticas de melhoria do prompt baseadas na análise de qualidade
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!suggestions || suggestions.length === 0 ? (
              <div className="flex items-center gap-3 p-6 rounded-lg bg-muted text-muted-foreground text-center justify-center">
                <Lightbulb className="w-5 h-5" />
                <span>Nenhuma sugestão disponível. Clique em "Gerar sugestão agora" ou aguarde a análise automática diária.</span>
              </div>
            ) : (
              <div className="space-y-4">
                {suggestions.map((suggestion) => (
                  <SuggestionCard
                    key={suggestion.id}
                    suggestion={suggestion}
                    onApply={applySuggestion}
                    onReject={rejectSuggestion}
                  />
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function SuggestionCard({ suggestion, onApply, onReject }: {
  suggestion: any;
  onApply: (s: any) => void;
  onReject: (id: string) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);

  const statusBadge = {
    pending: { label: 'Pendente', variant: 'outline' as const, className: 'border-yellow-500 text-yellow-500' },
    applied: { label: 'Aplicado', variant: 'outline' as const, className: 'border-green-500 text-green-500' },
    rejected: { label: 'Rejeitado', variant: 'outline' as const, className: 'border-muted-foreground text-muted-foreground' },
  };

  const badge = statusBadge[suggestion.status as keyof typeof statusBadge] || statusBadge.pending;
  const issuesFound = (suggestion.issues_found as string[]) || [];

  return (
    <div className="border rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Badge variant={badge.variant} className={badge.className}>
            {badge.label}
          </Badge>
          <span className="text-xs text-muted-foreground">
            {new Date(suggestion.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>
        {suggestion.status === 'pending' && (
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => onReject(suggestion.id)}>
              <X className="w-4 h-4 mr-1" />
              Rejeitar
            </Button>
            <Button size="sm" onClick={() => onApply(suggestion)}>
              <Check className="w-4 h-4 mr-1" />
              Aplicar prompt
            </Button>
          </div>
        )}
      </div>

      {/* Metrics */}
      <div className="flex items-center gap-4 text-sm">
        <div className="flex items-center gap-1 text-muted-foreground">
          <TrendingUp className="w-4 h-4" />
          Score médio antes: <span className="font-medium text-foreground">{suggestion.avg_score_before}/100</span>
        </div>
        <div className="text-muted-foreground">
          Baseado em <span className="font-medium text-foreground">{suggestion.responses_analyzed}</span> respostas
        </div>
      </div>

      {/* Reason */}
      {suggestion.reason && (
        <p className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">Melhoria esperada:</span> {suggestion.reason}
        </p>
      )}

      {/* Issues / changes */}
      {issuesFound.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs font-medium text-muted-foreground">Mudanças feitas:</p>
          <ul className="text-sm space-y-1">
            {issuesFound.map((issue, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="text-primary mt-0.5">•</span>
                <span>{issue}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Expandable prompt */}
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CollapsibleTrigger asChild>
          <Button variant="ghost" size="sm" className="w-full justify-between">
            <span className="text-xs">Ver prompt sugerido completo</span>
            <ChevronDown className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <pre className="mt-2 p-4 rounded-lg bg-muted text-xs whitespace-pre-wrap max-h-[300px] overflow-y-auto">
            {suggestion.suggested_prompt}
          </pre>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
