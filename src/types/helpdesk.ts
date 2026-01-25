export interface Ticket {
  id: string;
  status: 'open' | 'closed';
  customer_email: string;
  customer_name: string | null;
  subject: string;
  last_message_at: string;
  created_at: string;
}

export interface Message {
  id: string;
  ticket_id: string;
  content: string;
  html_body: string | null;
  direction: 'inbound' | 'outbound';
  sender_email: string;
  email_message_id: string | null;
  created_at: string;
}

export interface Settings {
  id: string;
  email_signature: string | null;
  resend_api_key_configured: boolean;
  created_at: string;
  updated_at: string;
}
