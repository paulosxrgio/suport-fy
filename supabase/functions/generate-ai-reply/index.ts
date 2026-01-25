import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { ticketId, lastMessageContent } = await req.json();

    if (!ticketId) {
      return new Response(
        JSON.stringify({ error: "ticketId is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Fetch settings
    const { data: settings, error: settingsError } = await supabase
      .from("settings")
      .select("openai_api_key, ai_system_prompt, ai_model")
      .single();

    if (settingsError) {
      console.error("Error fetching settings:", settingsError);
      return new Response(
        JSON.stringify({ error: "Failed to fetch settings" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!settings?.openai_api_key) {
      return new Response(
        JSON.stringify({ error: "OpenAI API key not configured. Please configure it in AI Agent settings." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch ticket info
    const { data: ticket, error: ticketError } = await supabase
      .from("tickets")
      .select("subject, customer_name, customer_email")
      .eq("id", ticketId)
      .single();

    if (ticketError) {
      console.error("Error fetching ticket:", ticketError);
      return new Response(
        JSON.stringify({ error: "Ticket not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch last 3 messages for context
    const { data: messages, error: messagesError } = await supabase
      .from("messages")
      .select("content, direction, created_at")
      .eq("ticket_id", ticketId)
      .order("created_at", { ascending: false })
      .limit(3);

    if (messagesError) {
      console.error("Error fetching messages:", messagesError);
      return new Response(
        JSON.stringify({ error: "Failed to fetch message history" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Build conversation history for context
    const conversationHistory = messages
      ?.reverse()
      .map((msg) => {
        const role = msg.direction === "inbound" ? "Cliente" : "Atendente";
        return `${role}: ${msg.content}`;
      })
      .join("\n\n");

    // Build the system prompt
    const defaultSystemPrompt = `Você é um assistente de suporte ao cliente profissional e amigável. 
Responda de forma clara, educada e útil. Mantenha as respostas concisas mas completas.`;

    const systemPrompt = settings.ai_system_prompt || defaultSystemPrompt;

    // Build the user message with context
    const userMessage = `Contexto do Ticket:
- Assunto: ${ticket.subject}
- Cliente: ${ticket.customer_name || ticket.customer_email}

Histórico da Conversa:
${conversationHistory || "Nenhuma mensagem anterior."}

${lastMessageContent ? `Última mensagem do cliente: ${lastMessageContent}` : ""}

Por favor, gere uma resposta profissional e útil para o cliente.`;

    // Call OpenAI API
    const model = settings.ai_model || "gpt-4o";
    
    console.log(`Calling OpenAI API with model: ${model}`);

    const openaiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${settings.openai_api_key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMessage },
        ],
        max_tokens: 500,
        temperature: 0.7,
      }),
    });

    if (!openaiResponse.ok) {
      const errorText = await openaiResponse.text();
      console.error("OpenAI API error:", openaiResponse.status, errorText);
      
      if (openaiResponse.status === 401) {
        return new Response(
          JSON.stringify({ error: "Invalid OpenAI API key. Please check your configuration." }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      return new Response(
        JSON.stringify({ error: "Failed to generate AI response" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const openaiData = await openaiResponse.json();
    const suggestedReply = openaiData.choices?.[0]?.message?.content?.trim();

    if (!suggestedReply) {
      return new Response(
        JSON.stringify({ error: "No response generated" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("AI reply generated successfully");

    return new Response(
      JSON.stringify({ reply: suggestedReply }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: unknown) {
    console.error("Error in generate-ai-reply:", error);
    const message = error instanceof Error ? error.message : "Internal server error";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
