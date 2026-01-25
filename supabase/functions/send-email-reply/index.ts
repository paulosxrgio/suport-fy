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

    // Fetch the last inbound message to get its Message-ID for threading
    const { data: lastInboundMessage, error: messageError } = await supabase
      .from('messages')
      .select('email_message_id')
      .eq('ticket_id', ticketId)
      .eq('direction', 'inbound')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (messageError) {
      console.error('Error fetching last inbound message:', messageError);
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

    // Build email headers for threading
    const emailHeaders: Record<string, string> = {};
    
    if (lastInboundMessage?.email_message_id) {
      const replyToId = lastInboundMessage.email_message_id;
      emailHeaders['In-Reply-To'] = replyToId;
      emailHeaders['References'] = replyToId;
      console.log('Adding threading headers:', { 'In-Reply-To': replyToId, 'References': replyToId });
    }

    // Send email via Resend
    const emailResult = await resend.emails.send({
      from: fromAddress,
      to: [ticket.customer_email],
      subject: `Re: ${ticket.subject}`,
      text: fullContent,
      headers: Object.keys(emailHeaders).length > 0 ? emailHeaders : undefined,
    });

    console.log('Email sent successfully:', emailResult);

    // Extract the message ID from the response
    const sentMessageId = emailResult.data?.id ? `<${emailResult.data.id}@resend.dev>` : null;

    // Save outbound message to database with message ID
    const { error: insertError } = await supabase.from('messages').insert({
      ticket_id: ticketId,
      content,
      direction: 'outbound',
      sender_email: senderEmail,
      email_message_id: sentMessageId,
    });

    if (insertError) {
      console.error('Error inserting message:', insertError);
    }

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
