import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "https://esm.sh/resend@2.0.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface SendEmailRequest {
  ticketId: string;
  content: string;
  senderEmail: string;
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const resendApiKey = Deno.env.get('RESEND_API_KEY');
    if (!resendApiKey) {
      return new Response(
        JSON.stringify({ error: 'RESEND_API_KEY não configurada.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const resend = new Resend(resendApiKey);
    const { ticketId, content, senderEmail }: SendEmailRequest = await req.json();

    const { data: ticket, error: ticketError } = await supabase.from('tickets').select('*').eq('id', ticketId).single();
    if (ticketError || !ticket) throw new Error('Ticket não encontrado');

    const { data: settings } = await supabase.from('settings').select('email_signature').limit(1).maybeSingle();
    const fullContent = settings?.email_signature ? `${content}\n\n${settings.email_signature}` : content;

    await resend.emails.send({
      from: senderEmail,
      to: [ticket.customer_email],
      subject: `Re: ${ticket.subject}`,
      text: fullContent,
    });

    await supabase.from('messages').insert({ ticket_id: ticketId, content, direction: 'outbound', sender_email: senderEmail });

    return new Response(JSON.stringify({ success: true }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
