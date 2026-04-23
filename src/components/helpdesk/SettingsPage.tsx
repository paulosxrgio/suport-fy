import { useState, useEffect } from 'react';
import { Copy, Check, ExternalLink, Key, Mail, Eye, EyeOff, Loader2, User, Store, ShoppingBag, FileText, Download, Bot } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
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
  const [openaiApiKey, setOpenaiApiKey] = useState('');
  const [anthropicApiKey, setAnthropicApiKey] = useState('');
  const [aiProvider, setAiProvider] = useState('openai');
  const [aiModel, setAiModel] = useState('gpt-4o');
  const [showApiKey, setShowApiKey] = useState(false);
  const [showAnthropicKey, setShowAnthropicKey] = useState(false);
  const [showShopifyClientId, setShowShopifyClientId] = useState(false);
  const [showShopifyClientSecret, setShowShopifyClientSecret] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isVerifyingAI, setIsVerifyingAI] = useState(false);
  const [isVerifyingShopify, setIsVerifyingShopify] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [copied, setCopied] = useState(false);

  // Webhook URL - this is the URL users need to copy to Resend
  const webhookUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/process-inbound-email`;

  useEffect(() => {
    // Load settings for the current store
    const loadSettings = async () => {
      if (!currentStore) {
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      const { data } = await supabase
        .from('settings')
        .select('*')
        .eq('store_id', currentStore.id)
        .maybeSingle();
      
      if (data) {
        setSettingsId(data.id);
        setEmailSignature(data.email_signature || '');
        setResendApiKey((data as any).resend_api_key || '');
        setSenderName((data as any).sender_name || '');
        setSenderEmail((data as any).sender_email || '');
        setShopifyStoreUrl((data as any).shopify_store_url || '');
        setShopifyClientId((data as any).shopify_client_id || '');
        setShopifyClientSecret((data as any).shopify_client_secret || '');
        setOpenaiApiKey((data as any).openai_api_key || '');
        setAnthropicApiKey((data as any).anthropic_api_key || '');
        setAiProvider((data as any).ai_provider || 'openai');
        setAiModel((data as any).ai_model || 'gpt-4o');
      } else {
        setSettingsId(null);
        setEmailSignature('');
        setResendApiKey('');
        setSenderName('');
        setSenderEmail('');
        setShopifyStoreUrl('');
        setShopifyClientId('');
        setShopifyClientSecret('');
        setOpenaiApiKey('');
        setAnthropicApiKey('');
        setAiProvider('openai');
        setAiModel('gpt-4o');
      }
      setIsLoading(false);
    };
    
    loadSettings();
  }, [currentStore?.id]);

  const handleCopyWebhook = () => {
    navigator.clipboard.writeText(webhookUrl);
    setCopied(true);
    toast.success('URL copied!');
    setTimeout(() => setCopied(false), 2000);
  };

  const handleVerifyConnection = async () => {
    if (!resendApiKey.trim()) {
      toast.error('Enter the API Key to verify');
      return;
    }

    setIsVerifying(true);
    try {
      const { data, error } = await supabase.functions.invoke('verify-resend-key', {
        body: { apiKey: resendApiKey }
      });

      if (error) throw error;

      if (data.success) {
        toast.success(data.message || 'Connection successful!');
      } else {
        toast.error(data.error || 'Invalid API Key');
      }
    } catch (error) {
      console.error('Error verifying key:', error);
      toast.error('Failed to verify connection');
    } finally {
      setIsVerifying(false);
    }
  };

  const handleVerifyAI = async () => {
    const key = aiProvider === 'openai' ? openaiApiKey : anthropicApiKey;
    if (!key.trim()) {
      toast.error(`Enter the ${aiProvider === 'openai' ? 'OpenAI' : 'Anthropic'} API Key to verify`);
      return;
    }
    setIsVerifyingAI(true);
    try {
      const { data, error } = await supabase.functions.invoke('verify-ai-connection', {
        body: { provider: aiProvider, api_key: key, model: aiModel },
      });
      if (error) throw error;
      if (data?.success) toast.success(data.message);
      else toast.error(data?.error || 'Failed to verify connection');
    } catch (error) {
      console.error('Error verifying AI:', error);
      toast.error('Failed to verify AI connection. Please try again.');
    } finally {
      setIsVerifyingAI(false);
    }
  };

  const handleVerifyShopify = async () => {
    if (!shopifyStoreUrl.trim() || !shopifyClientId.trim() || !shopifyClientSecret.trim()) {
      toast.error('Fill in URL, Client ID and Client Secret to verify');
      return;
    }

    setIsVerifyingShopify(true);
    try {
      const { data, error } = await supabase.functions.invoke('verify-shopify-token', {
        body: { storeUrl: shopifyStoreUrl, clientId: shopifyClientId, clientSecret: shopifyClientSecret }
      });

      if (error) throw error;

      if (data.success) {
        toast.success(data.message || 'Shopify connection successful!');
      } else {
        toast.error(data.error || 'Failed to connect to Shopify');
      }
    } catch (error) {
      console.error('Error verifying Shopify:', error);
      toast.error('Failed to verify Shopify connection');
    } finally {
      setIsVerifyingShopify(false);
    }
  };

  const handleSaveSettings = async () => {
    if (!currentStore) {
      toast.error('Select a store first');
      return;
    }
    if (isSaving) return; // prevent double-submit

    setIsSaving(true);
    try {
      const settingsData = {
        store_id: currentStore.id,
        email_signature: emailSignature,
        resend_api_key: resendApiKey,
        resend_api_key_configured: !!resendApiKey,
        sender_name: senderName,
        sender_email: senderEmail,
        shopify_store_url: shopifyStoreUrl,
        shopify_client_id: shopifyClientId,
        shopify_client_secret: shopifyClientSecret,
        ai_provider: aiProvider,
        openai_api_key: aiProvider === 'openai' ? openaiApiKey : null,
        anthropic_api_key: aiProvider === 'anthropic' ? anthropicApiKey : null,
        ai_model: aiModel,
        updated_at: new Date().toISOString()
      };

      if (settingsId) {
        // Update existing settings for this store
        const { error } = await supabase
          .from('settings')
          .update(settingsData as any)
          .eq('id', settingsId);

        if (error) throw error;
      } else {
        // Insert new settings for this store
        const { data, error } = await supabase
          .from('settings')
          .insert(settingsData as any)
          .select('id')
          .single();

        if (error) throw error;
        setSettingsId(data.id);
      }

      toast.success('Settings saved!');
    } catch (error) {
      console.error('Error saving settings:', error);
      toast.error('Failed to save settings');
    } finally {
      setIsSaving(false);
    }
  };
  const handleExportChats = async () => {
    if (!currentStore) return;
    setExporting(true);

    try {
      const { data: tickets } = await supabase
        .from('tickets')
        .select('*')
        .eq('store_id', currentStore.id)
        .order('created_at', { ascending: true });

      if (!tickets || tickets.length === 0) {
        toast.info('No tickets found.');
        setExporting(false);
        return;
      }

      const { data: messages } = await supabase
        .from('messages')
        .select('*')
        .eq('store_id', currentStore.id)
        .order('created_at', { ascending: true });

      const msgsByTicket: Record<string, typeof messages> = {};
      messages?.forEach(m => {
        if (!msgsByTicket[m.ticket_id]) msgsByTicket[m.ticket_id] = [];
        msgsByTicket[m.ticket_id].push(m);
      });

      const separator = '═'.repeat(60);
      const thinSep = '─'.repeat(60);

      let output = '';
      output += `SUPORTFY — FULL CONVERSATION EXPORT\n`;
      output += `Store: ${currentStore.name}\n`;
      output += `Exported at: ${new Date().toLocaleString('en-US')}\n`;
      output += `Total tickets: ${tickets.length}\n`;
      output += `${separator}\n\n`;

      tickets.forEach((ticket, i) => {
        const msgs = msgsByTicket[ticket.id] || [];
        const status = ticket.status === 'open' ? 'OPEN' : 'CLOSED';
        const date = new Date(ticket.created_at).toLocaleString('en-US');

        output += `${separator}\n`;
        output += `TICKET #${i + 1} — ${status}\n`;
        output += `${separator}\n`;
        output += `Customer : ${ticket.customer_name || 'No name'}\n`;
        output += `Email    : ${ticket.customer_email}\n`;
        output += `Subject  : ${ticket.subject || 'No subject'}\n`;
        output += `Date     : ${date}\n`;
        output += `Msgs     : ${msgs.length}\n`;
        output += `${thinSep}\n\n`;

        if (msgs.length === 0) {
          output += `  (no messages)\n\n`;
        } else {
          msgs.forEach(msg => {
            const time = new Date(msg.created_at).toLocaleString('en-US', {
              day: '2-digit', month: '2-digit', year: 'numeric',
              hour: '2-digit', minute: '2-digit'
            });
            const role = msg.direction === 'outbound' ? '🤖 SOPHIA' : '👤 CUSTOMER';
            output += `[${time}] ${role}\n`;
            output += `${msg.content}\n\n`;
          });
        }

        output += '\n';
      });

      output += `${separator}\n`;
      output += `END OF EXPORT — ${tickets.length} tickets · ${messages?.length || 0} messages\n`;
      output += `${separator}\n`;

      const blob = new Blob([output], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `suportfy-${currentStore.name.toLowerCase().replace(/\s+/g, '-')}-${new Date().toISOString().split('T')[0]}.txt`;
      a.click();
      URL.revokeObjectURL(url);

      toast.success(`Exported! ${tickets.length} tickets · ${messages?.length || 0} messages`);
    } catch (error) {
      console.error('Error exporting:', error);
      toast.error('Failed to export data');
    } finally {
      setExporting(false);
    }
  };


  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!currentStore) {
    return (
      <div className="flex-1 flex items-center justify-center bg-background">
        <div className="text-center">
          <Store className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
          <p className="text-muted-foreground">Select a store to configure</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto bg-background p-6">
      <div className="max-w-3xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-heading italic text-foreground">Settings</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Configure integrations for store <strong>{currentStore.name}</strong>.
          </p>
        </div>

        <Separator />

        {/* Resend Integration Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Key className="w-5 h-5" />
              Resend Integration
            </CardTitle>
            <CardDescription>
              Configure your Resend API Key to enable outgoing emails.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="resend-api-key">Resend API Key</Label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Input
                    id="resend-api-key"
                    type={showApiKey ? 'text' : 'password'}
                    value={resendApiKey}
                    onChange={(e) => setResendApiKey(e.target.value)}
                    placeholder="re_xxxxxxxxxxxxxxxxxxxxxxxxx"
                    className="pr-10 font-mono text-sm"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                    onClick={() => setShowApiKey(!showApiKey)}
                  >
                    {showApiKey ? (
                      <EyeOff className="w-4 h-4 text-muted-foreground" />
                    ) : (
                      <Eye className="w-4 h-4 text-muted-foreground" />
                    )}
                  </Button>
                </div>
                <Button
                  variant="outline"
                  onClick={handleVerifyConnection}
                  disabled={isVerifying || !resendApiKey.trim()}
                >
                  {isVerifying ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Verifying...
                    </>
                  ) : (
                    'Verify connection'
                  )}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Get your API Key at{' '}
                <a
                  href="https://resend.com/api-keys"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  resend.com/api-keys
                </a>
              </p>
            </div>
          </CardContent>
        </Card>

        {/* AI Provider Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bot className="w-5 h-5" />
              AI Provider
            </CardTitle>
            <CardDescription>
              Configure provider, API key and model for automated replies.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="ai-provider">Provider</Label>
              <Select value={aiProvider} onValueChange={(value) => {
                setAiProvider(value);
                setAiModel(value === 'openai' ? 'gpt-4o' : 'claude-haiku-4-5-20251001');
              }}>
                <SelectTrigger>
                  <SelectValue placeholder="Select provider" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="openai">OpenAI (GPT)</SelectItem>
                  <SelectItem value="anthropic">Anthropic (Claude)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {aiProvider === 'openai' ? (
              <>
                <div className="space-y-2">
                  <Label htmlFor="openai-api-key">OpenAI API Key</Label>
                  <div className="relative">
                    <Input
                      id="openai-api-key"
                      type={showApiKey ? 'text' : 'password'}
                      value={openaiApiKey}
                      onChange={(e) => setOpenaiApiKey(e.target.value)}
                      placeholder="sk-..."
                      className="pr-10 font-mono text-sm"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                      onClick={() => setShowApiKey(!showApiKey)}
                    >
                      {showApiKey ? <EyeOff className="w-4 h-4 text-muted-foreground" /> : <Eye className="w-4 h-4 text-muted-foreground" />}
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Get your key at{' '}
                    <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                      platform.openai.com
                    </a>
                  </p>
                </div>
                <div className="space-y-2">
                  <Label>Model</Label>
                  <Select value={aiModel} onValueChange={setAiModel}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="gpt-4o">GPT-4o</SelectItem>
                      <SelectItem value="gpt-4o-mini">GPT-4o Mini</SelectItem>
                      <SelectItem value="gpt-3.5-turbo">GPT-3.5 Turbo</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </>
            ) : (
              <>
                <div className="space-y-2">
                  <Label htmlFor="anthropic-api-key">Anthropic API Key</Label>
                  <div className="relative">
                    <Input
                      id="anthropic-api-key"
                      type={showAnthropicKey ? 'text' : 'password'}
                      value={anthropicApiKey}
                      onChange={(e) => setAnthropicApiKey(e.target.value)}
                      placeholder="sk-ant-..."
                      className="pr-10 font-mono text-sm"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                      onClick={() => setShowAnthropicKey(!showAnthropicKey)}
                    >
                      {showAnthropicKey ? <EyeOff className="w-4 h-4 text-muted-foreground" /> : <Eye className="w-4 h-4 text-muted-foreground" />}
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Get your key at{' '}
                    <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                      console.anthropic.com
                    </a>
                  </p>
                </div>
                <div className="space-y-2">
                  <Label>Model</Label>
                  <Select value={aiModel} onValueChange={setAiModel}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="claude-haiku-4-5-20251001">Claude Haiku 4.5 (cheapest)</SelectItem>
                      <SelectItem value="claude-sonnet-4-6">Claude Sonnet 4.6 (best quality)</SelectItem>
                      <SelectItem value="claude-opus-4-5">Claude Opus 4.5 (premium)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}

            <Button
              variant="outline"
              onClick={handleVerifyAI}
              disabled={isVerifyingAI || (aiProvider === 'openai' ? !openaiApiKey.trim() : !anthropicApiKey.trim())}
            >
              {isVerifyingAI ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Verifying...
                </>
              ) : (
                'Verify connection'
              )}
            </Button>
          </CardContent>
        </Card>

        {/* Sender Identity Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="w-5 h-5" />
              Email Identity
            </CardTitle>
            <CardDescription>
              Configure how your emails appear in your customers' inboxes.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="sender-name">Display name</Label>
              <Input
                id="sender-name"
                type="text"
                value={senderName}
                onChange={(e) => setSenderName(e.target.value)}
                placeholder="e.g., Sophia - Ivory Saint"
              />
              <p className="text-xs text-muted-foreground">
                This is the name your customer sees in their inbox.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="sender-email">Sender email</Label>
              <Input
                id="sender-email"
                type="email"
                value={senderEmail}
                onChange={(e) => setSenderEmail(e.target.value)}
                placeholder="e.g., support@yourdomain.com"
              />
              <p className="text-xs text-muted-foreground">
                The verified email in your Resend dashboard.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Webhook Configuration */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Mail className="w-5 h-5" />
              Inbound Webhook
            </CardTitle>
            <CardDescription>
              Configure this URL in your Resend dashboard to receive emails automatically.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Webhook URL</Label>
              <div className="flex gap-2">
                <Input
                  value={webhookUrl}
                  readOnly
                  className="font-mono text-sm"
                />
                <Button
                  variant="outline"
                  onClick={handleCopyWebhook}
                  className="flex-shrink-0"
                >
                  {copied ? (
                    <Check className="w-4 h-4" />
                  ) : (
                    <Copy className="w-4 h-4" />
                  )}
                </Button>
              </div>
            </div>

            <div className="flex gap-2">
              <Button variant="outline" asChild>
                <a
                  href="https://resend.com/webhooks"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2"
                >
                  <ExternalLink className="w-4 h-4" />
                  Configure on Resend
                </a>
              </Button>
              <Button variant="outline" asChild>
                <a
                  href="https://resend.com/docs/dashboard/webhooks/receiving-inbound-emails"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2"
                >
                  <ExternalLink className="w-4 h-4" />
                  Documentation
                </a>
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Shopify Integration */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShoppingBag className="w-5 h-5" />
              Shopify Integration
            </CardTitle>
            <CardDescription>
              Connect your Shopify store to sync orders and products.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="shopify-store-url">Shopify Store URL</Label>
              <Input
                id="shopify-store-url"
                type="text"
                value={shopifyStoreUrl}
                onChange={(e) => setShopifyStoreUrl(e.target.value)}
                placeholder="my-store.myshopify.com"
                className="font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground">
                Your Shopify store address (e.g., my-store.myshopify.com).
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="shopify-client-id">Client ID</Label>
              <div className="relative">
                <Input
                  id="shopify-client-id"
                  type={showShopifyClientId ? 'text' : 'password'}
                  value={shopifyClientId}
                  onChange={(e) => setShopifyClientId(e.target.value)}
                  placeholder="Shopify app Client ID"
                  className="pr-10 font-mono text-sm"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                  onClick={() => setShowShopifyClientId(!showShopifyClientId)}
                >
                  {showShopifyClientId ? (
                    <EyeOff className="w-4 h-4 text-muted-foreground" />
                  ) : (
                    <Eye className="w-4 h-4 text-muted-foreground" />
                  )}
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="shopify-client-secret">Client Secret</Label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Input
                    id="shopify-client-secret"
                    type={showShopifyClientSecret ? 'text' : 'password'}
                    value={shopifyClientSecret}
                    onChange={(e) => setShopifyClientSecret(e.target.value)}
                    placeholder="Shopify app Client Secret"
                    className="pr-10 font-mono text-sm"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                    onClick={() => setShowShopifyClientSecret(!showShopifyClientSecret)}
                  >
                    {showShopifyClientSecret ? (
                      <EyeOff className="w-4 h-4 text-muted-foreground" />
                    ) : (
                      <Eye className="w-4 h-4 text-muted-foreground" />
                    )}
                  </Button>
                </div>
                <Button
                  variant="outline"
                  onClick={handleVerifyShopify}
                  disabled={isVerifyingShopify || !shopifyStoreUrl.trim() || !shopifyClientId.trim() || !shopifyClientSecret.trim()}
                >
                  {isVerifyingShopify ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Verifying...
                    </>
                  ) : (
                    'Verify connection'
                  )}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Generated in Shopify Admin → Settings → Apps → Develop apps → API credentials.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Email Signature */}
        <Card>
          <CardHeader>
            <CardTitle>Email Signature</CardTitle>
            <CardDescription>
              This signature will be appended automatically to your replies.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Textarea
              value={emailSignature}
              onChange={(e) => setEmailSignature(e.target.value)}
              placeholder="e.g., Best regards,&#10;Support Team"
              rows={4}
            />
          </CardContent>
        </Card>

        {/* Export Data */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5" />
              Export Data
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Export the full conversation history of this store as an organized .txt file —
              including every message, date, customer and AI reply.
              Ideal for behavior analysis and auditing.
            </p>
            <pre className="bg-muted p-4 rounded-lg text-xs text-muted-foreground overflow-x-auto whitespace-pre leading-relaxed">
{`══════════════════════════════
TICKET #1 — CLOSED
══════════════════════════════
Customer : Sarah Johnson
──────────────────────────────
[02/27/2026 09:14] 👤 CUSTOMER
Where is my order?

[02/27/2026 09:18] 🤖 SOPHIA
Hi Sarah, I've checked this personally...`}
            </pre>
            <Button onClick={handleExportChats} disabled={exporting} variant="outline">
              <Download className="w-4 h-4" />
              {exporting ? 'Exporting...' : 'Export full history (.txt)'}
            </Button>
          </CardContent>
        </Card>

        {/* Single Save Button */}
        <div className="flex justify-end pt-4 pb-8">
          <Button size="lg" onClick={handleSaveSettings} disabled={isSaving}>
            {isSaving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
                Saving...
              </>
            ) : (
              'Save all settings'
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
