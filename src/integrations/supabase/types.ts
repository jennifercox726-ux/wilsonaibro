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
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      conversations: {
        Row: {
          created_at: string
          id: string
          is_public: boolean
          share_token: string | null
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_public?: boolean
          share_token?: string | null
          title?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_public?: boolean
          share_token?: string | null
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      council_findings: {
        Row: {
          conversation_id: string | null
          created_at: string
          embedding: string | null
          finding: string
          id: string
          prompt: string
          user_id: string
          worker_model: string
        }
        Insert: {
          conversation_id?: string | null
          created_at?: string
          embedding?: string | null
          finding: string
          id?: string
          prompt: string
          user_id: string
          worker_model: string
        }
        Update: {
          conversation_id?: string | null
          created_at?: string
          embedding?: string | null
          finding?: string
          id?: string
          prompt?: string
          user_id?: string
          worker_model?: string
        }
        Relationships: []
      }
      dispatch_confirmations: {
        Row: {
          consumed_at: string | null
          created_at: string
          dispatch_log_id: string
          expires_at: string
          id: string
          sentinel_id: string
          token: string
          user_id: string
        }
        Insert: {
          consumed_at?: string | null
          created_at?: string
          dispatch_log_id: string
          expires_at: string
          id?: string
          sentinel_id: string
          token: string
          user_id: string
        }
        Update: {
          consumed_at?: string | null
          created_at?: string
          dispatch_log_id?: string
          expires_at?: string
          id?: string
          sentinel_id?: string
          token?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "dispatch_confirmations_dispatch_log_id_fkey"
            columns: ["dispatch_log_id"]
            isOneToOne: false
            referencedRelation: "dispatch_log"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dispatch_confirmations_sentinel_id_fkey"
            columns: ["sentinel_id"]
            isOneToOne: false
            referencedRelation: "sovereignty_sentinels"
            referencedColumns: ["id"]
          },
        ]
      }
      dispatch_log: {
        Row: {
          confirmed_by_sentinel_id: string | null
          created_at: string
          dispatched_at: string | null
          error_message: string | null
          github_response: string | null
          github_status_code: number | null
          id: string
          inputs: Json
          status: Database["public"]["Enums"]["dispatch_status"]
          trigger_source: Database["public"]["Enums"]["dispatch_trigger_source"]
          updated_at: string
          user_id: string
          workflow_id: string
        }
        Insert: {
          confirmed_by_sentinel_id?: string | null
          created_at?: string
          dispatched_at?: string | null
          error_message?: string | null
          github_response?: string | null
          github_status_code?: number | null
          id?: string
          inputs?: Json
          status: Database["public"]["Enums"]["dispatch_status"]
          trigger_source: Database["public"]["Enums"]["dispatch_trigger_source"]
          updated_at?: string
          user_id: string
          workflow_id: string
        }
        Update: {
          confirmed_by_sentinel_id?: string | null
          created_at?: string
          dispatched_at?: string | null
          error_message?: string | null
          github_response?: string | null
          github_status_code?: number | null
          id?: string
          inputs?: Json
          status?: Database["public"]["Enums"]["dispatch_status"]
          trigger_source?: Database["public"]["Enums"]["dispatch_trigger_source"]
          updated_at?: string
          user_id?: string
          workflow_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "dispatch_log_confirmed_by_sentinel_id_fkey"
            columns: ["confirmed_by_sentinel_id"]
            isOneToOne: false
            referencedRelation: "sovereignty_sentinels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dispatch_log_workflow_id_fkey"
            columns: ["workflow_id"]
            isOneToOne: false
            referencedRelation: "dispatch_workflows"
            referencedColumns: ["id"]
          },
        ]
      }
      dispatch_workflows: {
        Row: {
          armed: boolean
          created_at: string
          description: string | null
          display_name: string
          id: string
          ref: string
          tier: Database["public"]["Enums"]["dispatch_tier"]
          updated_at: string
          user_id: string
          workflow_file: string
        }
        Insert: {
          armed?: boolean
          created_at?: string
          description?: string | null
          display_name: string
          id?: string
          ref?: string
          tier?: Database["public"]["Enums"]["dispatch_tier"]
          updated_at?: string
          user_id: string
          workflow_file: string
        }
        Update: {
          armed?: boolean
          created_at?: string
          description?: string | null
          display_name?: string
          id?: string
          ref?: string
          tier?: Database["public"]["Enums"]["dispatch_tier"]
          updated_at?: string
          user_id?: string
          workflow_file?: string
        }
        Relationships: []
      }
      message_embeddings: {
        Row: {
          content: string
          conversation_id: string
          created_at: string
          embedding: string | null
          id: string
          message_id: string | null
          role: string
          user_id: string
        }
        Insert: {
          content: string
          conversation_id: string
          created_at?: string
          embedding?: string | null
          id?: string
          message_id?: string | null
          role: string
          user_id: string
        }
        Update: {
          content?: string
          conversation_id?: string
          created_at?: string
          embedding?: string | null
          id?: string
          message_id?: string | null
          role?: string
          user_id?: string
        }
        Relationships: []
      }
      messages: {
        Row: {
          content: string
          conversation_id: string
          created_at: string
          id: string
          role: string
        }
        Insert: {
          content: string
          conversation_id: string
          created_at?: string
          id?: string
          role: string
        }
        Update: {
          content?: string
          conversation_id?: string
          created_at?: string
          id?: string
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      pe_drafts: {
        Row: {
          created_at: string
          full_report: string | null
          id: string
          impact_summary: string | null
          profit_summary: string | null
          raw_input: Json
          read_at: string | null
          source: string
          status: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          full_report?: string | null
          id?: string
          impact_summary?: string | null
          profit_summary?: string | null
          raw_input?: Json
          read_at?: string | null
          source?: string
          status?: string
          title?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          full_report?: string | null
          id?: string
          impact_summary?: string | null
          profit_summary?: string | null
          raw_input?: Json
          read_at?: string | null
          source?: string
          status?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          core_dream: string | null
          created_at: string
          display_name: string | null
          emotional_vibe: string | null
          first_seen_at: string
          id: string
          membership_tier: string
          referral_source: string | null
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          core_dream?: string | null
          created_at?: string
          display_name?: string | null
          emotional_vibe?: string | null
          first_seen_at?: string
          id?: string
          membership_tier?: string
          referral_source?: string | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          core_dream?: string | null
          created_at?: string
          display_name?: string | null
          emotional_vibe?: string | null
          first_seen_at?: string
          id?: string
          membership_tier?: string
          referral_source?: string | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      query_logs: {
        Row: {
          conversation_id: string | null
          created_at: string
          id: string
          query_length: number
          query_text: string
          response_length: number | null
          response_time_ms: number | null
          user_id: string
        }
        Insert: {
          conversation_id?: string | null
          created_at?: string
          id?: string
          query_length?: number
          query_text: string
          response_length?: number | null
          response_time_ms?: number | null
          user_id: string
        }
        Update: {
          conversation_id?: string | null
          created_at?: string
          id?: string
          query_length?: number
          query_text?: string
          response_length?: number | null
          response_time_ms?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "query_logs_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      sovereignty_sentinels: {
        Row: {
          created_at: string
          email: string
          id: string
          name: string
          notified_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          name: string
          notified_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          name?: string
          notified_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      sovereignty_status: {
        Row: {
          check_in_window_hours: number
          created_at: string
          id: string
          last_ping: string
          protocol_triggered: boolean
          triggered_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          check_in_window_hours?: number
          created_at?: string
          id?: string
          last_ping?: string
          protocol_triggered?: boolean
          triggered_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          check_in_window_hours?: number
          created_at?: string
          id?: string
          last_ping?: string
          protocol_triggered?: boolean
          triggered_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      strategic_memory: {
        Row: {
          created_at: string
          decision: string
          embedding: string | null
          id: string
          rationale: string | null
          topic: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          decision: string
          embedding?: string | null
          id?: string
          rationale?: string | null
          topic: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          decision?: string
          embedding?: string | null
          id?: string
          rationale?: string | null
          topic?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_preferences: {
        Row: {
          created_at: string
          id: string
          pref_key: string
          pref_value: string
          source: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          pref_key: string
          pref_value: string
          source?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          pref_key?: string
          pref_value?: string
          source?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      vibe_logs: {
        Row: {
          created_at: string
          id: string
          logged_on: string
          note: string | null
          updated_at: string
          user_id: string
          vibe: string
        }
        Insert: {
          created_at?: string
          id?: string
          logged_on?: string
          note?: string | null
          updated_at?: string
          user_id: string
          vibe: string
        }
        Update: {
          created_at?: string
          id?: string
          logged_on?: string
          note?: string | null
          updated_at?: string
          user_id?: string
          vibe?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      match_council_findings: {
        Args: {
          _match_count?: number
          _min_similarity?: number
          _query_embedding: string
          _user_id: string
        }
        Returns: {
          finding: string
          id: string
          prompt: string
          similarity: number
          worker_model: string
        }[]
      }
      match_strategic_memory: {
        Args: {
          _match_count?: number
          _min_similarity?: number
          _query_embedding: string
          _user_id: string
        }
        Returns: {
          decision: string
          id: string
          rationale: string
          similarity: number
          topic: string
        }[]
      }
      match_user_messages: {
        Args: {
          _exclude_conversation?: string
          _match_count?: number
          _min_similarity?: number
          _query_embedding: string
          _user_id: string
        }
        Returns: {
          content: string
          conversation_id: string
          created_at: string
          role: string
          similarity: number
        }[]
      }
    }
    Enums: {
      app_role: "admin" | "user"
      dispatch_status:
        | "pending_confirmation"
        | "dispatched"
        | "failed"
        | "expired"
        | "cancelled"
      dispatch_tier: "auto" | "confirm"
      dispatch_trigger_source:
        | "manual"
        | "test_fire"
        | "sentinel_auto"
        | "sentinel_confirmed"
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
    Enums: {
      app_role: ["admin", "user"],
      dispatch_status: [
        "pending_confirmation",
        "dispatched",
        "failed",
        "expired",
        "cancelled",
      ],
      dispatch_tier: ["auto", "confirm"],
      dispatch_trigger_source: [
        "manual",
        "test_fire",
        "sentinel_auto",
        "sentinel_confirmed",
      ],
    },
  },
} as const
