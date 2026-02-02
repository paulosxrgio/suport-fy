import { useState } from 'react';
import { Plus, Store, Trash2, Edit, Loader2, Eye, EyeOff, Check, Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { useStores, useCreateStore, useUpdateStore, useDeleteStore } from '@/hooks/useStores';
import { useStoreContext } from '@/contexts/StoreContext';
import { Store as StoreType } from '@/types/store';

export function StoresPage() {
  const { data: stores = [], isLoading } = useStores();
  const { activeStoreId, setActiveStoreId } = useStoreContext();
  const createStore = useCreateStore();
  const updateStore = useUpdateStore();
  const deleteStore = useDeleteStore();
  
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingStore, setEditingStore] = useState<StoreType | null>(null);
  
  // Form states
  const [name, setName] = useState('');
  const [domain, setDomain] = useState('');
  const [senderName, setSenderName] = useState('');
  const [senderEmail, setSenderEmail] = useState('');
  const [emailSignature, setEmailSignature] = useState('');
  const [resendApiKey, setResendApiKey] = useState('');
  const [openaiApiKey, setOpenaiApiKey] = useState('');
  const [showResendKey, setShowResendKey] = useState(false);
  const [showOpenaiKey, setShowOpenaiKey] = useState(false);

  const resetForm = () => {
    setName('');
    setDomain('');
    setSenderName('');
    setSenderEmail('');
    setEmailSignature('');
    setResendApiKey('');
    setOpenaiApiKey('');
    setShowResendKey(false);
    setShowOpenaiKey(false);
  };

  const openEditDialog = (store: StoreType) => {
    setEditingStore(store);
    setName(store.name);
    setDomain(store.domain);
    setSenderName(store.sender_name || '');
    setSenderEmail(store.sender_email || '');
    setEmailSignature(store.email_signature || '');
    setResendApiKey(store.resend_api_key || '');
    setOpenaiApiKey(store.openai_api_key || '');
  };

  const handleCreate = async () => {
    if (!name.trim() || !domain.trim()) {
      toast.error('Nome e domínio são obrigatórios');
      return;
    }

    try {
      const newStore = await createStore.mutateAsync({
        name: name.trim(),
        domain: domain.trim(),
        sender_name: senderName.trim() || undefined,
        sender_email: senderEmail.trim() || undefined,
      });
      
      toast.success('Loja criada com sucesso!');
      setIsCreateOpen(false);
      resetForm();
      
      // Set as active if it's the first store
      if (stores.length === 0) {
        setActiveStoreId(newStore.id);
      }
    } catch (error) {
      console.error('Error creating store:', error);
      toast.error('Erro ao criar loja');
    }
  };

  const handleUpdate = async () => {
    if (!editingStore || !name.trim() || !domain.trim()) {
      toast.error('Nome e domínio são obrigatórios');
      return;
    }

    try {
      await updateStore.mutateAsync({
        storeId: editingStore.id,
        updates: {
          name: name.trim(),
          domain: domain.trim(),
          sender_name: senderName.trim() || null,
          sender_email: senderEmail.trim() || null,
          email_signature: emailSignature.trim() || null,
          resend_api_key: resendApiKey.trim() || null,
          resend_api_key_configured: !!resendApiKey.trim(),
          openai_api_key: openaiApiKey.trim() || null,
        },
      });
      
      toast.success('Loja atualizada!');
      setEditingStore(null);
      resetForm();
    } catch (error) {
      console.error('Error updating store:', error);
      toast.error('Erro ao atualizar loja');
    }
  };

  const handleDelete = async (storeId: string) => {
    try {
      await deleteStore.mutateAsync(storeId);
      toast.success('Loja removida!');
      
      // If deleting active store, switch to first remaining
      if (activeStoreId === storeId) {
        const remaining = stores.filter(s => s.id !== storeId);
        setActiveStoreId(remaining[0]?.id || null);
      }
    } catch (error) {
      console.error('Error deleting store:', error);
      toast.error('Erro ao remover loja');
    }
  };

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto bg-background p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Lojas</h1>
            <p className="text-muted-foreground mt-1">
              Gerencie suas lojas e configure cada uma com domínio e chaves próprias.
            </p>
          </div>
          
          <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
            <DialogTrigger asChild>
              <Button onClick={() => { resetForm(); setIsCreateOpen(true); }}>
                <Plus className="w-4 h-4 mr-2" />
                Nova Loja
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Criar Nova Loja</DialogTitle>
                <DialogDescription>
                  Adicione uma nova loja com seu próprio domínio e configurações.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="create-name">Nome da Loja *</Label>
                  <Input
                    id="create-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Ex: Minha Loja Principal"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="create-domain">Domínio *</Label>
                  <Input
                    id="create-domain"
                    value={domain}
                    onChange={(e) => setDomain(e.target.value)}
                    placeholder="Ex: minhaloja.com"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="create-sender-name">Nome do Remetente</Label>
                  <Input
                    id="create-sender-name"
                    value={senderName}
                    onChange={(e) => setSenderName(e.target.value)}
                    placeholder="Ex: Suporte - Minha Loja"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="create-sender-email">E-mail do Remetente</Label>
                  <Input
                    id="create-sender-email"
                    type="email"
                    value={senderEmail}
                    onChange={(e) => setSenderEmail(e.target.value)}
                    placeholder="Ex: suporte@minhaloja.com"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsCreateOpen(false)}>
                  Cancelar
                </Button>
                <Button onClick={handleCreate} disabled={createStore.isPending}>
                  {createStore.isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin mr-2" />
                      Criando...
                    </>
                  ) : (
                    'Criar Loja'
                  )}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        <Separator />

        {stores.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Store className="w-12 h-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium text-foreground mb-2">
                Nenhuma loja cadastrada
              </h3>
              <p className="text-muted-foreground text-center mb-4">
                Crie sua primeira loja para começar a receber e gerenciar tickets.
              </p>
              <Button onClick={() => { resetForm(); setIsCreateOpen(true); }}>
                <Plus className="w-4 h-4 mr-2" />
                Criar Primeira Loja
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4">
            {stores.map((store) => (
              <Card 
                key={store.id}
                className={activeStoreId === store.id ? 'ring-2 ring-primary' : ''}
              >
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                        <Store className="w-5 h-5 text-primary" />
                      </div>
                      <div>
                        <CardTitle className="text-lg flex items-center gap-2">
                          {store.name}
                          {activeStoreId === store.id && (
                            <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full">
                              Ativa
                            </span>
                          )}
                        </CardTitle>
                        <CardDescription>{store.domain}</CardDescription>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {activeStoreId !== store.id && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setActiveStoreId(store.id)}
                        >
                          <Check className="w-4 h-4 mr-1" />
                          Ativar
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => openEditDialog(store)}
                      >
                        <Settings className="w-4 h-4" />
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive">
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Remover loja?</AlertDialogTitle>
                            <AlertDialogDescription>
                              Esta ação não pode ser desfeita. Todos os tickets e mensagens desta loja serão perdidos.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancelar</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => handleDelete(store.id)}
                              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            >
                              Remover
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                    {store.sender_email && (
                      <span>📧 {store.sender_email}</span>
                    )}
                    {store.resend_api_key_configured && (
                      <span className="text-green-600">✓ Resend configurado</span>
                    )}
                    {store.ai_is_active && (
                      <span className="text-blue-600">🤖 IA ativa</span>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Edit Store Dialog */}
        <Dialog open={!!editingStore} onOpenChange={(open) => !open && setEditingStore(null)}>
          <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Configurar Loja</DialogTitle>
              <DialogDescription>
                Edite as configurações desta loja.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="edit-name">Nome da Loja *</Label>
                <Input
                  id="edit-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-domain">Domínio *</Label>
                <Input
                  id="edit-domain"
                  value={domain}
                  onChange={(e) => setDomain(e.target.value)}
                />
              </div>
              
              <Separator />
              
              <h4 className="font-medium">Identidade do E-mail</h4>
              
              <div className="space-y-2">
                <Label htmlFor="edit-sender-name">Nome do Remetente</Label>
                <Input
                  id="edit-sender-name"
                  value={senderName}
                  onChange={(e) => setSenderName(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-sender-email">E-mail do Remetente</Label>
                <Input
                  id="edit-sender-email"
                  type="email"
                  value={senderEmail}
                  onChange={(e) => setSenderEmail(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-signature">Assinatura de E-mail</Label>
                <Textarea
                  id="edit-signature"
                  value={emailSignature}
                  onChange={(e) => setEmailSignature(e.target.value)}
                  rows={3}
                />
              </div>
              
              <Separator />
              
              <h4 className="font-medium">Chaves de API</h4>
              
              <div className="space-y-2">
                <Label htmlFor="edit-resend">API Key Resend</Label>
                <div className="relative">
                  <Input
                    id="edit-resend"
                    type={showResendKey ? 'text' : 'password'}
                    value={resendApiKey}
                    onChange={(e) => setResendApiKey(e.target.value)}
                    placeholder="re_xxxxxxxxx"
                    className="pr-10 font-mono text-sm"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                    onClick={() => setShowResendKey(!showResendKey)}
                  >
                    {showResendKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </Button>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-openai">API Key OpenAI</Label>
                <div className="relative">
                  <Input
                    id="edit-openai"
                    type={showOpenaiKey ? 'text' : 'password'}
                    value={openaiApiKey}
                    onChange={(e) => setOpenaiApiKey(e.target.value)}
                    placeholder="sk-xxxxxxxxx"
                    className="pr-10 font-mono text-sm"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                    onClick={() => setShowOpenaiKey(!showOpenaiKey)}
                  >
                    {showOpenaiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </Button>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditingStore(null)}>
                Cancelar
              </Button>
              <Button onClick={handleUpdate} disabled={updateStore.isPending}>
                {updateStore.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    Salvando...
                  </>
                ) : (
                  'Salvar Alterações'
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
