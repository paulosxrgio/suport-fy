import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Resend inbound email webhook payload structure
interface ResendInboundPayload {
  type: string;
  created_at: string;
  data: {
    from: string;
    to: string[];
    subject: string;
    text?: string;
    html?: string;
    headers?: Array<{ name: string; value: string }>;
    message_id?: string;
  };
}

serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Parse the inbound email payload from Resend
    const rawPayload = await req.json();
    console.log('Raw payload received:', JSON.stringify(rawPayload, null, 2));

    // Resend webhook has the data nested under 'data' property
    const payload = rawPayload.data || rawPayload;
    
    console.log('Received inbound email:', {
      from: payload.from,
      to: payload.to,
      subject: payload.subject,
      message_id: payload.message_id,
    });

    // Extract email address from "Name <email@example.com>" format
    const extractEmail = (emailString: string): string => {
      if (!emailString) return '';
      const match = emailString.match(/<(.+?)>/);
      return match ? match[1] : emailString.trim();
    };

    // Extract name from "Name <email@example.com>" format
    const extractName = (emailString: string): string | null => {
      if (!emailString) return null;
      const match = emailString.match(/^(.+?)\s*</);
      return match ? match[1].trim() : null;
    };

    // Get specific header value from headers array
    const getHeader = (headers: Array<{ name: string; value: string }> | undefined, name: string): string | null => {
      if (!headers) return null;
      const header = headers.find(h => h.name.toLowerCase() === name.toLowerCase());
      return header?.value || null;
    };

    const customerEmail = extractEmail(payload.from);
    const customerName = extractName(payload.from);
    const content = payload.text || payload.html || '';
    const subject = payload.subject || 'Sem assunto';
    
    // Extract threading headers
    const messageId = payload.message_id || getHeader(payload.headers, 'Message-ID');
    const inReplyTo = getHeader(payload.headers, 'In-Reply-To');
    const references = getHeader(payload.headers, 'References');

    console.log('Threading headers:', { messageId, inReplyTo, references });

    if (!customerEmail) {
      console.error('No customer email found in payload');
      return new Response(
        JSON.stringify({ error: 'No sender email found' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let ticketId: string | null = null;

    // First, try to find ticket by threading headers (In-Reply-To or References)
    if (inReplyTo || references) {
      const referencedIds = [inReplyTo, ...(references?.split(/\s+/) || [])].filter(Boolean);
      
      console.log('Looking for ticket by referenced message IDs:', referencedIds);

      if (referencedIds.length > 0) {
        // Find messages that match any of the referenced message IDs
        const { data: referencedMessages, error: refError } = await supabase
          .from('messages')
          .select('ticket_id')
          .in('email_message_id', referencedIds)
          .limit(1);

        if (!refError && referencedMessages && referencedMessages.length > 0) {
          ticketId = referencedMessages[0].ticket_id;
          console.log('Found ticket by threading headers:', ticketId);
        }
      }
    }

    // Fallback: find by customer email and open status
    if (!ticketId) {
      const { data: existingTicket, error: ticketQueryError } = await supabase
        .from('tickets')
        .select('id')
        .eq('customer_email', customerEmail)
        .eq('status', 'open')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (ticketQueryError) {
        console.error('Error querying tickets:', ticketQueryError);
        throw ticketQueryError;
      }

      if (existingTicket) {
        ticketId = existingTicket.id;
        console.log('Found ticket by customer email:', ticketId);
      }
    }

    // Create new ticket if none found
    if (!ticketId) {
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
        console.error('Error creating ticket:', createTicketError);
        throw createTicketError;
      }

      ticketId = newTicket.id;
      console.log('Created new ticket:', ticketId);
    }

    // Add the message with email_message_id for threading
    const { error: messageError } = await supabase
      .from('messages')
      .insert({
        ticket_id: ticketId,
        content: content,
        html_body: payload.html,
        direction: 'inbound',
        sender_email: customerEmail,
        email_message_id: messageId,
      });

    if (messageError) {
      console.error('Error creating message:', messageError);
      throw messageError;
    }

    console.log('Message added successfully with message_id:', messageId);

    return new Response(
      JSON.stringify({ success: true, ticketId }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('Error processing inbound email:', message);
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
