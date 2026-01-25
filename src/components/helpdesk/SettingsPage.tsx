import { useState, useEffect } from 'react';
import { Copy, Check, ExternalLink, Key, Mail, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

export function SettingsPage() {
  const [emailSignature, setEmailSignature] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [copied, setCopied] = useState(false);

  // Webhook URL - this is the URL users need to copy to Resend
  const webhookUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/process-inbound-email`;

  useEffect(() => {
    // Load settings
    const loadSettings = async () => {
      const { data } = await supabase
        .from('settings')
        .select('*')
        .limit(1)
        .maybeSingle();
      
      if (data) {
        setEmailSignature(data.email_signature || '');
      }
    };
    
    loadSettings();
  }, []);

  const handleCopyWebhook = () => {
    navigator.clipboard.writeText(webhookUrl);
    setCopied(true);
    toast.success('URL copiada!');
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSaveSignature = async () => {
    setIsSaving(true);
    try {
      const { error } = await supabase
        .from('settings')
        .update({ email_signature: emailSignature, updated_at: new Date().toISOString() })
        .not('id', 'is', null);
      
      if (error) throw error;
      toast.success('Configurações salvas!');
    } catch (error) {
      toast.error('Erro ao salvar configurações');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto bg-background p-6">
      <div className="max-w-3xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Configurações</h1>
          <p className="text-muted-foreground mt-1">
            Configure a integração com o Resend para envio e recebimento de e-mails.
          </p>
        </div>

        <Separator />

        {/* Webhook Configuration */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Mail className="w-5 h-5" />
              Webhook de Recebimento
            </CardTitle>
            <CardDescription>
              Configure esta URL no painel do Resend para receber e-mails automaticamente.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Para receber e-mails, você precisa configurar um domínio no Resend e adicionar
                esta URL como webhook de inbound.
              </AlertDescription>
            </Alert>
            
            <div className="space-y-2">
              <Label>URL do Webhook</Label>
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
                  Configurar no Resend
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
                  Documentação
                </a>
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* API Key Info */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Key className="w-5 h-5" />
              API Key do Resend
            </CardTitle>
            <CardDescription>
              A API Key é armazenada de forma segura nas variáveis de ambiente do backend.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Para configurar a API Key do Resend, adicione-a como secret no Lovable Cloud 
                com o nome <code className="bg-muted px-1 rounded">RESEND_API_KEY</code>.
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>

        {/* Email Signature */}
        <Card>
          <CardHeader>
            <CardTitle>Assinatura de E-mail</CardTitle>
            <CardDescription>
              Esta assinatura será adicionada automaticamente às suas respostas.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Textarea
              value={emailSignature}
              onChange={(e) => setEmailSignature(e.target.value)}
              placeholder="Ex: Atenciosamente,&#10;Equipe de Suporte"
              rows={4}
            />
            <Button onClick={handleSaveSignature} disabled={isSaving}>
              {isSaving ? 'Salvando...' : 'Salvar Assinatura'}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
