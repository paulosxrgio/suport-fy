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

  // ========================================
  // STEP 0: RESPONDER 200 RÁPIDO (evitar retry)
  // Capturamos tudo que precisamos ANTES de processar
  // ========================================
  
  try {
    console.log('=== PROCESS INBOUND EMAIL START ===');
    
    // Capturar svix-id do header para deduplicação
    const svixId = req.headers.get('svix-id') || '';
    console.log('Step 0 - Svix-ID recebido:', svixId);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Parse webhook payload
    const rawPayload = await req.json();
    const eventType = rawPayload.type;
    
    console.log('Step 1 - Evento recebido:', { type: eventType, svixId });

    // ========================================
    // STEP 1: FILTRAR EVENTO - SÓ email.received
    // ========================================
    if (eventType !== 'email.received') {
      console.log('Step 1 - IGNORADO: Evento não é email.received, é:', eventType);
      return new Response(
        JSON.stringify({ ok: true, skipped: true, reason: 'Not email.received event' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ========================================
    // STEP 2: DEDUPLICAR PELO svix-id
    // ========================================
    if (svixId) {
      // Verificar se já processamos este webhook
      const { data: existingEvent } = await supabase
        .from('webhook_events')
        .select('id')
        .eq('svix_id', svixId)
        .maybeSingle();

      if (existingEvent) {
        console.log('Step 2 - DUPLICADO: svix-id já processado:', svixId);
        return new Response(
          JSON.stringify({ ok: true, skipped: true, reason: 'Duplicate webhook (svix-id)' }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Registrar svix-id ANTES de processar (evita race condition)
      const { error: insertError } = await supabase
        .from('webhook_events')
        .insert({ svix_id: svixId, event_type: eventType });

      if (insertError) {
        // Se falhou por unique constraint, outro worker já está processando
        if (insertError.code === '23505') {
          console.log('Step 2 - RACE CONDITION: outro worker já processando');
          return new Response(
            JSON.stringify({ ok: true, skipped: true, reason: 'Race condition - already processing' }),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        console.error('Step 2 - Erro ao registrar svix-id:', insertError);
      } else {
        console.log('Step 2 - svix-id registrado com sucesso');
      }
    } else {
      console.log('Step 2 - AVISO: Webhook sem svix-id header');
    }

    // ========================================
    // STEP 3: BUSCAR API KEY DO RESEND
    // ========================================
    const { data: settings } = await supabase
      .from('settings')
      .select('resend_api_key')
      .limit(1)
      .maybeSingle();

    const resendApiKey = settings?.resend_api_key || Deno.env.get('RESEND_API_KEY');
    
    if (!resendApiKey) {
      console.error('Step 3 - ERRO: Resend API key não configurada');
      return new Response(
        JSON.stringify({ error: 'RESEND_API_KEY not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    console.log('Step 3 - Resend API key encontrada');

    // ========================================
    // STEP 4: EXTRAIR email_id E BUSCAR CONTEÚDO COMPLETO
    // (Receiving API - a forma CORRETA segundo a documentação)
    // ========================================
    const webhookData = rawPayload.data || rawPayload;
    const emailId = webhookData.email_id;
    const messageIdFromWebhook = webhookData.message_id;
    
    console.log('Step 4 - IDs extraídos:', { 
      emailId, 
      messageIdFromWebhook,
      from: webhookData.from,
      subject: webhookData.subject
    });

    if (!emailId) {
      console.error('Step 4 - ERRO: email_id não encontrado no payload');
      return new Response(
        JSON.stringify({ error: 'No email_id found in webhook' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // BUSCAR CONTEÚDO COMPLETO via Receiving API do Resend
    console.log('Step 4.1 - Buscando conteúdo completo via Receiving API...');
    
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
      console.log('Step 4.1 - SUCESSO! E-mail completo baixado');
      console.log('Step 4.1 - Detalhes:', {
        from: emailFull?.from,
        subject: emailFull?.subject,
        textLength: emailFull?.text?.length || 0,
        htmlLength: emailFull?.html?.length || 0,
      });
    } else {
      const errorBody = await emailResponse.text();
      console.error('Step 4.1 - ERRO ao buscar e-mail via Receiving API:', emailResponse.status, errorBody);
    }

    // ========================================
    // STEP 5: PREPARAR DADOS DO E-MAIL
    // ========================================
    const emailContent = {
      from: emailFull?.from || webhookData.from,
      to: emailFull?.to || webhookData.to,
      subject: emailFull?.subject || webhookData.subject || 'Sem assunto',
      text: emailFull?.text || '',
      html: emailFull?.html || '',
    };

    // Helper functions
    const extractEmail = (emailString: string): string => {
      if (!emailString) return '';
      const match = emailString.match(/<(.+?)>/);
      return match ? match[1].trim() : emailString.trim();
    };

    const capitalizeWords = (str: string): string => {
      return str
        .toLowerCase()
        .split(' ')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
    };

    const nameFromEmailPrefix = (email: string): string => {
      const prefix = email.split('@')[0] || 'cliente';
      const cleaned = prefix.replace(/[._-]/g, ' ').trim();
      return capitalizeWords(cleaned);
    };

    const extractName = (emailString: string, fallbackEmail: string): string => {
      if (!emailString) {
        return nameFromEmailPrefix(fallbackEmail);
      }

      const match = emailString.match(/^(.+?)\s*</);
      
      if (match && match[1]) {
        let name = match[1].trim();
        name = name.replace(/^["']|["']$/g, '');
        name = name.trim();
        
        if (name.length > 0) {
          console.log('Nome extraído do header:', name);
          return name;
        }
      }

      console.log('Usando fallback do e-mail para nome');
      return nameFromEmailPrefix(fallbackEmail);
    };

    const customerEmail = extractEmail(emailContent.from);
    const customerName = extractName(emailContent.from, customerEmail);
    const content = emailContent.text || emailContent.html || '[Sem conteúdo]';
    const htmlBody = emailContent.html || null;
    const subject = emailContent.subject;
    const emailMessageId = messageIdFromWebhook || `<${emailId}@resend.dev>`;

    console.log('Step 5 - Dados parseados:', {
      customerEmail,
      customerName,
      subject,
      emailMessageId,
      contentLength: content.length,
      hasHtmlBody: !!htmlBody,
    });

    if (!customerEmail) {
      console.error('Step 5 - ERRO: E-mail do cliente não encontrado');
      return new Response(
        JSON.stringify({ error: 'No sender email found' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ========================================
    // STEP 6: ENCONTRAR OU CRIAR TICKET
    // ========================================
    let ticketId: string | null = null;

    // Tentar threading primeiro usando headers
    const headers = webhookData.headers || [];
    const inReplyTo = headers.find((h: { name: string }) => h.name?.toLowerCase() === 'in-reply-to')?.value;
    const references = headers.find((h: { name: string }) => h.name?.toLowerCase() === 'references')?.value;

    console.log('Step 6a - Headers de threading:', { inReplyTo, references });

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
          console.log('Step 6a - Ticket encontrado por threading:', ticketId);
        }
      }
    }

    // Fallback: buscar por e-mail do cliente
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
        console.log('Step 6b - Ticket encontrado por e-mail:', ticketId);
      }
    }

    // Criar novo ticket se necessário
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
        console.error('Step 6c - ERRO ao criar ticket:', createError);
        throw createError;
      }

      ticketId = newTicket.id;
      console.log('Step 6c - Novo ticket criado:', ticketId);
    }

    // ========================================
    // STEP 7: INSERIR MENSAGEM
    // ========================================
    console.log('Step 7 - Inserindo mensagem:', {
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
      console.error('Step 7 - ERRO ao inserir mensagem:', messageError);
      throw messageError;
    }

    console.log('Step 7 - Mensagem inserida com sucesso!');
    console.log('=== PROCESS INBOUND EMAIL COMPLETE ===');

    return new Response(
      JSON.stringify({ 
        success: true, 
        ticketId, 
        emailMessageId, 
        hasContent: !!content,
        dedupedBy: svixId ? 'svix-id' : 'none'
      }),
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
