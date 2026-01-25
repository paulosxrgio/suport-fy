import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('=== PROCESS INBOUND EMAIL START ===');
    
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Step 1: Parse webhook payload
    const rawPayload = await req.json();
    console.log('Step 1 - Webhook received:', JSON.stringify(rawPayload, null, 2));

    // Step 2: Get Resend API key
    const { data: settings } = await supabase
      .from('settings')
      .select('resend_api_key')
      .limit(1)
      .maybeSingle();

    const resendApiKey = settings?.resend_api_key || Deno.env.get('RESEND_API_KEY');
    
    if (!resendApiKey) {
      console.error('Step 2 - ERRO: Resend API key não configurada');
      return new Response(
        JSON.stringify({ error: 'RESEND_API_KEY not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    console.log('Step 2 - Resend API key encontrada');

    // Step 3: Extract email_id from webhook
    const webhookData = rawPayload.data || rawPayload;
    const emailId = webhookData.email_id;
    const messageIdFromWebhook = webhookData.message_id; // Real Message-ID header for threading
    
    console.log('Step 3 - IDs extraídos:', { 
      emailId, 
      messageIdFromWebhook,
      from: webhookData.from,
      subject: webhookData.subject
    });

    if (!emailId) {
      console.error('Step 3 - ERRO: email_id não encontrado no payload');
      return new Response(
        JSON.stringify({ error: 'No email_id found in webhook' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Step 4: BUSCAR CONTEÚDO COMPLETO via API direta do Resend
    // Endpoint: GET https://api.resend.com/emails/receiving/{email_id}
    console.log('Step 4 - Buscando conteúdo completo via API Resend...');
    
    const emailResponse = await fetch(`https://api.resend.com/emails/receiving/${emailId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${resendApiKey}`,
      },
    });

    let emailFull: {
      from?: string;
      to?: string[];
      subject?: string;
      text?: string;
      html?: string;
    } | null = null;

    if (emailResponse.ok) {
      emailFull = await emailResponse.json();
      console.log('Step 4 - SUCESSO! E-mail completo baixado');
    } else {
      const errorBody = await emailResponse.text();
      console.error('Step 4 - ERRO ao buscar e-mail:', emailResponse.status, errorBody);
    }

    // Debug: Log what we got
    console.log('Conteúdo HTML baixado:', emailFull?.html ? 'Sim' : 'Não');
    console.log('Conteúdo TEXT baixado:', emailFull?.text ? 'Sim' : 'Não');
    console.log('Step 4 - Detalhes do e-mail:', {
      from: emailFull?.from,
      subject: emailFull?.subject,
      textLength: emailFull?.text?.length || 0,
      htmlLength: emailFull?.html?.length || 0,
      textPreview: emailFull?.text?.substring(0, 200) || '[vazio]',
    });

    // Step 5: Prepare email content
    const emailContent = {
      from: emailFull?.from || webhookData.from,
      to: emailFull?.to || webhookData.to,
      subject: emailFull?.subject || webhookData.subject || 'Sem assunto',
      text: emailFull?.text || '',
      html: emailFull?.html || '',
    };

    console.log('Step 5 - Conteúdo preparado:', {
      from: emailContent.from,
      subject: emailContent.subject,
      hasText: !!emailContent.text,
      hasHtml: !!emailContent.html,
    });

    // Helper functions
    const extractEmail = (emailString: string): string => {
      if (!emailString) return '';
      const match = emailString.match(/<(.+?)>/);
      return match ? match[1].trim() : emailString.trim();
    };

    const extractName = (emailString: string, fallbackEmail: string): string => {
      if (!emailString) {
        // Use part before @ as fallback
        return fallbackEmail.split('@')[0] || 'Cliente';
      }
      // Try to extract "Name" from "Name <email>"
      const match = emailString.match(/^(.+?)\s*</);
      if (match && match[1].trim()) {
        return match[1].trim();
      }
      // No name found, use email prefix as fallback
      const email = extractEmail(emailString);
      return email.split('@')[0] || 'Cliente';
    };

    const customerEmail = extractEmail(emailContent.from);
    const customerName = extractName(emailContent.from, customerEmail);
    const content = emailContent.text || emailContent.html || '[Sem conteúdo]';
    const htmlBody = emailContent.html || null;
    const subject = emailContent.subject;
    const emailMessageId = messageIdFromWebhook || `<${emailId}@resend.dev>`;

    console.log('Step 6 - Dados parseados:', {
      customerEmail,
      customerName,
      subject,
      emailMessageId,
      contentLength: content.length,
      hasHtmlBody: !!htmlBody,
    });

    if (!customerEmail) {
      console.error('Step 6 - ERRO: E-mail do cliente não encontrado');
      return new Response(
        JSON.stringify({ error: 'No sender email found' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Step 7: Find or create ticket
    let ticketId: string | null = null;

    // Try threading first
    const headers = webhookData.headers || [];
    const inReplyTo = headers.find((h: { name: string }) => h.name?.toLowerCase() === 'in-reply-to')?.value;
    const references = headers.find((h: { name: string }) => h.name?.toLowerCase() === 'references')?.value;

    console.log('Step 7a - Headers de threading:', { inReplyTo, references });

    if (inReplyTo || references) {
      const referencedIds = [inReplyTo, ...(references?.split(/\s+/) || [])].filter(Boolean);
      
      if (referencedIds.length > 0) {
        const { data: referencedMessages } = await supabase
          .from('messages')
          .select('ticket_id')
          .in('email_message_id', referencedIds)
          .limit(1);

        if (referencedMessages && referencedMessages.length > 0) {
          ticketId = referencedMessages[0].ticket_id;
          console.log('Step 7a - Ticket encontrado por threading:', ticketId);
        }
      }
    }

    // Fallback: find by email
    if (!ticketId) {
      const { data: existingTicket } = await supabase
        .from('tickets')
        .select('id')
        .eq('customer_email', customerEmail)
        .eq('status', 'open')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (existingTicket) {
        ticketId = existingTicket.id;
        console.log('Step 7b - Ticket encontrado por e-mail:', ticketId);
      }
    }

    // Create new ticket if needed
    if (!ticketId) {
      const { data: newTicket, error: createError } = await supabase
        .from('tickets')
        .insert({
          customer_email: customerEmail,
          customer_name: customerName,
          subject: subject,
          status: 'open',
        })
        .select('id')
        .single();

      if (createError) {
        console.error('Step 8 - ERRO ao criar ticket:', createError);
        throw createError;
      }

      ticketId = newTicket.id;
      console.log('Step 8 - Novo ticket criado:', ticketId);
    }

    // Step 9: Insert message
    console.log('Step 9 - Inserindo mensagem:', {
      ticketId,
      emailId,
      emailMessageId,
      contentLength: content.length,
      hasHtml: !!htmlBody,
    });
    
    const { error: messageError } = await supabase
      .from('messages')
      .insert({
        ticket_id: ticketId,
        content: content,
        html_body: htmlBody,
        direction: 'inbound',
        sender_email: customerEmail,
        resend_email_id: emailId,
        email_message_id: emailMessageId,
      });

    if (messageError) {
      console.error('Step 9 - ERRO ao inserir mensagem:', messageError);
      throw messageError;
    }

    console.log('Step 9 - Mensagem inserida com sucesso!');
    console.log('=== PROCESS INBOUND EMAIL COMPLETE ===');

    return new Response(
      JSON.stringify({ success: true, ticketId, emailMessageId, hasContent: !!content }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('=== PROCESS INBOUND EMAIL ERROR ===', message);
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
