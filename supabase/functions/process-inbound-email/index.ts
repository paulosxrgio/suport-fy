import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ========================================
// HELPER: Strip quoted text from email replies
// ========================================
function stripQuotedText(text: string): string {
  if (!text) return '';
  
  const lines = text.split('\n');
  const cleanLines: string[] = [];
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    
    // A) Quoted message indicators (multi-language) - more flexible patterns
    // PT-BR: "Em dom., 25 de jan. de 2026 às 19:26, Nome <email> escreveu:"
    if (/^Em\s.+escreveu:/i.test(trimmed)) break;
    // EN: "On Mon, Jan 25, 2026 at 7:26 PM, Name <email> wrote:" - flexible match
    if (/^On\s.+wrote:/i.test(trimmed)) break;
    // FR: "Le 25 janv. 2026 à 19:26, Nom <email> a écrit :"
    if (/^Le\s.+a\s+écrit\s*:/i.test(trimmed)) break;
    // ES: "El 25 ene 2026 a las 19:26, Nombre <email> escribió:"
    if (/^El\s.+escribi[oó]:/i.test(trimmed)) break;
    // DE: "Am 25.01.2026 um 19:26 schrieb Name <email>:"
    if (/^Am\s.+schrieb/i.test(trimmed)) break;
    
    // B) Detect email-style quoted headers anywhere in line
    // Match patterns like "Name <email@domain.com> wrote:" anywhere
    if (/<[^>]+@[^>]+>\s*(wrote|escreveu|a écrit|escribió|schrieb)\s*:/i.test(trimmed)) break;
    
    // C) Classic forwarding/reply delimiters
    if (/^-{3,}\s*Original Message\s*-{3,}$/i.test(trimmed)) break;
    if (/^-{3,}\s*Mensagem Original\s*-{3,}$/i.test(trimmed)) break;
    if (/^-{5,}$/i.test(trimmed) && cleanLines.length > 0) break; // Generic separator
    if (/^From:\s/i.test(trimmed) && cleanLines.length > 0) break;
    if (/^De:\s/i.test(trimmed) && cleanLines.length > 0) break;
    if (/^Sent:\s/i.test(trimmed)) break;
    if (/^Enviado:\s/i.test(trimmed)) break;
    if (/^To:\s/i.test(trimmed) && cleanLines.length > 0) break;
    if (/^Para:\s/i.test(trimmed) && cleanLines.length > 0) break;
    if (/^Subject:\s/i.test(trimmed) && cleanLines.length > 0) break;
    if (/^Assunto:\s/i.test(trimmed) && cleanLines.length > 0) break;
    
    // D) Signature delimiters
    if (/^--\s*$/.test(trimmed)) break; // Standard email signature delimiter
    if (/^—\s*$/.test(trimmed)) break; // Em dash signature delimiter
    if (/^_{3,}$/.test(trimmed) && cleanLines.length > 0) break; // Underscores separator
    
    // E) Gmail blockquote indicator (lines starting with ">")
    if (trimmed.startsWith('>') && cleanLines.length > 0) {
      // Skip quoted lines but continue checking
      continue;
    }
    
    cleanLines.push(line);
  }
  
  // Trim trailing empty lines and return
  let result = cleanLines.join('\n');
  result = result.replace(/\n{3,}/g, '\n\n'); // Collapse multiple newlines
  result = result.trim();
  
  return result;
}

// Helper: Convert HTML to plain text for cleaning
function htmlToPlainText(html: string): string {
  if (!html) return '';
  
  let text = html;
  
  // Remove Gmail's quoted content div
  text = text.replace(/<div class="gmail_quote"[\s\S]*$/gi, '');
  text = text.replace(/<blockquote[\s\S]*?<\/blockquote>/gi, '');
  
  // Convert <br> and block elements to newlines
  text = text.replace(/<br\s*\/?>/gi, '\n');
  text = text.replace(/<\/p>/gi, '\n\n');
  text = text.replace(/<\/div>/gi, '\n');
  text = text.replace(/<\/li>/gi, '\n');
  
  // Remove all remaining HTML tags
  text = text.replace(/<[^>]+>/g, '');
  
  // Decode HTML entities
  text = text.replace(/&nbsp;/gi, ' ');
  text = text.replace(/&amp;/gi, '&');
  text = text.replace(/&lt;/gi, '<');
  text = text.replace(/&gt;/gi, '>');
  text = text.replace(/&quot;/gi, '"');
  text = text.replace(/&#39;/gi, "'");
  
  return text.trim();
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

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

      const { error: insertError } = await supabase
        .from('webhook_events')
        .insert({ svix_id: svixId, event_type: eventType });

      if (insertError) {
        if (insertError.code === '23505') {
          console.log('Step 2 - RACE CONDITION: outro worker já processando');
          return new Response(
            JSON.stringify({ ok: true, skipped: true, reason: 'Race condition' }),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        console.error('Step 2 - Erro ao registrar svix-id:', insertError);
      } else {
        console.log('Step 2 - svix-id registrado com sucesso');
      }
    }

    // ========================================
    // STEP 3: IDENTIFICAR LOJA PELO DOMÍNIO DO DESTINATÁRIO (ANTES de buscar conteúdo!)
    // ========================================
    const webhookData = rawPayload.data || rawPayload;
    const emailId = webhookData.email_id;
    const incomingMessageId = webhookData.message_id;
    const toAddresses = Array.isArray(webhookData.to) ? webhookData.to : [webhookData.to];
    
    console.log('Step 3 - Dados iniciais do webhook:', { 
      emailId, 
      incomingMessageId,
      from: webhookData.from,
      subject: webhookData.subject,
      to: toAddresses,
    });

    if (!emailId) {
      console.error('Step 3 - ERRO: email_id não encontrado no payload');
      return new Response(
        JSON.stringify({ error: 'No email_id found in webhook' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Helper para extrair email de string como "Nome <email@domain.com>"
    const extractEmail = (emailString: string): string => {
      if (!emailString) return '';
      const match = emailString.match(/<(.+?)>/);
      return match ? match[1].trim() : emailString.trim();
    };

    // Identificar loja pelo domínio do destinatário
    let storeId: string | null = null;
    let resendApiKey: string | null = null;
    
    for (const toAddr of toAddresses) {
      if (!toAddr) continue;
      const toEmail = extractEmail(toAddr);
      const domain = toEmail.split('@')[1];
      
      if (domain) {
        console.log('Step 3.1 - Buscando loja pelo domínio:', domain);
        
        const { data: store } = await supabase
          .from('stores')
          .select('id, resend_api_key')
          .eq('domain', domain)
          .maybeSingle();

        if (store) {
          storeId = store.id;
          resendApiKey = store.resend_api_key;
          console.log('Step 3.1 - Loja encontrada:', storeId, 'tem API key:', !!resendApiKey);
          break;
        }
      }
    }

    // Se encontrou loja mas não tem API key, tentar na tabela settings
    if (storeId && !resendApiKey) {
      console.log('Step 3.2 - Buscando API key na tabela settings...');
      const { data: settings } = await supabase
        .from('settings')
        .select('resend_api_key')
        .eq('store_id', storeId)
        .maybeSingle();
      
      if (settings?.resend_api_key) {
        resendApiKey = settings.resend_api_key;
        console.log('Step 3.2 - API key encontrada em settings');
      }
    }

    // Fallback para variável de ambiente
    if (!resendApiKey) {
      resendApiKey = Deno.env.get('RESEND_API_KEY') || null;
      if (resendApiKey) {
        console.log('Step 3.3 - Usando API key do ambiente (fallback)');
      }
    }

    if (!resendApiKey) {
      console.error('Step 3 - ERRO: Nenhuma Resend API key encontrada para esta loja');
      return new Response(
        JSON.stringify({ error: 'RESEND_API_KEY not configured for this store', storeId }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ========================================
    // STEP 4: BUSCAR CONTEÚDO COMPLETO DO E-MAIL (com API key correta)
    // ========================================
    console.log('Step 4 - Buscando conteúdo completo via Receiving API...');
    
    let emailFull: {
      from?: string;
      to?: string[];
      subject?: string;
      text?: string;
      html?: string;
    } | null = null;

    const emailResponse = await fetch(`https://api.resend.com/emails/receiving/${emailId}`, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${resendApiKey}` },
    });

    if (emailResponse.ok) {
      emailFull = await emailResponse.json();
      console.log('Step 4 - SUCESSO! E-mail completo baixado');
    } else {
      const errorBody = await emailResponse.text();
      console.error('Step 4 - ERRO ao buscar e-mail:', emailResponse.status, errorBody);
      // Continuar mesmo com erro - usar dados do webhook
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

    // Helper functions (extractEmail já definido acima)
    const capitalizeWords = (str: string): string => {
      return str.toLowerCase().split(' ')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
    };

    const nameFromEmailPrefix = (email: string): string => {
      const prefix = email.split('@')[0] || 'cliente';
      const cleaned = prefix.replace(/[._-]/g, ' ').trim();
      return capitalizeWords(cleaned);
    };

    const extractName = (emailString: string, fallbackEmail: string): string => {
      if (!emailString) return nameFromEmailPrefix(fallbackEmail);
      const match = emailString.match(/^(.+?)\s*</);
      if (match && match[1]) {
        let name = match[1].trim().replace(/^["']|["']$/g, '').trim();
        if (name.length > 0) return name;
      }
      return nameFromEmailPrefix(fallbackEmail);
    };

    const customerEmail = extractEmail(emailContent.from);
    const customerName = extractName(emailContent.from, customerEmail);
    
    // Clean quoted text from the email content
    let rawText = emailContent.text || '';
    if (!rawText && emailContent.html) {
      rawText = htmlToPlainText(emailContent.html);
    }
    const cleanedContent = stripQuotedText(rawText) || '[Sem conteúdo]';
    
    // Keep raw HTML for reference but use cleaned text for display
    const htmlBody = emailContent.html || null;
    const subject = emailContent.subject;
    const emailMessageId = incomingMessageId || `<${emailId}@resend.dev>`;

    console.log('Step 5 - Dados parseados:', {
      customerEmail,
      customerName,
      subject,
      emailMessageId,
      contentLength: cleanedContent.length,
      rawLength: rawText.length,
      storeId,
    });

    if (!customerEmail) {
      console.error('Step 5 - ERRO: E-mail do cliente não encontrado');
      return new Response(
        JSON.stringify({ error: 'No sender email found' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!storeId) {
      console.log('Step 5 - AVISO: Nenhuma loja encontrada pelo domínio, ticket sem store_id');
    }
    // ========================================
    // STEP 6: ENCONTRAR OU CRIAR TICKET COM THREADING (3 estratégias em cascata)
    // ========================================
    let ticketId: string | null = null;
    let existingReferences: string[] = [];
    let isNewTicket = false;
    let existingTicket: any = null;

    // Extrair headers de threading do webhook
    const headers = webhookData.headers || [];
    const inReplyTo = headers.find((h: { name: string }) => h.name?.toLowerCase() === 'in-reply-to')?.value;
    const incomingReferences = headers.find((h: { name: string }) => h.name?.toLowerCase() === 'references')?.value;

    console.log('Step 6 - Headers de threading:', { inReplyTo, incomingReferences });

    // ---- ESTRATÉGIA 1: Match pelo In-Reply-To/References ----
    if (inReplyTo || incomingReferences) {
      const messageIds = [inReplyTo, ...(incomingReferences || '').split(/\s+/)]
        .filter(Boolean)
        .map((id: string) => id.trim());

      if (messageIds.length > 0) {
        // 1a: Checar last_message_id na tabela tickets
        if (storeId) {
          const { data: threadMatch } = await supabase
            .from('tickets')
            .select('*')
            .eq('store_id', storeId)
            .in('last_message_id', messageIds)
            .maybeSingle();

          if (threadMatch) {
            existingTicket = threadMatch;
            console.log('Step 6a - ESTRATÉGIA 1 (last_message_id): Ticket encontrado:', threadMatch.id);
          }
        }

        // 1b: Fallback - checar email_message_id na tabela messages
        if (!existingTicket) {
          const { data: referencedMessages } = await supabase
            .from('messages')
            .select('ticket_id')
            .in('email_message_id', messageIds)
            .limit(1);

          if (referencedMessages && referencedMessages.length > 0) {
            const { data: ticketData } = await supabase
              .from('tickets')
              .select('*')
              .eq('id', referencedMessages[0].ticket_id)
              .single();

            if (ticketData) {
              existingTicket = ticketData;
              console.log('Step 6a - ESTRATÉGIA 1 (messages): Ticket encontrado:', ticketData.id);
            }
          }
        }
      }
    }

    // ---- ESTRATÉGIA 2: Match pelo subject limpo + email do cliente ----
    if (!existingTicket && storeId) {
      const cleanSubject = subject
        .replace(/^(Re|Fwd|Fw|Enc|Res):\s*/gi, '')
        .trim();

      if (cleanSubject.length > 0) {
        const { data: subjectMatch } = await supabase
          .from('tickets')
          .select('*')
          .eq('store_id', storeId)
          .eq('customer_email', customerEmail)
          .ilike('subject', `%${cleanSubject}%`)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (subjectMatch) {
          existingTicket = subjectMatch;
          console.log('Step 6b - ESTRATÉGIA 2 (subject): Ticket encontrado:', subjectMatch.id);
        }
      }
    }

    // ---- ESTRATÉGIA 3: Match pelo email do cliente com ticket aberto recente (72h) ----
    if (!existingTicket && storeId) {
      const seventyTwoHoursAgo = new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString();

      const { data: recentMatch } = await supabase
        .from('tickets')
        .select('*')
        .eq('store_id', storeId)
        .eq('customer_email', customerEmail)
        .eq('status', 'open')
        .gte('last_message_at', seventyTwoHoursAgo)
        .order('last_message_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (recentMatch) {
        existingTicket = recentMatch;
        console.log('Step 6c - ESTRATÉGIA 3 (recente 72h): Ticket encontrado:', recentMatch.id);
      }
    }

    // ---- Processar ticket encontrado ----
    if (existingTicket) {
      ticketId = existingTicket.id;
      existingReferences = existingTicket.references_chain || [];
      if (existingTicket.store_id) {
        storeId = existingTicket.store_id;
      }

      // Se o ticket existente estiver fechado, reabrir automaticamente
      if (existingTicket.status === 'closed') {
        await supabase
          .from('tickets')
          .update({ status: 'open' })
          .eq('id', ticketId);

        console.log('Step 6 - TICKET REOPENED:', ticketId);

        // Se a loja tiver IA ativa, colocar na fila de auto-reply
        if (storeId) {
          const { data: storeSettings } = await supabase
            .from('settings')
            .select('ai_is_active, ai_response_delay')
            .eq('store_id', storeId)
            .maybeSingle();

          if (storeSettings?.ai_is_active) {
            const delay = storeSettings.ai_response_delay || 10;
            const minDelay = 4;
            const randomDelay = Math.floor(Math.random() * (delay - minDelay + 1)) + minDelay;
            const scheduledFor = new Date(Date.now() + randomDelay * 60 * 1000).toISOString();

            await supabase.from('auto_reply_queue').insert({
              ticket_id: ticketId,
              store_id: storeId,
              scheduled_for: scheduledFor,
              status: 'pending',
            });

            console.log('Step 6 - AUTO-REPLY SCHEDULED FOR REOPENED TICKET:', scheduledFor);
          }
        }
      }
    } else {
      console.log('Step 6 - Nenhum ticket existente encontrado por nenhuma estratégia');
    }

    // Criar novo ticket se necessário
    if (!ticketId) {
      isNewTicket = true;
      const { data: newTicket, error: createError } = await supabase
        .from('tickets')
        .insert({
          customer_email: customerEmail,
          customer_name: customerName,
          subject: subject,
          thread_subject: subject, // Armazena o assunto original para threading
          last_message_id: emailMessageId,
          references_chain: [emailMessageId], // Inicia a cadeia de references
          status: 'open',
          is_read: false, // New tickets from inbound emails start as unread
          store_id: storeId,
        })
        .select('id')
        .single();

      if (createError) {
        console.error('Step 6c - ERRO ao criar ticket:', createError);
        throw createError;
      }

      ticketId = newTicket.id;
      console.log('Step 6c - Novo ticket criado com threading:', ticketId, 'store_id:', storeId);
    }

    // ========================================
    // STEP 7: ATUALIZAR THREADING DO TICKET (se não é novo)
    // ========================================
    if (!isNewTicket && ticketId) {
      // Adicionar o novo message_id à cadeia de references
      const updatedReferences = [...existingReferences];
      if (!updatedReferences.includes(emailMessageId)) {
        updatedReferences.push(emailMessageId);
      }

      const { error: updateError } = await supabase
        .from('tickets')
        .update({
          last_message_id: emailMessageId,
          references_chain: updatedReferences,
          is_read: false, // Mark as unread when new inbound message arrives
        })
        .eq('id', ticketId);

      if (updateError) {
        console.error('Step 7 - ERRO ao atualizar threading do ticket:', updateError);
      } else {
        console.log('Step 7 - Threading do ticket atualizado:', {
          ticketId,
          last_message_id: emailMessageId,
          references_count: updatedReferences.length,
          is_read: false,
        });
      }
    }

    // ========================================
    // STEP 8: INSERIR MENSAGEM
    // ========================================
    console.log('Step 8 - Inserindo mensagem:', {
      ticketId,
      emailId,
      emailMessageId,
      contentLength: cleanedContent.length,
      storeId,
    });
    
    const { error: messageError } = await supabase
      .from('messages')
      .insert({
        ticket_id: ticketId,
        content: cleanedContent,
        html_body: htmlBody,
        direction: 'inbound',
        sender_email: customerEmail,
        resend_email_id: emailId,
        email_message_id: emailMessageId,
        store_id: storeId,
      });

    if (messageError) {
      console.error('Step 8 - ERRO ao inserir mensagem:', messageError);
      throw messageError;
    }

    console.log('Step 8 - Mensagem inserida com sucesso!');

    // ========================================
    // STEP 9: ENFILEIRAR AUTO-RESPOSTA IA (apenas para tickets novos)
    // ========================================
    let queuedAutoReply = false;

    if (isNewTicket && storeId) {
      console.log('Step 9 - Verificando se IA está ativa para loja:', storeId);

      const { data: storeSettings } = await supabase
        .from('settings')
        .select('ai_is_active, ai_response_delay')
        .eq('store_id', storeId)
        .maybeSingle();

      if (storeSettings?.ai_is_active === true) {
        const maxDelay = storeSettings.ai_response_delay ?? 10;
        const minDelay = 4;
        // Random delay between minDelay and maxDelay minutes
        const delayMinutes = Math.floor(Math.random() * (Math.max(maxDelay, minDelay + 1) - minDelay + 1)) + minDelay;
        const scheduledFor = new Date(Date.now() + delayMinutes * 60 * 1000).toISOString();

        console.log('Step 9 - IA ativa! Enfileirando auto-resposta:', {
          delayMinutes,
          scheduledFor,
          maxDelay,
        });

        const { error: queueError } = await supabase
          .from('auto_reply_queue')
          .insert({
            ticket_id: ticketId,
            store_id: storeId,
            scheduled_for: scheduledFor,
            status: 'pending',
          });

        if (queueError) {
          console.error('Step 9 - ERRO ao enfileirar auto-resposta:', queueError);
        } else {
          queuedAutoReply = true;
          console.log('Step 9 - Auto-resposta enfileirada com sucesso!');
        }
      } else {
        console.log('Step 9 - IA não está ativa para esta loja, pulando auto-resposta');
      }
    } else {
      console.log('Step 9 - Não é ticket novo ou sem store_id, pulando auto-resposta');
    }

    console.log('=== PROCESS INBOUND EMAIL COMPLETE ===');

    return new Response(
      JSON.stringify({ 
        success: true, 
        ticketId, 
        emailMessageId, 
        isNewTicket,
        storeId,
        hasContent: !!cleanedContent,
        queuedAutoReply,
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
