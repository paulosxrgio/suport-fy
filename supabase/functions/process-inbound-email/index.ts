import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('=== PROCESS INBOUND EMAIL START ===');
    
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Step 1: Parse the webhook payload from Resend
    const rawPayload = await req.json();
    console.log('Step 1 - Raw webhook payload:', JSON.stringify(rawPayload, null, 2));

    // Get Resend API key from settings
    const { data: settings, error: settingsError } = await supabase
      .from('settings')
      .select('resend_api_key')
      .limit(1)
      .maybeSingle();

    if (settingsError) {
      console.error('Step 2 - Error fetching settings:', settingsError);
    }

    const resendApiKey = settings?.resend_api_key || Deno.env.get('RESEND_API_KEY');
    
    if (!resendApiKey) {
      console.error('Step 2 - No Resend API key configured');
      return new Response(
        JSON.stringify({ error: 'RESEND_API_KEY not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Step 2 - Resend API key found');

    // Step 3: Extract data from webhook
    const webhookData = rawPayload.data || rawPayload;
    const resendEmailId = webhookData.email_id;
    // IMPORTANT: The webhook provides message_id which is the actual Message-ID header for threading
    const messageIdFromWebhook = webhookData.message_id;
    
    console.log('Step 3 - Extracted IDs:', { 
      resendEmailId, 
      messageIdFromWebhook,
      from: webhookData.from,
      subject: webhookData.subject
    });

    if (!resendEmailId) {
      console.error('Step 3 - No email_id in webhook payload');
      return new Response(
        JSON.stringify({ error: 'No email_id found in webhook' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Step 4: Fetch full email content using Resend RECEIVING API
    // The correct endpoint for inbound emails is /emails/receiving/{email_id}
    console.log('Step 4 - Fetching full email content from Resend Receiving API...');
    
    const emailResponse = await fetch(`https://api.resend.com/emails/receiving/${resendEmailId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
    });

    let emailContent: {
      from: string;
      to: string[];
      subject: string;
      text: string;
      html: string;
    };

    if (emailResponse.ok) {
      const fullEmail = await emailResponse.json();
      console.log('Step 4 - SUCCESS! Full email fetched:', JSON.stringify({
        from: fullEmail.from,
        subject: fullEmail.subject,
        hasText: !!fullEmail.text,
        hasHtml: !!fullEmail.html,
        textLength: fullEmail.text?.length || 0,
        htmlLength: fullEmail.html?.length || 0,
      }, null, 2));
      
      emailContent = {
        from: fullEmail.from || webhookData.from,
        to: fullEmail.to || webhookData.to,
        subject: fullEmail.subject || webhookData.subject,
        text: fullEmail.text || '',
        html: fullEmail.html || '',
      };
    } else {
      const errorText = await emailResponse.text();
      console.error('Step 4 - Failed to fetch email from Resend:', emailResponse.status, errorText);
      console.log('Step 4 - Falling back to webhook metadata (no body content available)');
      
      // Fallback to webhook data - but there's no body content in webhook
      emailContent = {
        from: webhookData.from,
        to: webhookData.to,
        subject: webhookData.subject,
        text: '[Conteúdo do e-mail não disponível - erro ao buscar do Resend]',
        html: '',
      };
    }

    console.log('Step 5 - Email content prepared:', {
      from: emailContent.from,
      to: emailContent.to,
      subject: emailContent.subject,
      hasText: !!emailContent.text,
      hasHtml: !!emailContent.html,
      textPreview: emailContent.text?.substring(0, 100) || '',
    });

    // Helper functions
    const extractEmail = (emailString: string): string => {
      if (!emailString) return '';
      const match = emailString.match(/<(.+?)>/);
      return match ? match[1] : emailString.trim();
    };

    const extractName = (emailString: string): string | null => {
      if (!emailString) return null;
      const match = emailString.match(/^(.+?)\s*</);
      return match ? match[1].trim() : null;
    };

    const customerEmail = extractEmail(emailContent.from);
    const customerName = extractName(emailContent.from);
    const content = emailContent.text || emailContent.html || '';
    const htmlBody = emailContent.html || null;
    const subject = emailContent.subject || 'Sem assunto';
    
    // Use the message_id from webhook for threading - this is the real Message-ID header
    const emailMessageId = messageIdFromWebhook || `<${resendEmailId}@resend.dev>`;

    console.log('Step 6 - Parsed email data:', {
      customerEmail,
      customerName,
      subject,
      resendEmailId,
      emailMessageId,
      contentLength: content.length,
      hasHtmlBody: !!htmlBody,
    });

    if (!customerEmail) {
      console.error('Step 6 - No customer email found');
      return new Response(
        JSON.stringify({ error: 'No sender email found' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let ticketId: string | null = null;

    // Step 7a: Try to find ticket by threading (check if this is a reply)
    // Extract In-Reply-To and References from webhook if available
    const headers = webhookData.headers || [];
    const inReplyTo = headers.find((h: { name: string }) => h.name?.toLowerCase() === 'in-reply-to')?.value;
    const references = headers.find((h: { name: string }) => h.name?.toLowerCase() === 'references')?.value;

    console.log('Step 7a - Threading headers:', { inReplyTo, references });

    if (inReplyTo || references) {
      const referencedIds = [inReplyTo, ...(references?.split(/\s+/) || [])].filter(Boolean);
      
      console.log('Step 7a - Looking for ticket by referenced message IDs:', referencedIds);

      if (referencedIds.length > 0) {
        const { data: referencedMessages, error: refError } = await supabase
          .from('messages')
          .select('ticket_id')
          .in('email_message_id', referencedIds)
          .limit(1);

        if (!refError && referencedMessages && referencedMessages.length > 0) {
          ticketId = referencedMessages[0].ticket_id;
          console.log('Step 7a - Found ticket by threading headers:', ticketId);
        } else {
          console.log('Step 7a - No ticket found by threading headers');
        }
      }
    }

    // Step 7b: Fallback - find by customer email and open status
    if (!ticketId) {
      console.log('Step 7b - Looking for ticket by customer email:', customerEmail);
      
      const { data: existingTicket, error: ticketQueryError } = await supabase
        .from('tickets')
        .select('id')
        .eq('customer_email', customerEmail)
        .eq('status', 'open')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (ticketQueryError) {
        console.error('Step 7b - Error querying tickets:', ticketQueryError);
        throw ticketQueryError;
      }

      if (existingTicket) {
        ticketId = existingTicket.id;
        console.log('Step 7b - Found ticket by customer email:', ticketId);
      } else {
        console.log('Step 7b - No existing open ticket found');
      }
    }

    // Step 8: Create new ticket if none found
    if (!ticketId) {
      console.log('Step 8 - Creating new ticket...');
      
      const { data: newTicket, error: createTicketError } = await supabase
        .from('tickets')
        .insert({
          customer_email: customerEmail,
          customer_name: customerName,
          subject: subject,
          status: 'open',
        })
        .select('id')
        .single();

      if (createTicketError) {
        console.error('Step 8 - Error creating ticket:', createTicketError);
        throw createTicketError;
      }

      ticketId = newTicket.id;
      console.log('Step 8 - Created new ticket:', ticketId);
    }

    // Step 9: Add the message with all IDs for threading
    console.log('Step 9 - Inserting message:', {
      ticketId,
      resendEmailId,
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
        resend_email_id: resendEmailId,
        email_message_id: emailMessageId,
      });

    if (messageError) {
      console.error('Step 9 - Error creating message:', messageError);
      throw messageError;
    }

    console.log('Step 9 - Message added successfully');
    console.log('=== PROCESS INBOUND EMAIL COMPLETE ===');

    return new Response(
      JSON.stringify({ success: true, ticketId, emailMessageId }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
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
