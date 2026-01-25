import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface InboundEmailPayload {
  from: string;
  to: string;
  subject: string;
  text?: string;
  html?: string;
  headers?: Record<string, string>;
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
    const payload: InboundEmailPayload = await req.json();
    
    console.log('Received inbound email:', {
      from: payload.from,
      to: payload.to,
      subject: payload.subject,
    });

    // Extract email address from "Name <email@example.com>" format
    const extractEmail = (emailString: string): string => {
      const match = emailString.match(/<(.+?)>/);
      return match ? match[1] : emailString;
    };

    // Extract name from "Name <email@example.com>" format
    const extractName = (emailString: string): string | null => {
      const match = emailString.match(/^(.+?)\s*</);
      return match ? match[1].trim() : null;
    };

    const customerEmail = extractEmail(payload.from);
    const customerName = extractName(payload.from);
    const content = payload.text || payload.html || '';
    const subject = payload.subject || 'Sem assunto';

    // Check if there's an existing open ticket from this customer
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

    let ticketId: string;

    if (existingTicket) {
      // Add message to existing ticket
      ticketId = existingTicket.id;
      console.log('Adding message to existing ticket:', ticketId);
    } else {
      // Create new ticket
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

    // Add the message
    const { error: messageError } = await supabase
      .from('messages')
      .insert({
        ticket_id: ticketId,
        content: content,
        html_body: payload.html,
        direction: 'inbound',
        sender_email: customerEmail,
      });

    if (messageError) {
      console.error('Error creating message:', messageError);
      throw messageError;
    }

    console.log('Message added successfully');

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
