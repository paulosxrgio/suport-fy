export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      messages: {
        Row: {
          content: string
          created_at: string
          direction: string
          email_message_id: string | null
          html_body: string | null
          id: string
          resend_email_id: string | null
          sender_email: string
          store_id: string | null
          ticket_id: string
        }
        Insert: {
          content: string
          created_at?: string
          direction: string
          email_message_id?: string | null
          html_body?: string | null
          id?: string
          resend_email_id?: string | null
          sender_email: string
          store_id?: string | null
          ticket_id: string
        }
        Update: {
          content?: string
          created_at?: string
          direction?: string
          email_message_id?: string | null
          html_body?: string | null
          id?: string
          resend_email_id?: string | null
          sender_email?: string
          store_id?: string | null
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      settings: {
        Row: {
          ai_is_active: boolean | null
          ai_model: string | null
          ai_response_delay: number | null
          ai_system_prompt: string | null
          created_at: string
          email_signature: string | null
          id: string
          openai_api_key: string | null
          resend_api_key: string | null
          resend_api_key_configured: boolean | null
          sender_email: string | null
          sender_name: string | null
          store_id: string | null
          updated_at: string
        }
        Insert: {
          ai_is_active?: boolean | null
          ai_model?: string | null
          ai_response_delay?: number | null
          ai_system_prompt?: string | null
          created_at?: string
          email_signature?: string | null
          id?: string
          openai_api_key?: string | null
          resend_api_key?: string | null
          resend_api_key_configured?: boolean | null
          sender_email?: string | null
          sender_name?: string | null
          store_id?: string | null
          updated_at?: string
        }
        Update: {
          ai_is_active?: boolean | null
          ai_model?: string | null
          ai_response_delay?: number | null
          ai_system_prompt?: string | null
          created_at?: string
          email_signature?: string | null
          id?: string
          openai_api_key?: string | null
          resend_api_key?: string | null
          resend_api_key_configured?: boolean | null
          sender_email?: string | null
          sender_name?: string | null
          store_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "settings_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: true
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      stores: {
        Row: {
          ai_is_active: boolean | null
          ai_model: string | null
          ai_response_delay: number | null
          ai_system_prompt: string | null
          created_at: string
          domain: string
          email_signature: string | null
          id: string
          name: string
          openai_api_key: string | null
          resend_api_key: string | null
          resend_api_key_configured: boolean | null
          sender_email: string | null
          sender_name: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          ai_is_active?: boolean | null
          ai_model?: string | null
          ai_response_delay?: number | null
          ai_system_prompt?: string | null
          created_at?: string
          domain: string
          email_signature?: string | null
          id?: string
          name: string
          openai_api_key?: string | null
          resend_api_key?: string | null
          resend_api_key_configured?: boolean | null
          sender_email?: string | null
          sender_name?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          ai_is_active?: boolean | null
          ai_model?: string | null
          ai_response_delay?: number | null
          ai_system_prompt?: string | null
          created_at?: string
          domain?: string
          email_signature?: string | null
          id?: string
          name?: string
          openai_api_key?: string | null
          resend_api_key?: string | null
          resend_api_key_configured?: boolean | null
          sender_email?: string | null
          sender_name?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      tickets: {
        Row: {
          created_at: string
          customer_email: string
          customer_name: string | null
          id: string
          is_read: boolean
          last_message_at: string | null
          last_message_id: string | null
          references_chain: string[] | null
          status: string
          store_id: string | null
          subject: string
          thread_subject: string | null
        }
        Insert: {
          created_at?: string
          customer_email: string
          customer_name?: string | null
          id?: string
          is_read?: boolean
          last_message_at?: string | null
          last_message_id?: string | null
          references_chain?: string[] | null
          status?: string
          store_id?: string | null
          subject: string
          thread_subject?: string | null
        }
        Update: {
          created_at?: string
          customer_email?: string
          customer_name?: string | null
          id?: string
          is_read?: boolean
          last_message_at?: string | null
          last_message_id?: string | null
          references_chain?: string[] | null
          status?: string
          store_id?: string | null
          subject?: string
          thread_subject?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tickets_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      webhook_events: {
        Row: {
          event_type: string
          id: string
          processed_at: string
          svix_id: string
        }
        Insert: {
          event_type: string
          id?: string
          processed_at?: string
          svix_id: string
        }
        Update: {
          event_type?: string
          id?: string
          processed_at?: string
          svix_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
