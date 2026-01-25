-- Tickets table
CREATE TABLE public.tickets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
    customer_email TEXT NOT NULL,
    customer_name TEXT,
    subject TEXT NOT NULL,
    last_message_at TIMESTAMPTZ DEFAULT now(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Messages table
CREATE TABLE public.messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id UUID NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    html_body TEXT,
    direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
    sender_email TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Settings table (singleton)
CREATE TABLE public.settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email_signature TEXT,
    resend_api_key_configured BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;

-- RLS Policies for tickets (public access for now, can be restricted later)
CREATE POLICY "Allow all operations on tickets" ON public.tickets FOR ALL USING (true) WITH CHECK (true);

-- RLS Policies for messages
CREATE POLICY "Allow all operations on messages" ON public.messages FOR ALL USING (true) WITH CHECK (true);

-- RLS Policies for settings
CREATE POLICY "Allow all operations on settings" ON public.settings FOR ALL USING (true) WITH CHECK (true);

-- Enable realtime for messages and tickets
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.tickets;

-- Create index for better performance
CREATE INDEX idx_messages_ticket_id ON public.messages(ticket_id);
CREATE INDEX idx_tickets_status ON public.tickets(status);
CREATE INDEX idx_tickets_last_message_at ON public.tickets(last_message_at DESC);

-- Insert default settings row
INSERT INTO public.settings (email_signature) VALUES ('');

-- Function to update last_message_at on ticket when new message is added
CREATE OR REPLACE FUNCTION public.update_ticket_last_message()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE public.tickets SET last_message_at = NEW.created_at WHERE id = NEW.ticket_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Trigger for auto-updating last_message_at
CREATE TRIGGER on_message_created
AFTER INSERT ON public.messages
FOR EACH ROW EXECUTE FUNCTION public.update_ticket_last_message();