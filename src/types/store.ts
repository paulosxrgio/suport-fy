export interface Store {
  id: string;
  user_id: string;
  name: string;
  domain: string;
  sender_name: string | null;
  sender_email: string | null;
  email_signature: string | null;
  resend_api_key: string | null;
  resend_api_key_configured: boolean;
  openai_api_key: string | null;
  ai_system_prompt: string | null;
  ai_model: string | null;
  ai_response_delay: number | null;
  ai_is_active: boolean;
  created_at: string;
  updated_at: string;
}
