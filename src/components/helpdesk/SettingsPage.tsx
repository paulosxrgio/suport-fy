import { useState, useEffect } from 'react';
import { CopySimple, Check, ArrowSquareOut, Key, EnvelopeSimple, Eye, EyeSlash, SpinnerGap, User, Storefront, ShoppingBag } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useStore } from '@/contexts/StoreContext';

export function SettingsPage() {
  const { currentStore } = useStore();
  const [settingsId, setSettingsId] = useState<string | null>(null);
  const [emailSignature, setEmailSignature] = useState('');
  const [resendApiKey, setResendApiKey] = useState('');
  const [senderName, setSenderName] = useState('');
  const [senderEmail, setSenderEmail] = useState('');
  const [shopifyStoreUrl, setShopifyStoreUrl] = useState('');
  const [shopifyClientId, setShopifyClientId] = useState('');
  const [shopifyClientSecret, setShopifyClientSecret] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);
  const [showShopifyClientId, setShowShopifyClientId] = useState(false);
  const [showShopifyClientSecret, setShowShopifyClientSecret] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isVerifyingShopify, setIsVerifyingShopify] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  const webhookUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/process-inbound-email`;

  useEffect(() => {
    const loadSettings = async () => {
      if (!currentStore) { setIsLoading(false); return; }
      setIsLoading(true);
      const { data } = await supabase.from('settings').select('*').eq('store_id', currentStore.id).maybeSingle();
      if (data) {
        setSettingsId(data.id);
        setEmailSignature(data.email_signature || '');
        setResendApiKey((data as any).resend_api_key || '');
        setSenderName((data as any).sender_name || '');
        setSenderEmail((data as any).sender_email || '');
        setShopifyStoreUrl((data as any).shopify_store_url || '');
        setShopifyClientId((data as any).shopify_client_id || '');
        setShopifyClientSecret((data as any).shopify_client_secret || '');
      } else {
        setSettingsId(null); setEmailSignature(''); setResendApiKey(''); setSenderName(''); setSenderEmail('');
        setShopifyStoreUrl(''); setShopifyClientId(''); setShopifyClientSecret('');
      }
      setIsLoading(false);
    };
    loadSettings();
  }, [currentStore?.id]);

  const handleCopyWebhook = () => {
    navigator.clipboard.writeText(webhookUrl);
    setCopied(true);
    toast.success('URL copiada!');
    setTimeout(() => setCopied(false), 2000);
  };

  const handleVerifyConnection = async () => {
    if (!resendApiKey.trim()) { toast.error('Digite a API Key para verificar'); return; }
    setIsVerifying(true);
    try {
      const { data, error } = await supabase.functions.invoke('verify-resend-key', { body: { apiKey: resendApiKey } });
      if (error) throw error;
      if (data.success) toast.success(data.message || 'Conexão realizada com sucesso!');
      else toast.error(data.error || 'API Key inválida');
    } catch (error) { console.error('Error verifying key:', error); toast.error('Erro ao verificar conexão'); }
    finally { setIsVerifying(false); }
  };

  const handleVerifyShopify = async () => {
    if (!shopifyStoreUrl.trim() || !shopifyClientId.trim() || !shopifyClientSecret.trim()) {
      toast.error('Preencha a URL, Client ID e Client Secret para verificar'); return;
    }
    setIsVerifyingShopify(true);
    try {
      const { data, error } = await supabase.functions.invoke('verify-shopify-token', {
        body: { storeUrl: shopifyStoreUrl, clientId: shopifyClientId, clientSecret: shopifyClientSecret }
      });
      if (error) throw error;
      if (data.success) toast.success(data.message || 'Conexão com Shopify realizada com sucesso!');
      else toast.error(data.error || 'Falha ao conectar com Shopify');
    } catch (error) { console.error('Error verifying Shopify:', error); toast.error('Erro ao verificar conexão com Shopify'); }
    finally { setIsVerifyingShopify(false); }
  };

  const handleSaveSettings = async () => {
    if (!currentStore) { toast.error('Selecione uma loja primeiro'); return; }
    setIsSaving(true);
    try {
      const settingsData = {
        store_id: currentStore.id, email_signature: emailSignature, resend_api_key: resendApiKey,
        resend_api_key_configured: !!resendApiKey, sender_name: senderName, sender_email: senderEmail,
        shopify_store_url: shopifyStoreUrl, shopify_client_id: shopifyClientId, shopify_client_secret: shopifyClientSecret,
        updated_at: new Date().toISOString()
      };
      if (settingsId) {
        const { error } = await supabase.from('settings').update(settingsData as any).eq('id', settingsId);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from('settings').insert(settingsData as any).select('id').single();
        if (error) throw error;
        setSettingsId(data.id);
      }
      toast.success('Configurações salvas!');
    } catch (error) { console.error('Error saving settings:', error); toast.error('Erro ao salvar configurações'); }
    finally { setIsSaving(false); }
  };

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-background">
        <SpinnerGap className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!currentStore) {
    return (
      <div className="flex-1 flex items-center justify-center bg-background">
        <div className="text-center">
          <Storefront className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
          <p className="text-muted-foreground">Selecione uma loja para configurar</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto bg-background p-6">
      <div className="max-w-3xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Configurações</h1>
          <p className="text-muted-foreground mt-1">
            Configure a integração com o Resend para a loja <strong>{currentStore.name}</strong>.
          </p>
        </div>

        <Separator />

        {/* Resend Integration */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Key className="w-5 h-5" /> Integração Resend</CardTitle>
            <CardDescription>Configure sua API Key do Resend para habilitar o envio de e-mails.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="resend-api-key">API Key do Resend</Label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Input id="resend-api-key" type={showApiKey ? 'text' : 'password'} value={resendApiKey} onChange={(e) => setResendApiKey(e.target.value)} placeholder="re_xxxxxxxxxxxxxxxxxxxxxxxxx" className="pr-10 font-mono text-sm rounded-lg h-[38px]" />
                  <Button type="button" variant="ghost" size="icon" className="absolute right-0 top-0 h-full px-3 hover:bg-transparent" onClick={() => setShowApiKey(!showApiKey)}>
                    {showApiKey ? <EyeSlash className="w-4 h-4 text-muted-foreground" /> : <Eye className="w-4 h-4 text-muted-foreground" />}
                  </Button>
                </div>
                <Button variant="outline" onClick={handleVerifyConnection} disabled={isVerifying || !resendApiKey.trim()} className="rounded-lg">
                  {isVerifying ? (<><SpinnerGap className="w-4 h-4 animate-spin" /> Verificando...</>) : 'Verificar Conexão'}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Você pode obter sua API Key em{' '}
                <a href="https://resend.com/api-keys" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">resend.com/api-keys</a>
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Sender Identity */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><User className="w-5 h-5" /> Identidade do E-mail</CardTitle>
            <CardDescription>Configure como seus e-mails aparecerão na caixa de entrada dos clientes.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="sender-name">Nome de Exibição</Label>
              <Input id="sender-name" type="text" value={senderName} onChange={(e) => setSenderName(e.target.value)} placeholder="Ex: Sophia - Ivory Saint" className="rounded-lg h-[38px]" />
              <p className="text-xs text-muted-foreground">Este é o nome que aparecerá na caixa de entrada do seu cliente.</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="sender-email">E-mail de Envio</Label>
              <Input id="sender-email" type="email" value={senderEmail} onChange={(e) => setSenderEmail(e.target.value)} placeholder="Ex: suporte@seudominio.com" className="rounded-lg h-[38px]" />
              <p className="text-xs text-muted-foreground">O e-mail verificado no seu painel do Resend.</p>
            </div>
          </CardContent>
        </Card>

        {/* Webhook */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><EnvelopeSimple className="w-5 h-5" /> Webhook de Recebimento</CardTitle>
            <CardDescription>Configure esta URL no painel do Resend para receber e-mails automaticamente.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>URL do Webhook</Label>
              <div className="flex gap-2">
                <Input value={webhookUrl} readOnly className="font-mono text-sm rounded-lg h-[38px]" />
                <Button variant="outline" onClick={handleCopyWebhook} className="flex-shrink-0 rounded-lg">
                  {copied ? <Check className="w-4 h-4" /> : <CopySimple className="w-4 h-4" />}
                </Button>
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" asChild className="rounded-lg">
                <a href="https://resend.com/webhooks" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2">
                  <ArrowSquareOut className="w-4 h-4" /> Configurar no Resend
                </a>
              </Button>
              <Button variant="outline" asChild className="rounded-lg">
                <a href="https://resend.com/docs/dashboard/webhooks/receiving-inbound-emails" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2">
                  <ArrowSquareOut className="w-4 h-4" /> Documentação
                </a>
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Shopify */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><ShoppingBag className="w-5 h-5" /> Integração Shopify</CardTitle>
            <CardDescription>Conecte sua loja Shopify para sincronizar pedidos e produtos.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="shopify-store-url">Shopify Store URL</Label>
              <Input id="shopify-store-url" type="text" value={shopifyStoreUrl} onChange={(e) => setShopifyStoreUrl(e.target.value)} placeholder="minha-loja.myshopify.com" className="font-mono text-sm rounded-lg h-[38px]" />
              <p className="text-xs text-muted-foreground">O endereço da sua loja no Shopify (ex: minha-loja.myshopify.com).</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="shopify-client-id">Client ID</Label>
              <div className="relative">
                <Input id="shopify-client-id" type={showShopifyClientId ? 'text' : 'password'} value={shopifyClientId} onChange={(e) => setShopifyClientId(e.target.value)} placeholder="Client ID da aplicação Shopify" className="pr-10 font-mono text-sm rounded-lg h-[38px]" />
                <Button type="button" variant="ghost" size="icon" className="absolute right-0 top-0 h-full px-3 hover:bg-transparent" onClick={() => setShowShopifyClientId(!showShopifyClientId)}>
                  {showShopifyClientId ? <EyeSlash className="w-4 h-4 text-muted-foreground" /> : <Eye className="w-4 h-4 text-muted-foreground" />}
                </Button>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="shopify-client-secret">Client Secret</Label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Input id="shopify-client-secret" type={showShopifyClientSecret ? 'text' : 'password'} value={shopifyClientSecret} onChange={(e) => setShopifyClientSecret(e.target.value)} placeholder="Client Secret da aplicação Shopify" className="pr-10 font-mono text-sm rounded-lg h-[38px]" />
                  <Button type="button" variant="ghost" size="icon" className="absolute right-0 top-0 h-full px-3 hover:bg-transparent" onClick={() => setShowShopifyClientSecret(!showShopifyClientSecret)}>
                    {showShopifyClientSecret ? <EyeSlash className="w-4 h-4 text-muted-foreground" /> : <Eye className="w-4 h-4 text-muted-foreground" />}
                  </Button>
                </div>
                <Button variant="outline" onClick={handleVerifyShopify} disabled={isVerifyingShopify || !shopifyStoreUrl.trim() || !shopifyClientId.trim() || !shopifyClientSecret.trim()} className="rounded-lg">
                  {isVerifyingShopify ? (<><SpinnerGap className="w-4 h-4 animate-spin" /> Verificando...</>) : 'Verificar Conexão'}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">Gerados em Shopify Admin → Settings → Apps → Develop apps → API credentials.</p>
            </div>
          </CardContent>
        </Card>

        {/* Email Signature */}
        <Card>
          <CardHeader>
            <CardTitle>Assinatura de E-mail</CardTitle>
            <CardDescription>Esta assinatura será adicionada automaticamente às suas respostas.</CardDescription>
          </CardHeader>
          <CardContent>
            <Textarea value={emailSignature} onChange={(e) => setEmailSignature(e.target.value)} placeholder="Ex: Atenciosamente,&#10;Equipe de Suporte" rows={4} className="rounded-lg" />
          </CardContent>
        </Card>

        {/* Save */}
        <div className="flex justify-end pt-4 pb-8">
          <Button size="lg" onClick={handleSaveSettings} disabled={isSaving} className="rounded-lg">
            {isSaving ? (<><SpinnerGap className="w-4 h-4 animate-spin" /> Salvando...</>) : 'Salvar Todas as Configurações'}
          </Button>
        </div>
      </div>
    </div>
  );
}
