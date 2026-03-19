import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useStore } from '@/contexts/StoreContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { toast } from 'sonner';
import { Bot, Key, Brain, Zap, Loader2, CheckCircle2, XCircle, Eye, EyeOff, Store } from 'lucide-react';

interface AISettings {
  openai_api_key: string | null;
  ai_model: string | null;
  ai_system_prompt: string | null;
  ai_response_delay: number | null;
  ai_is_active: boolean | null;
  ai_provider: string | null;
  anthropic_api_key: string | null;
}

export function AIAgentPage() {
  const queryClient = useQueryClient();
  const { currentStore } = useStore();
  const [showApiKey, setShowApiKey] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<'success' | 'error' | null>(null);
  
  // Form state
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState('gpt-4o');
  const [systemPrompt, setSystemPrompt] = useState('');
  const [responseDelay, setResponseDelay] = useState(2);
  const [isActive, setIsActive] = useState(false);
  const [aiProvider, setAiProvider] = useState('openai');
  const [isActive, setIsActive] = useState(false);

  // Fetch current settings filtered by store
  const { data: settings, isLoading } = useQuery({
    queryKey: ['ai-settings', currentStore?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('settings')
        .select('openai_api_key, ai_model, ai_system_prompt, ai_response_delay, ai_is_active, ai_provider, anthropic_api_key')
        .eq('store_id', currentStore!.id)
        .maybeSingle();
      
      if (error) throw error;
      return data as AISettings | null;
    },
    enabled: !!currentStore,
  });

  // Populate form when settings load
  useEffect(() => {
    if (settings) {
      setApiKey(settings.openai_api_key || '');
      setModel(settings.ai_model || 'gpt-4o');
      setSystemPrompt(settings.ai_system_prompt || '');
      setResponseDelay(settings.ai_response_delay || 2);
      setIsActive(settings.ai_is_active || false);
    } else {
      // Reset form when no settings (new store)
      setApiKey('');
      setModel('gpt-4o');
      setSystemPrompt('');
      setResponseDelay(2);
      setIsActive(false);
    }
  }, [settings, currentStore?.id]);

  // Save mutation with store isolation
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
        openai_api_key: apiKey || null,
        ai_model: model,
        ai_system_prompt: systemPrompt || null,
        ai_response_delay: responseDelay,
        ai_is_active: isActive,
        updated_at: new Date().toISOString(),
      };

      if (existing) {
        const { error } = await supabase
          .from('settings')
          .update(settingsData)
          .eq('id', existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('settings')
          .insert(settingsData);
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

  // Test connection
  const handleTestConnection = async () => {
    if (!apiKey) {
      toast.error('Insira a API Key primeiro');
      return;
    }

    setIsTesting(true);
    setTestResult(null);

    try {
      const response = await fetch('https://api.openai.com/v1/models', {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
        },
      });

      if (response.ok) {
        setTestResult('success');
        toast.success('Conexão bem-sucedida!');
      } else {
        setTestResult('error');
        toast.error('Falha na conexão. Verifique sua API Key.');
      }
    } catch (error) {
      setTestResult('error');
      toast.error('Erro ao testar conexão');
    } finally {
      setIsTesting(false);
    }
  };

  // Show message when no store is selected
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

        {/* Card 1: Conexão */}
        <Card>
          <CardHeader className="pb-4">
            <div className="flex items-center gap-2">
              <Key className="w-5 h-5 text-primary" />
              <CardTitle className="text-lg">Conexão OpenAI</CardTitle>
            </div>
            <CardDescription>
              Configure sua chave de API e modelo preferido
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="api-key">API Key</Label>
              <div className="relative">
                <Input
                  id="api-key"
                  type={showApiKey ? 'text' : 'password'}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="sk-..."
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowApiKey(!showApiKey)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="model">Modelo</Label>
              <Select value={model} onValueChange={setModel}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o modelo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="gpt-4o">GPT-4o (Recomendado)</SelectItem>
                  <SelectItem value="gpt-4o-mini">GPT-4o Mini</SelectItem>
                  <SelectItem value="gpt-3.5-turbo">GPT-3.5 Turbo</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Button
              variant="outline"
              onClick={handleTestConnection}
              disabled={isTesting || !apiKey}
              className="mt-2"
            >
              {isTesting ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : testResult === 'success' ? (
                <CheckCircle2 className="w-4 h-4 mr-2 text-green-500" />
              ) : testResult === 'error' ? (
                <XCircle className="w-4 h-4 mr-2 text-destructive" />
              ) : (
                <Zap className="w-4 h-4 mr-2" />
              )}
              Testar Conexão
            </Button>
          </CardContent>
        </Card>

        {/* Card 2: Personalidade */}
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

        {/* Card 3: Status */}
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
      </div>
    </div>
  );
}
