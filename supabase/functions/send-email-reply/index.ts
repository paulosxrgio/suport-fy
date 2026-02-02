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

    // Fetch ticket details including store_id and threading info
    const { data: ticket, error: ticketError } = await supabase
      .from('tickets')
      .select('id, customer_email, subject, thread_subject, last_message_id, references_chain, store_id')
      .eq('id', ticketId)
      .single();

    if (ticketError || !ticket) {
      console.error('Step 2 - Ticket error:', ticketError);
      throw new Error('Ticket não encontrado');
    }

    console.log('Step 2 - Ticket encontrado:', { 
      id: ticket.id, 
      customer_email: ticket.customer_email,
      store_id: ticket.store_id,
      thread_subject: ticket.thread_subject,
    });

    // Fetch store settings if store_id exists, otherwise fallback to global settings
    let senderName = 'Suporte';
    let senderEmail = 'suporte@exemplo.com';
    let emailSignature: string | null = null;
    let resendApiKey: string | null = null;

    if (ticket.store_id) {
      const { data: store, error: storeError } = await supabase
        .from('stores')
        .select('sender_name, sender_email, email_signature, resend_api_key')
        .eq('id', ticket.store_id)
        .single();

      if (!storeError && store) {
        senderName = store.sender_name || senderName;
        senderEmail = store.sender_email || senderEmail;
        emailSignature = store.email_signature;
        resendApiKey = store.resend_api_key;
        console.log('Step 3 - Store settings loaded:', { senderName, senderEmail });
      }
    }

    // Fallback to global settings if no store or no API key
    if (!resendApiKey) {
      const { data: settings } = await supabase
        .from('settings')
        .select('*')
        .limit(1)
        .maybeSingle();

      if (settings) {
        senderName = settings.sender_name || senderName;
        senderEmail = settings.sender_email || senderEmail;
        emailSignature = settings.email_signature || emailSignature;
        resendApiKey = settings.resend_api_key;
        console.log('Step 3 - Fallback to global settings');
      }
    }

    // Final fallback to env variable
    if (!resendApiKey) {
      resendApiKey = Deno.env.get('RESEND_API_KEY') || null;
    }
    
    if (!resendApiKey) {
      return new Response(
        JSON.stringify({ error: 'RESEND_API_KEY não configurada. Configure nas Configurações da Loja ou como variável de ambiente.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Step 3 - Settings carregadas');

    const resend = new Resend(resendApiKey);

    // Build sender identity
    const fromAddress = `${senderName} <${senderEmail}>`;

    // Append signature if configured
    const fullContent = emailSignature 
      ? `${content}\n\n${emailSignature}` 
      : content;

    // ========================================
    // THREADING CORRETO (Padrão RFC 2822)
    // ========================================
    
    // 1) Usar o thread_subject original (ou subject se não existir)
    const originalSubject = ticket.thread_subject || ticket.subject;
    let emailSubject = originalSubject;
    
    // Adicionar "Re: " apenas se ainda não tiver
    if (!emailSubject.toLowerCase().startsWith('re:')) {
      emailSubject = `Re: ${emailSubject}`;
    }
    
    console.log('Step 4 - Subject para threading:', { 
      original: originalSubject, 
      final: emailSubject 
    });

    // 2) In-Reply-To: aponta para o ÚLTIMO message_id (a mensagem que estamos respondendo)
    const inReplyTo = ticket.last_message_id;
    
    // 3) References: toda a cadeia de message_ids anteriores (espaço-separada)
    const references = ticket.references_chain?.join(' ') || '';
    
    console.log('Step 4.1 - Threading headers:', { 
      'In-Reply-To': inReplyTo,
      'References': references,
      'References count': ticket.references_chain?.length || 0,
    });

    // Build email headers
    const emailHeaders: Record<string, string> = {};
    
    if (inReplyTo) {
      emailHeaders['In-Reply-To'] = inReplyTo;
    }
    
    if (references) {
      emailHeaders['References'] = references;
    }

    // Generate Idempotency Key to prevent duplicate sends
    const idempotencyKey = `reply-${ticketId}-${Date.now()}`;
    emailHeaders['Idempotency-Key'] = idempotencyKey;
    
    console.log('Step 4.2 - Idempotency Key:', idempotencyKey);

    // Convert plain text to simple HTML (preserving line breaks)
    const htmlContent = `<p>${fullContent.replace(/\n/g, '<br>')}</p>`;

    // Build the complete email payload
    const emailPayload = {
      from: fromAddress,
      to: [ticket.customer_email],
      subject: emailSubject,
      html: htmlContent,
      text: fullContent,
      headers: emailHeaders,
    };

    console.log('Step 5 - Payload COMPLETO do Resend:', JSON.stringify(emailPayload, null, 2));

    // Send email via Resend
    const emailResult = await resend.emails.send(emailPayload);

    console.log('Step 6 - Email enviado:', emailResult);

    // Extract the message ID from the response
    const sentMessageId = emailResult.data?.id ? `<${emailResult.data.id}@resend.dev>` : null;

    // Save outbound message to database
    console.log('Step 7 - Salvando mensagem no banco');

    const { data: insertedMessage, error: insertError } = await supabase
      .from('messages')
      .insert({
        ticket_id: ticketId,
        content: content,
        direction: 'outbound',
        sender_email: senderEmail,
        email_message_id: sentMessageId,
        store_id: ticket.store_id,
      })
      .select()
      .single();

    if (insertError) {
      console.error('Step 7 - ERRO ao inserir mensagem:', insertError);
      throw new Error(`Erro ao salvar mensagem: ${insertError.message}`);
    }

    // ========================================
    // STEP 8: ATUALIZAR THREADING DO TICKET
    // Adicionar o message_id da nossa resposta à cadeia
    // ========================================
    if (sentMessageId) {
      const updatedReferences = [...(ticket.references_chain || [])];
      if (!updatedReferences.includes(sentMessageId)) {
        updatedReferences.push(sentMessageId);
      }

      const { error: updateError } = await supabase
        .from('tickets')
        .update({
          last_message_id: sentMessageId,
          references_chain: updatedReferences,
        })
        .eq('id', ticketId);

      if (updateError) {
        console.error('Step 8 - ERRO ao atualizar threading:', updateError);
      } else {
        console.log('Step 8 - Threading atualizado:', {
          last_message_id: sentMessageId,
          references_count: updatedReferences.length,
        });
      }
    }

    console.log('Step 9 - Mensagem salva com sucesso:', { 
      id: insertedMessage?.id,
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
