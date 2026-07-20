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
      active_streams: {
        Row: {
          agent_type: string | null
          started_at: string
          user_id: string
        }
        Insert: {
          agent_type?: string | null
          started_at?: string
          user_id: string
        }
        Update: {
          agent_type?: string | null
          started_at?: string
          user_id?: string
        }
        Relationships: []
      }
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
          selected_task: string | null
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
          selected_task?: string | null
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
          selected_task?: string | null
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
          stripe_price_id: string | null
          stripe_product_id: string | null
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
          stripe_price_id?: string | null
          stripe_product_id?: string | null
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
          stripe_price_id?: string | null
          stripe_product_id?: string | null
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
          is_super_agent: boolean
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
          is_super_agent?: boolean
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
          is_super_agent?: boolean
          label?: string
          patient_required?: boolean | null
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      email_templates: {
        Row: {
          category: string
          created_at: string
          description: string | null
          html: string
          id: string
          is_active: boolean
          key: string
          name: string
          subject: string
          updated_at: string
          updated_by: string | null
          variables: Json
        }
        Insert: {
          category?: string
          created_at?: string
          description?: string | null
          html: string
          id?: string
          is_active?: boolean
          key: string
          name: string
          subject: string
          updated_at?: string
          updated_by?: string | null
          variables?: Json
        }
        Update: {
          category?: string
          created_at?: string
          description?: string | null
          html?: string
          id?: string
          is_active?: boolean
          key?: string
          name?: string
          subject?: string
          updated_at?: string
          updated_by?: string | null
          variables?: Json
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
      import_errors: {
        Row: {
          created_at: string
          created_by: string | null
          email: string | null
          error_message: string
          id: string
          import_batch: string
          payload: Json | null
          row_number: number | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          email?: string | null
          error_message: string
          id?: string
          import_batch: string
          payload?: Json | null
          row_number?: number | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          email?: string | null
          error_message?: string
          id?: string
          import_batch?: string
          payload?: Json | null
          row_number?: number | null
        }
        Relationships: []
      }
      import_nutri_staging: {
        Row: {
          email: string
          full_name: string | null
          phone: string | null
          plan_type: string | null
          tag_label: string | null
        }
        Insert: {
          email: string
          full_name?: string | null
          phone?: string | null
          plan_type?: string | null
          tag_label?: string | null
        }
        Update: {
          email?: string
          full_name?: string | null
          phone?: string | null
          plan_type?: string | null
          tag_label?: string | null
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
          agent_type: string | null
          created_at: string
          created_by: string
          dify_conversation_id: string | null
          dify_conversations: Json
          exam_context: Json | null
          id: string
          patient_id: string
          pinned_at: string | null
          selected_task: string | null
          title: string | null
          updated_at: string
        }
        Insert: {
          agent_type?: string | null
          created_at?: string
          created_by: string
          dify_conversation_id?: string | null
          dify_conversations?: Json
          exam_context?: Json | null
          id?: string
          patient_id: string
          pinned_at?: string | null
          selected_task?: string | null
          title?: string | null
          updated_at?: string
        }
        Update: {
          agent_type?: string | null
          created_at?: string
          created_by?: string
          dify_conversation_id?: string | null
          dify_conversations?: Json
          exam_context?: Json | null
          id?: string
          patient_id?: string
          pinned_at?: string | null
          selected_task?: string | null
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
      payment_history: {
        Row: {
          amount_cents: number
          created_at: string
          credits_added: number | null
          currency: string
          description: string
          hosted_invoice_url: string | null
          id: string
          kind: string
          metadata: Json | null
          receipt_url: string | null
          status: string
          stripe_event_id: string | null
          stripe_invoice_id: string | null
          stripe_payment_intent_id: string | null
          stripe_session_id: string | null
          user_id: string
        }
        Insert: {
          amount_cents?: number
          created_at?: string
          credits_added?: number | null
          currency?: string
          description: string
          hosted_invoice_url?: string | null
          id?: string
          kind: string
          metadata?: Json | null
          receipt_url?: string | null
          status: string
          stripe_event_id?: string | null
          stripe_invoice_id?: string | null
          stripe_payment_intent_id?: string | null
          stripe_session_id?: string | null
          user_id: string
        }
        Update: {
          amount_cents?: number
          created_at?: string
          credits_added?: number | null
          currency?: string
          description?: string
          hosted_invoice_url?: string | null
          id?: string
          kind?: string
          metadata?: Json | null
          receipt_url?: string | null
          status?: string
          stripe_event_id?: string | null
          stripe_invoice_id?: string | null
          stripe_payment_intent_id?: string | null
          stripe_session_id?: string | null
          user_id?: string
        }
        Relationships: []
      }
      profile_tags: {
        Row: {
          created_at: string
          created_by: string | null
          profile_id: string
          tag_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          profile_id: string
          tag_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          profile_id?: string
          tag_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profile_tags_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profile_tags_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "user_tags"
            referencedColumns: ["id"]
          },
        ]
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
          legacy_last_login_at: string | null
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
          legacy_last_login_at?: string | null
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
          legacy_last_login_at?: string | null
          phone?: string | null
          policy_accepted_at?: string | null
          professional_id?: string | null
          pronoun?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      rate_limit_hits: {
        Row: {
          hit_at: string
          id: number
          user_id: string
        }
        Insert: {
          hit_at?: string
          id?: number
          user_id: string
        }
        Update: {
          hit_at?: string
          id?: number
          user_id?: string
        }
        Relationships: []
      }
      stripe_webhook_events: {
        Row: {
          id: string
          payload: Json | null
          processed_at: string
          type: string
        }
        Insert: {
          id: string
          payload?: Json | null
          processed_at?: string
          type: string
        }
        Update: {
          id?: string
          payload?: Json | null
          processed_at?: string
          type?: string
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
          stripe_price_monthly_id: string | null
          stripe_price_yearly_id: string | null
          stripe_product_id: string | null
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
          stripe_price_monthly_id?: string | null
          stripe_price_yearly_id?: string | null
          stripe_product_id?: string | null
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
          stripe_price_monthly_id?: string | null
          stripe_price_yearly_id?: string | null
          stripe_product_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      subscriptions: {
        Row: {
          billing_cycle: string | null
          cancelled_at: string | null
          created_at: string
          current_period_end: string
          id: string
          legacy_status: string | null
          plan_type: Database["public"]["Enums"]["plan_type"]
          seats_override: number | null
          status: Database["public"]["Enums"]["subscription_status"]
          stripe_customer_id: string | null
          stripe_price_id: string | null
          stripe_subscription_id: string | null
          trial_ends_at: string | null
          unlimited_credits: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          billing_cycle?: string | null
          cancelled_at?: string | null
          created_at?: string
          current_period_end?: string
          id?: string
          legacy_status?: string | null
          plan_type?: Database["public"]["Enums"]["plan_type"]
          seats_override?: number | null
          status?: Database["public"]["Enums"]["subscription_status"]
          stripe_customer_id?: string | null
          stripe_price_id?: string | null
          stripe_subscription_id?: string | null
          trial_ends_at?: string | null
          unlimited_credits?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          billing_cycle?: string | null
          cancelled_at?: string | null
          created_at?: string
          current_period_end?: string
          id?: string
          legacy_status?: string | null
          plan_type?: Database["public"]["Enums"]["plan_type"]
          seats_override?: number | null
          status?: Database["public"]["Enums"]["subscription_status"]
          stripe_customer_id?: string | null
          stripe_price_id?: string | null
          stripe_subscription_id?: string | null
          trial_ends_at?: string | null
          unlimited_credits?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      super_agent_cards: {
        Row: {
          card_trigger: string | null
          created_at: string
          icon: string | null
          id: string
          is_active: boolean
          label: string
          sort_order: number
          task_id: string
          updated_at: string
        }
        Insert: {
          card_trigger?: string | null
          created_at?: string
          icon?: string | null
          id?: string
          is_active?: boolean
          label: string
          sort_order?: number
          task_id: string
          updated_at?: string
        }
        Update: {
          card_trigger?: string | null
          created_at?: string
          icon?: string | null
          id?: string
          is_active?: boolean
          label?: string
          sort_order?: number
          task_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "super_agent_cards_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "super_agent_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      super_agent_tasks: {
        Row: {
          agent_id: string
          created_at: string
          description: string | null
          icon: string | null
          id: string
          is_active: boolean
          label: string
          sort_order: number
          task_key: string
          updated_at: string
        }
        Insert: {
          agent_id: string
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean
          label: string
          sort_order?: number
          task_key: string
          updated_at?: string
        }
        Update: {
          agent_id?: string
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean
          label?: string
          sort_order?: number
          task_key?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "super_agent_tasks_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "dify_agents"
            referencedColumns: ["agent_id"]
          },
        ]
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
      user_tags: {
        Row: {
          color: string
          created_at: string
          created_by: string | null
          id: string
          label: string
          updated_at: string
        }
        Insert: {
          color?: string
          created_at?: string
          created_by?: string | null
          id?: string
          label: string
          updated_at?: string
        }
        Update: {
          color?: string
          created_at?: string
          created_by?: string | null
          id?: string
          label?: string
          updated_at?: string
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
      release_stream_slot: { Args: { p_user_id: string }; Returns: undefined }
      toggle_unlimited_credits: {
        Args: {
          p_admin_id: string
          p_reason: string
          p_unlimited: boolean
          p_user_id: string
        }
        Returns: boolean
      }
      try_acquire_stream_slot: {
        Args: {
          p_agent_type: string
          p_max_per_minute?: number
          p_user_id: string
        }
        Returns: Json
      }
    }
    Enums: {
      ai_feedback_rating: "positive" | "negative" | "suggestion"
      app_role: "super_admin" | "admin" | "nutri"
      gender_type: "male" | "female" | "other"
      plan_type: "free" | "starter" | "pro" | "clinica"
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
      plan_type: ["free", "starter", "pro", "clinica"],
      subscription_status: ["trial", "active", "past_due", "canceled"],
    },
  },
} as const
