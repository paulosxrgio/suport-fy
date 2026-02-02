-- Criar tabela de lojas (stores)
CREATE TABLE public.stores (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    name TEXT NOT NULL,
    domain TEXT NOT NULL,
    sender_name TEXT,
    sender_email TEXT,
    email_signature TEXT,
    resend_api_key TEXT,
    resend_api_key_configured BOOLEAN DEFAULT false,
    openai_api_key TEXT,
    ai_system_prompt TEXT,
    ai_model TEXT DEFAULT 'gpt-4o',
    ai_response_delay INTEGER DEFAULT 2,
    ai_is_active BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Adicionar coluna store_id na tabela tickets
ALTER TABLE public.tickets ADD COLUMN store_id UUID REFERENCES public.stores(id) ON DELETE CASCADE;

-- Adicionar coluna store_id na tabela messages
ALTER TABLE public.messages ADD COLUMN store_id UUID REFERENCES public.stores(id) ON DELETE CASCADE;

-- Habilitar RLS na tabela stores
ALTER TABLE public.stores ENABLE ROW LEVEL SECURITY;

-- Políticas RLS para stores
CREATE POLICY "Users can view their own stores"
ON public.stores FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own stores"
ON public.stores FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own stores"
ON public.stores FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own stores"
ON public.stores FOR DELETE
USING (auth.uid() = user_id);

-- Trigger para atualizar updated_at
CREATE TRIGGER update_stores_updated_at
BEFORE UPDATE ON public.stores
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Remover políticas antigas de tickets
DROP POLICY IF EXISTS "Allow all operations on tickets" ON public.tickets;

-- Novas políticas de tickets baseadas em loja
CREATE POLICY "Users can view tickets from their stores"
ON public.tickets FOR SELECT
USING (
    store_id IN (SELECT id FROM public.stores WHERE user_id = auth.uid())
    OR store_id IS NULL
);

CREATE POLICY "Users can create tickets in their stores"
ON public.tickets FOR INSERT
WITH CHECK (
    store_id IN (SELECT id FROM public.stores WHERE user_id = auth.uid())
    OR store_id IS NULL
);

CREATE POLICY "Users can update tickets from their stores"
ON public.tickets FOR UPDATE
USING (
    store_id IN (SELECT id FROM public.stores WHERE user_id = auth.uid())
    OR store_id IS NULL
);

CREATE POLICY "Users can delete tickets from their stores"
ON public.tickets FOR DELETE
USING (
    store_id IN (SELECT id FROM public.stores WHERE user_id = auth.uid())
    OR store_id IS NULL
);

-- Remover políticas antigas de messages
DROP POLICY IF EXISTS "Allow all operations on messages" ON public.messages;

-- Novas políticas de messages baseadas em loja
CREATE POLICY "Users can view messages from their stores"
ON public.messages FOR SELECT
USING (
    store_id IN (SELECT id FROM public.stores WHERE user_id = auth.uid())
    OR store_id IS NULL
);

CREATE POLICY "Users can create messages in their stores"
ON public.messages FOR INSERT
WITH CHECK (
    store_id IN (SELECT id FROM public.stores WHERE user_id = auth.uid())
    OR store_id IS NULL
);

CREATE POLICY "Users can update messages from their stores"
ON public.messages FOR UPDATE
USING (
    store_id IN (SELECT id FROM public.stores WHERE user_id = auth.uid())
    OR store_id IS NULL
);

CREATE POLICY "Users can delete messages from their stores"
ON public.messages FOR DELETE
USING (
    store_id IN (SELECT id FROM public.stores WHERE user_id = auth.uid())
    OR store_id IS NULL
);