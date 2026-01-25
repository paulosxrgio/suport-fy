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
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    // Fetch settings including sender identity and API key
    const { data: settings, error: settingsError } = await supabase
      .from('settings')
      .select('*')
      .limit(1)
      .maybeSingle();

    if (settingsError) {
      console.error('Error fetching settings:', settingsError);
    }

    // Get API key from settings or fallback to env
    const resendApiKey = settings?.resend_api_key || Deno.env.get('RESEND_API_KEY');
    if (!resendApiKey) {
      return new Response(
        JSON.stringify({ error: 'RESEND_API_KEY não configurada. Configure nas Configurações ou como variável de ambiente.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const resend = new Resend(resendApiKey);
    const { ticketId, content }: SendEmailRequest = await req.json();

    // Fetch ticket details
    const { data: ticket, error: ticketError } = await supabase
      .from('tickets')
      .select('*')
      .eq('id', ticketId)
      .single();

    if (ticketError || !ticket) {
      console.error('Ticket error:', ticketError);
      throw new Error('Ticket não encontrado');
    }

    // Build sender identity from settings or use fallback
    const senderName = settings?.sender_name || 'Suporte';
    const senderEmail = settings?.sender_email || 'suporte@exemplo.com';
    const fromAddress = `${senderName} <${senderEmail}>`;

    // Append signature if configured
    const fullContent = settings?.email_signature 
      ? `${content}\n\n${settings.email_signature}` 
      : content;

    console.log(`Sending email from: ${fromAddress} to: ${ticket.customer_email}`);

    // Send email via Resend
    const emailResult = await resend.emails.send({
      from: fromAddress,
      to: [ticket.customer_email],
      subject: `Re: ${ticket.subject}`,
      text: fullContent,
    });

    console.log('Email sent successfully:', emailResult);

    // Save outbound message to database
    await supabase.from('messages').insert({
      ticket_id: ticketId,
      content,
      direction: 'outbound',
      sender_email: senderEmail,
    });

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('Error in send-email-reply:', message);
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
