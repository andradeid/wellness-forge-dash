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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      agent_costs: {
        Row: {
          agent_key: string
          cost_credits: number
          created_at: string
          display_name: string
          id: string
          is_active: boolean
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          agent_key: string
          cost_credits: number
          created_at?: string
          display_name: string
          id?: string
          is_active?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          agent_key?: string
          cost_credits?: number
          created_at?: string
          display_name?: string
          id?: string
          is_active?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      ai_feedback: {
        Row: {
          comment: string | null
          created_at: string
          created_by: string
          id: string
          message_id: string
          rating: Database["public"]["Enums"]["ai_feedback_rating"]
          updated_at: string
        }
        Insert: {
          comment?: string | null
          created_at?: string
          created_by: string
          id?: string
          message_id: string
          rating: Database["public"]["Enums"]["ai_feedback_rating"]
          updated_at?: string
        }
        Update: {
          comment?: string | null
          created_at?: string
          created_by?: string
          id?: string
          message_id?: string
          rating?: Database["public"]["Enums"]["ai_feedback_rating"]
          updated_at?: string
        }
        Relationships: []
      }
      chat_messages: {
        Row: {
          agent_type: string | null
          attachments: Json | null
          chat_id: string
          content: string
          created_at: string
          created_by: string
          id: string
          role: string
          structured_data: Json | null
        }
        Insert: {
          agent_type?: string | null
          attachments?: Json | null
          chat_id: string
          content?: string
          created_at?: string
          created_by: string
          id?: string
          role: string
          structured_data?: Json | null
        }
        Update: {
          agent_type?: string | null
          attachments?: Json | null
          chat_id?: string
          content?: string
          created_at?: string
          created_by?: string
          id?: string
          role?: string
          structured_data?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "chat_messages_chat_id_fkey"
            columns: ["chat_id"]
            isOneToOne: false
            referencedRelation: "patient_chats"
            referencedColumns: ["id"]
          },
        ]
      }
      credit_audit_log: {
        Row: {
          action: string
          admin_id: string
          balance_after: number | null
          balance_before: number | null
          created_at: string
          delta: number | null
          id: string
          metadata: Json
          reason: string
          user_id: string
        }
        Insert: {
          action: string
          admin_id: string
          balance_after?: number | null
          balance_before?: number | null
          created_at?: string
          delta?: number | null
          id?: string
          metadata?: Json
          reason: string
          user_id: string
        }
        Update: {
          action?: string
          admin_id?: string
          balance_after?: number | null
          balance_before?: number | null
          created_at?: string
          delta?: number | null
          id?: string
          metadata?: Json
          reason?: string
          user_id?: string
        }
        Relationships: []
      }
      credit_packs: {
        Row: {
          created_at: string
          credits: number
          description: string | null
          id: string
          is_active: boolean
          is_highlighted: boolean
          name: string
          perks: Json
          price_cents: number
          slug: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          credits: number
          description?: string | null
          id?: string
          is_active?: boolean
          is_highlighted?: boolean
          name: string
          perks?: Json
          price_cents?: number
          slug: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          credits?: number
          description?: string | null
          id?: string
          is_active?: boolean
          is_highlighted?: boolean
          name?: string
          perks?: Json
          price_cents?: number
          slug?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      credit_transactions: {
        Row: {
          agent_key: string | null
          agent_label: string | null
          amount: number
          balance_after: number
          created_at: string
          id: string
          message_preview: string | null
          metadata: Json | null
          type: string
          user_id: string
        }
        Insert: {
          agent_key?: string | null
          agent_label?: string | null
          amount: number
          balance_after: number
          created_at?: string
          id?: string
          message_preview?: string | null
          metadata?: Json | null
          type: string
          user_id: string
        }
        Update: {
          agent_key?: string | null
          agent_label?: string | null
          amount?: number
          balance_after?: number
          created_at?: string
          id?: string
          message_preview?: string | null
          metadata?: Json | null
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      dify_agents: {
        Row: {
          agent_id: string
          api_key: string | null
          card_trigger: string | null
          created_at: string
          description: string | null
          endpoint: string
          id: string
          is_active: boolean
          label: string
          patient_required: boolean | null
          sort_order: number
          updated_at: string
        }
        Insert: {
          agent_id: string
          api_key?: string | null
          card_trigger?: string | null
          created_at?: string
          description?: string | null
          endpoint?: string
          id?: string
          is_active?: boolean
          label: string
          patient_required?: boolean | null
          sort_order?: number
          updated_at?: string
        }
        Update: {
          agent_id?: string
          api_key?: string | null
          card_trigger?: string | null
          created_at?: string
          description?: string | null
          endpoint?: string
          id?: string
          is_active?: boolean
          label?: string
          patient_required?: boolean | null
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      general_chat_messages: {
        Row: {
          agent_type: string | null
          chat_id: string | null
          content: string | null
          created_at: string | null
          id: string
          role: string
        }
        Insert: {
          agent_type?: string | null
          chat_id?: string | null
          content?: string | null
          created_at?: string | null
          id?: string
          role: string
        }
        Update: {
          agent_type?: string | null
          chat_id?: string | null
          content?: string | null
          created_at?: string | null
          id?: string
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "general_chat_messages_chat_id_fkey"
            columns: ["chat_id"]
            isOneToOne: false
            referencedRelation: "general_chats"
            referencedColumns: ["id"]
          },
        ]
      }
      general_chats: {
        Row: {
          agent_type: string
          created_at: string | null
          created_by: string | null
          dify_conversation_id: string | null
          id: string
          pinned_at: string | null
          title: string | null
          updated_at: string | null
        }
        Insert: {
          agent_type?: string
          created_at?: string | null
          created_by?: string | null
          dify_conversation_id?: string | null
          id?: string
          pinned_at?: string | null
          title?: string | null
          updated_at?: string | null
        }
        Update: {
          agent_type?: string
          created_at?: string | null
          created_by?: string | null
          dify_conversation_id?: string | null
          id?: string
          pinned_at?: string | null
          title?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      integration_logs: {
        Row: {
          created_at: string
          event: string
          id: string
          message: string | null
          payload: Json | null
          source: string
          status: string
        }
        Insert: {
          created_at?: string
          event: string
          id?: string
          message?: string | null
          payload?: Json | null
          source: string
          status: string
        }
        Update: {
          created_at?: string
          event?: string
          id?: string
          message?: string | null
          payload?: Json | null
          source?: string
          status?: string
        }
        Relationships: []
      }
      integrations: {
        Row: {
          category: string | null
          created_at: string
          description: string | null
          id: string
          is_secret: boolean
          key: string
          label: string | null
          updated_at: string
          value: string | null
        }
        Insert: {
          category?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_secret?: boolean
          key: string
          label?: string | null
          updated_at?: string
          value?: string | null
        }
        Update: {
          category?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_secret?: boolean
          key?: string
          label?: string | null
          updated_at?: string
          value?: string | null
        }
        Relationships: []
      }
      patient_chats: {
        Row: {
          created_at: string
          created_by: string
          dify_conversation_id: string | null
          exam_context: Json | null
          id: string
          patient_id: string
          pinned_at: string | null
          title: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          dify_conversation_id?: string | null
          exam_context?: Json | null
          id?: string
          patient_id: string
          pinned_at?: string | null
          title?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          dify_conversation_id?: string | null
          exam_context?: Json | null
          id?: string
          patient_id?: string
          pinned_at?: string | null
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "patient_chats_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      patient_exam_results: {
        Row: {
          agent_type: string | null
          analysis: string | null
          category: string | null
          chat_id: string | null
          classification: string | null
          created_at: string
          created_by: string
          exam_id: string | null
          id: string
          marker_name: string
          marker_unit: string | null
          marker_value: number | null
          marker_value_raw: string | null
          measured_at: string
          patient_id: string
          reference_value: string | null
        }
        Insert: {
          agent_type?: string | null
          analysis?: string | null
          category?: string | null
          chat_id?: string | null
          classification?: string | null
          created_at?: string
          created_by: string
          exam_id?: string | null
          id?: string
          marker_name: string
          marker_unit?: string | null
          marker_value?: number | null
          marker_value_raw?: string | null
          measured_at?: string
          patient_id: string
          reference_value?: string | null
        }
        Update: {
          agent_type?: string | null
          analysis?: string | null
          category?: string | null
          chat_id?: string | null
          classification?: string | null
          created_at?: string
          created_by?: string
          exam_id?: string | null
          id?: string
          marker_name?: string
          marker_unit?: string | null
          marker_value?: number | null
          marker_value_raw?: string | null
          measured_at?: string
          patient_id?: string
          reference_value?: string | null
        }
        Relationships: []
      }
      patient_exams: {
        Row: {
          chat_id: string | null
          created_at: string
          dify_file_id: string | null
          exam_date: string
          file_name: string
          file_path: string
          id: string
          mime_type: string | null
          patient_id: string
          size_bytes: number | null
          uploaded_by: string
        }
        Insert: {
          chat_id?: string | null
          created_at?: string
          dify_file_id?: string | null
          exam_date?: string
          file_name: string
          file_path: string
          id?: string
          mime_type?: string | null
          patient_id: string
          size_bytes?: number | null
          uploaded_by: string
        }
        Update: {
          chat_id?: string | null
          created_at?: string
          dify_file_id?: string | null
          exam_date?: string
          file_name?: string
          file_path?: string
          id?: string
          mime_type?: string | null
          patient_id?: string
          size_bytes?: number | null
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "patient_exams_chat_id_fkey"
            columns: ["chat_id"]
            isOneToOne: false
            referencedRelation: "patient_chats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patient_exams_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      patients: {
        Row: {
          avatar_url: string | null
          birth_date: string | null
          created_at: string
          created_by: string
          email: string | null
          gender: Database["public"]["Enums"]["gender_type"] | null
          gestational_weeks: number | null
          id: string
          is_pregnant: boolean | null
          menstrual_cycle_phase: string | null
          name: string
          notes: string | null
          phone: string | null
          pregnancy_type: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          birth_date?: string | null
          created_at?: string
          created_by: string
          email?: string | null
          gender?: Database["public"]["Enums"]["gender_type"] | null
          gestational_weeks?: number | null
          id?: string
          is_pregnant?: boolean | null
          menstrual_cycle_phase?: string | null
          name: string
          notes?: string | null
          phone?: string | null
          pregnancy_type?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          birth_date?: string | null
          created_at?: string
          created_by?: string
          email?: string | null
          gender?: Database["public"]["Enums"]["gender_type"] | null
          gestational_weeks?: number | null
          id?: string
          is_pregnant?: boolean | null
          menstrual_cycle_phase?: string | null
          name?: string
          notes?: string | null
          phone?: string | null
          pregnancy_type?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          ai_tone: string
          avatar_url: string | null
          clinic_logo_url: string | null
          clinic_name: string | null
          created_at: string
          deleted_at: string | null
          email: string
          full_name: string | null
          id: string
          is_blocked: boolean
          phone: string | null
          policy_accepted_at: string | null
          professional_id: string | null
          pronoun: string | null
          updated_at: string
        }
        Insert: {
          ai_tone?: string
          avatar_url?: string | null
          clinic_logo_url?: string | null
          clinic_name?: string | null
          created_at?: string
          deleted_at?: string | null
          email: string
          full_name?: string | null
          id: string
          is_blocked?: boolean
          phone?: string | null
          policy_accepted_at?: string | null
          professional_id?: string | null
          pronoun?: string | null
          updated_at?: string
        }
        Update: {
          ai_tone?: string
          avatar_url?: string | null
          clinic_logo_url?: string | null
          clinic_name?: string | null
          created_at?: string
          deleted_at?: string | null
          email?: string
          full_name?: string | null
          id?: string
          is_blocked?: boolean
          phone?: string | null
          policy_accepted_at?: string | null
          professional_id?: string | null
          pronoun?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      subscription_plans: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          max_seats: number
          monthly_credits: number
          name: string
          price_monthly_cents: number
          price_yearly_cents: number | null
          slug: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          max_seats?: number
          monthly_credits?: number
          name: string
          price_monthly_cents?: number
          price_yearly_cents?: number | null
          slug: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          max_seats?: number
          monthly_credits?: number
          name?: string
          price_monthly_cents?: number
          price_yearly_cents?: number | null
          slug?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      subscriptions: {
        Row: {
          created_at: string
          current_period_end: string
          id: string
          plan_type: Database["public"]["Enums"]["plan_type"]
          seats_override: number | null
          status: Database["public"]["Enums"]["subscription_status"]
          unlimited_credits: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          current_period_end?: string
          id?: string
          plan_type?: Database["public"]["Enums"]["plan_type"]
          seats_override?: number | null
          status?: Database["public"]["Enums"]["subscription_status"]
          unlimited_credits?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          current_period_end?: string
          id?: string
          plan_type?: Database["public"]["Enums"]["plan_type"]
          seats_override?: number | null
          status?: Database["public"]["Enums"]["subscription_status"]
          unlimited_credits?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      system_settings: {
        Row: {
          id: string
          maintenance_badge: string
          maintenance_enabled: boolean
          maintenance_footer: string
          maintenance_html: string
          maintenance_subtitle: string
          maintenance_title: string
          seo_canonical: string | null
          seo_description: string | null
          seo_title: string | null
          site_description: string | null
          sitemap_extra: string | null
          timezone: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          id?: string
          maintenance_badge?: string
          maintenance_enabled?: boolean
          maintenance_footer?: string
          maintenance_html?: string
          maintenance_subtitle?: string
          maintenance_title?: string
          seo_canonical?: string | null
          seo_description?: string | null
          seo_title?: string | null
          site_description?: string | null
          sitemap_extra?: string | null
          timezone?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          id?: string
          maintenance_badge?: string
          maintenance_enabled?: boolean
          maintenance_footer?: string
          maintenance_html?: string
          maintenance_subtitle?: string
          maintenance_title?: string
          seo_canonical?: string | null
          seo_description?: string | null
          seo_title?: string | null
          site_description?: string | null
          sitemap_extra?: string | null
          timezone?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      user_credits: {
        Row: {
          balance: number
          created_at: string
          id: string
          monthly_quota: number
          quota_reset_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          balance?: number
          created_at?: string
          id?: string
          monthly_quota?: number
          quota_reset_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          balance?: number
          created_at?: string
          id?: string
          monthly_quota?: number
          quota_reset_at?: string | null
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
      user_sessions: {
        Row: {
          active_session_token: string
          created_at: string
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          active_session_token: string
          created_at?: string
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          active_session_token?: string
          created_at?: string
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      adjust_user_balance: {
        Args: {
          p_admin_id: string
          p_delta: number
          p_reason: string
          p_user_id: string
        }
        Returns: number
      }
      consume_credits: {
        Args: {
          p_agent_key: string
          p_message_preview: string
          p_user_id: string
        }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      toggle_unlimited_credits: {
        Args: {
          p_admin_id: string
          p_reason: string
          p_unlimited: boolean
          p_user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      ai_feedback_rating: "positive" | "negative" | "suggestion"
      app_role: "super_admin" | "admin" | "nutri"
      gender_type: "male" | "female" | "other"
      plan_type: "free" | "basic" | "pro"
      subscription_status: "trial" | "active" | "past_due" | "canceled"
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
      ai_feedback_rating: ["positive", "negative", "suggestion"],
      app_role: ["super_admin", "admin", "nutri"],
      gender_type: ["male", "female", "other"],
      plan_type: ["free", "basic", "pro"],
      subscription_status: ["trial", "active", "past_due", "canceled"],
    },
  },
} as const
