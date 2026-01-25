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
    console.log('=== SEND EMAIL REPLY START ===');
    
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    // Parse request body
    const requestBody = await req.json();
    const { ticketId, content }: SendEmailRequest = requestBody;
    
    console.log('Step 1 - Request recebido:', { 
      ticketId, 
      contentLength: content?.length || 0,
      contentPreview: content?.substring(0, 100) || '[VAZIO]'
    });

    if (!content || content.trim() === '') {
      console.error('Step 1 - ERRO: Content está vazio!');
      return new Response(
        JSON.stringify({ error: 'Conteúdo da mensagem está vazio' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Fetch settings including sender identity and API key
    const { data: settings, error: settingsError } = await supabase
      .from('settings')
      .select('*')
      .limit(1)
      .maybeSingle();

    if (settingsError) {
      console.error('Step 2 - Error fetching settings:', settingsError);
    }

    // Get API key from settings or fallback to env
    const resendApiKey = settings?.resend_api_key || Deno.env.get('RESEND_API_KEY');
    if (!resendApiKey) {
      return new Response(
        JSON.stringify({ error: 'RESEND_API_KEY não configurada. Configure nas Configurações ou como variável de ambiente.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Step 2 - Settings carregadas');

    const resend = new Resend(resendApiKey);

    // Fetch ticket details
    const { data: ticket, error: ticketError } = await supabase
      .from('tickets')
      .select('*')
      .eq('id', ticketId)
      .single();

    if (ticketError || !ticket) {
      console.error('Step 3 - Ticket error:', ticketError);
      throw new Error('Ticket não encontrado');
    }

    console.log('Step 3 - Ticket encontrado:', { id: ticket.id, customer_email: ticket.customer_email });

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
      console.error('Step 4 - Error fetching last inbound message:', messageError);
    }

    console.log('Step 4 - Last inbound message:', { 
      found: !!lastInboundMessage, 
      email_message_id: lastInboundMessage?.email_message_id 
    });

    // Build sender identity from settings or use fallback
    const senderName = settings?.sender_name || 'Suporte';
    const senderEmail = settings?.sender_email || 'suporte@exemplo.com';
    const fromAddress = `${senderName} <${senderEmail}>`;

    // Append signature if configured
    const fullContent = settings?.email_signature 
      ? `${content}\n\n${settings.email_signature}` 
      : content;

    console.log('Step 5 - Enviando email:', { from: fromAddress, to: ticket.customer_email });

    // Build email headers for threading
    const emailHeaders: Record<string, string> = {};
    
    if (lastInboundMessage?.email_message_id) {
      const replyToId = lastInboundMessage.email_message_id;
      emailHeaders['In-Reply-To'] = replyToId;
      emailHeaders['References'] = replyToId;
      console.log('Step 5 - Threading headers:', { 'In-Reply-To': replyToId });
    }

    // Send email via Resend
    const emailResult = await resend.emails.send({
      from: fromAddress,
      to: [ticket.customer_email],
      subject: `Re: ${ticket.subject}`,
      text: fullContent,
      headers: Object.keys(emailHeaders).length > 0 ? emailHeaders : undefined,
    });

    console.log('Step 6 - Email enviado:', emailResult);

    // Extract the message ID from the response
    const sentMessageId = emailResult.data?.id ? `<${emailResult.data.id}@resend.dev>` : null;

    // CRITICAL: Save outbound message to database
    console.log('Step 7 - Salvando mensagem no banco:', {
      ticket_id: ticketId,
      content: content,
      contentLength: content.length,
      direction: 'outbound',
      sender_email: senderEmail,
      email_message_id: sentMessageId,
    });

    const { data: insertedMessage, error: insertError } = await supabase
      .from('messages')
      .insert({
        ticket_id: ticketId,
        content: content,
        direction: 'outbound',
        sender_email: senderEmail,
        email_message_id: sentMessageId,
      })
      .select()
      .single();

    if (insertError) {
      console.error('Step 7 - ERRO ao inserir mensagem:', insertError);
      throw new Error(`Erro ao salvar mensagem: ${insertError.message}`);
    }

    console.log('Step 7 - Mensagem salva com sucesso:', { 
      id: insertedMessage?.id,
      content: insertedMessage?.content?.substring(0, 50)
    });
    console.log('=== SEND EMAIL REPLY COMPLETE ===');

    return new Response(
      JSON.stringify({ success: true, messageId: insertedMessage?.id }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('=== SEND EMAIL REPLY ERROR ===', message);
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
