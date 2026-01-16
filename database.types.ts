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
      in_app_notifications: {
        Row: {
          created_at: string
          in_app_notification_id: number
          is_read: boolean
          message: string
          notification_id: number | null
          organization_id: string
          read_at: string | null
          read_by: string | null
          template_type: string
        }
        Insert: {
          created_at?: string
          in_app_notification_id?: number
          is_read?: boolean
          message: string
          notification_id?: number | null
          organization_id: string
          read_at?: string | null
          read_by?: string | null
          template_type: string
        }
        Update: {
          created_at?: string
          in_app_notification_id?: number
          is_read?: boolean
          message?: string
          notification_id?: number | null
          organization_id?: string
          read_at?: string | null
          read_by?: string | null
          template_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "in_app_notifications_notification_id_fkey"
            columns: ["notification_id"]
            isOneToOne: false
            referencedRelation: "notifications"
            referencedColumns: ["notification_id"]
          },
          {
            foreignKeyName: "in_app_notifications_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["organization_id"]
          },
          {
            foreignKeyName: "in_app_notifications_read_by_fkey"
            columns: ["read_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      instructors: {
        Row: {
          career: Json | null
          created_at: string
          info: string | null
          instructor_id: number
          name: string
          organization_id: string
          photo_url: string | null
          sns: Json | null
          updated_at: string
        }
        Insert: {
          career?: Json | null
          created_at?: string
          info?: string | null
          instructor_id?: never
          name: string
          organization_id: string
          photo_url?: string | null
          sns?: Json | null
          updated_at?: string
        }
        Update: {
          career?: Json | null
          created_at?: string
          info?: string | null
          instructor_id?: never
          name?: string
          organization_id?: string
          photo_url?: string | null
          sns?: Json | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "instructors_organization_id_organizations_organization_id_fk"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["organization_id"]
          },
        ]
      }
      notifications: {
        Row: {
          alimtalk_error_code: string | null
          alimtalk_error_message: string | null
          alimtalk_message_id: string | null
          alimtalk_sent_at: string | null
          alimtalk_status: Database["public"]["Enums"]["alimtalk_status"] | null
          alimtalk_template_code: string | null
          alimtalk_variables: Json | null
          consult_completed_at: string | null
          consult_completed_by: string | null
          consult_message: string | null
          consult_notes: string | null
          consult_result: Database["public"]["Enums"]["consult_result"] | null
          consult_status: Database["public"]["Enums"]["consult_status"] | null
          created_at: string
          notification_id: number
          organization_id: string
          parent_notification_id: number | null
          program_id: number | null
          recipient_name: string | null
          recipient_phone: string
          recipient_profile_id: string | null
          reminder_generated: boolean | null
          retry_count: number | null
          schedule_id: number | null
          scheduled_send_at: string | null
          send_mode: Database["public"]["Enums"]["send_mode"] | null
          sender_profile_id: string | null
          type: Database["public"]["Enums"]["notification_type"]
          updated_at: string
        }
        Insert: {
          alimtalk_error_code?: string | null
          alimtalk_error_message?: string | null
          alimtalk_message_id?: string | null
          alimtalk_sent_at?: string | null
          alimtalk_status?:
            | Database["public"]["Enums"]["alimtalk_status"]
            | null
          alimtalk_template_code?: string | null
          alimtalk_variables?: Json | null
          consult_completed_at?: string | null
          consult_completed_by?: string | null
          consult_message?: string | null
          consult_notes?: string | null
          consult_result?: Database["public"]["Enums"]["consult_result"] | null
          consult_status?: Database["public"]["Enums"]["consult_status"] | null
          created_at?: string
          notification_id?: number
          organization_id: string
          parent_notification_id?: number | null
          program_id?: number | null
          recipient_name?: string | null
          recipient_phone: string
          recipient_profile_id?: string | null
          reminder_generated?: boolean | null
          retry_count?: number | null
          schedule_id?: number | null
          scheduled_send_at?: string | null
          send_mode?: Database["public"]["Enums"]["send_mode"] | null
          sender_profile_id?: string | null
          type: Database["public"]["Enums"]["notification_type"]
          updated_at?: string
        }
        Update: {
          alimtalk_error_code?: string | null
          alimtalk_error_message?: string | null
          alimtalk_message_id?: string | null
          alimtalk_sent_at?: string | null
          alimtalk_status?:
            | Database["public"]["Enums"]["alimtalk_status"]
            | null
          alimtalk_template_code?: string | null
          alimtalk_variables?: Json | null
          consult_completed_at?: string | null
          consult_completed_by?: string | null
          consult_message?: string | null
          consult_notes?: string | null
          consult_result?: Database["public"]["Enums"]["consult_result"] | null
          consult_status?: Database["public"]["Enums"]["consult_status"] | null
          created_at?: string
          notification_id?: number
          organization_id?: string
          parent_notification_id?: number | null
          program_id?: number | null
          recipient_name?: string | null
          recipient_phone?: string
          recipient_profile_id?: string | null
          reminder_generated?: boolean | null
          retry_count?: number | null
          schedule_id?: number | null
          scheduled_send_at?: string | null
          send_mode?: Database["public"]["Enums"]["send_mode"] | null
          sender_profile_id?: string | null
          type?: Database["public"]["Enums"]["notification_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_consult_completed_by_fkey"
            columns: ["consult_completed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "notifications_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["organization_id"]
          },
          {
            foreignKeyName: "notifications_parent_notification_id_fkey"
            columns: ["parent_notification_id"]
            isOneToOne: false
            referencedRelation: "notifications"
            referencedColumns: ["notification_id"]
          },
          {
            foreignKeyName: "notifications_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["program_id"]
          },
          {
            foreignKeyName: "notifications_recipient_profile_id_fkey"
            columns: ["recipient_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "notifications_schedule_id_fkey"
            columns: ["schedule_id"]
            isOneToOne: false
            referencedRelation: "schedules"
            referencedColumns: ["schedule_id"]
          },
          {
            foreignKeyName: "notifications_sender_profile_id_fkey"
            columns: ["sender_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      organization_members: {
        Row: {
          created_at: string
          organization_id: string
          profile_id: string
          role: Database["public"]["Enums"]["user_role"]
          state: Database["public"]["Enums"]["user_state"]
          type: Database["public"]["Enums"]["user_type"] | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          organization_id: string
          profile_id: string
          role?: Database["public"]["Enums"]["user_role"]
          state?: Database["public"]["Enums"]["user_state"]
          type?: Database["public"]["Enums"]["user_type"] | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          organization_id?: string
          profile_id?: string
          role?: Database["public"]["Enums"]["user_role"]
          state?: Database["public"]["Enums"]["user_state"]
          type?: Database["public"]["Enums"]["user_type"] | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_members_organization_id_organizations_organization"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["organization_id"]
          },
          {
            foreignKeyName: "organization_members_profile_id_profiles_fk"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      organization_templates: {
        Row: {
          batch_start_hour: number | null
          channel: Database["public"]["Enums"]["template_channel"]
          created_at: string
          hours_before: number | null
          org_template_id: number
          organization_id: string
          scheduled_send_time: string | null
          send_timing: Database["public"]["Enums"]["send_timing"]
          status: Database["public"]["Enums"]["template_status"]
          super_template_id: number
          updated_at: string
        }
        Insert: {
          batch_start_hour?: number | null
          channel?: Database["public"]["Enums"]["template_channel"]
          created_at?: string
          hours_before?: number | null
          org_template_id?: number
          organization_id: string
          scheduled_send_time?: string | null
          send_timing: Database["public"]["Enums"]["send_timing"]
          status?: Database["public"]["Enums"]["template_status"]
          super_template_id: number
          updated_at?: string
        }
        Update: {
          batch_start_hour?: number | null
          channel?: Database["public"]["Enums"]["template_channel"]
          created_at?: string
          hours_before?: number | null
          org_template_id?: number
          organization_id?: string
          scheduled_send_time?: string | null
          send_timing?: Database["public"]["Enums"]["send_timing"]
          status?: Database["public"]["Enums"]["template_status"]
          super_template_id?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_templates_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["organization_id"]
          },
          {
            foreignKeyName: "organization_templates_super_template_id_fkey"
            columns: ["super_template_id"]
            isOneToOne: false
            referencedRelation: "super_templates"
            referencedColumns: ["super_template_id"]
          },
        ]
      }
      organizations: {
        Row: {
          created_at: string
          description: string | null
          name: string
          organization_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          name: string
          organization_id?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          name?: string
          organization_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      payments: {
        Row: {
          approved_at: string
          created_at: string
          metadata: Json
          order_id: string
          order_name: string
          payment_id: number
          payment_key: string
          raw_data: Json
          receipt_url: string
          requested_at: string
          status: string
          total_amount: number
          updated_at: string
          user_id: string | null
        }
        Insert: {
          approved_at: string
          created_at?: string
          metadata: Json
          order_id: string
          order_name: string
          payment_id?: never
          payment_key: string
          raw_data: Json
          receipt_url: string
          requested_at: string
          status: string
          total_amount: number
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          approved_at?: string
          created_at?: string
          metadata?: Json
          order_id?: string
          order_name?: string
          payment_id?: never
          payment_key?: string
          raw_data?: Json
          receipt_url?: string
          requested_at?: string
          status?: string
          total_amount?: number
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          birth_date: string | null
          class_end_date: string | null
          class_start_date: string | null
          color: string | null
          created_at: string
          description: string | null
          is_signup_complete: boolean
          marketing_consent: boolean
          name: string
          parent_name: string | null
          parent_phone: string | null
          phone: string | null
          profile_id: string
          region: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          birth_date?: string | null
          class_end_date?: string | null
          class_start_date?: string | null
          color?: string | null
          created_at?: string
          description?: string | null
          is_signup_complete?: boolean
          marketing_consent?: boolean
          name: string
          parent_name?: string | null
          parent_phone?: string | null
          phone?: string | null
          profile_id: string
          region?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          birth_date?: string | null
          class_end_date?: string | null
          class_start_date?: string | null
          color?: string | null
          created_at?: string
          description?: string | null
          is_signup_complete?: boolean
          marketing_consent?: boolean
          name?: string
          parent_name?: string | null
          parent_phone?: string | null
          phone?: string | null
          profile_id?: string
          region?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      programs: {
        Row: {
          cover_image_url: string | null
          created_at: string
          curriculum: Json | null
          description: string | null
          duration_minutes: number | null
          instructor_id: number | null
          is_public: boolean | null
          level: Database["public"]["Enums"]["program_level"] | null
          location_address: string | null
          location_type: string | null
          max_capacity: number | null
          organization_id: string
          price: number | null
          program_id: number
          slug: string | null
          status: Database["public"]["Enums"]["program_status"]
          subtitle: string | null
          thumbnail_url: string | null
          title: string
          total_sessions: number | null
          updated_at: string
        }
        Insert: {
          cover_image_url?: string | null
          created_at?: string
          curriculum?: Json | null
          description?: string | null
          duration_minutes?: number | null
          instructor_id?: number | null
          is_public?: boolean | null
          level?: Database["public"]["Enums"]["program_level"] | null
          location_address?: string | null
          location_type?: string | null
          max_capacity?: number | null
          organization_id: string
          price?: number | null
          program_id?: never
          slug?: string | null
          status?: Database["public"]["Enums"]["program_status"]
          subtitle?: string | null
          thumbnail_url?: string | null
          title: string
          total_sessions?: number | null
          updated_at?: string
        }
        Update: {
          cover_image_url?: string | null
          created_at?: string
          curriculum?: Json | null
          description?: string | null
          duration_minutes?: number | null
          instructor_id?: number | null
          is_public?: boolean | null
          level?: Database["public"]["Enums"]["program_level"] | null
          location_address?: string | null
          location_type?: string | null
          max_capacity?: number | null
          organization_id?: string
          price?: number | null
          program_id?: never
          slug?: string | null
          status?: Database["public"]["Enums"]["program_status"]
          subtitle?: string | null
          thumbnail_url?: string | null
          title?: string
          total_sessions?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "programs_instructor_id_instructors_instructor_id_fk"
            columns: ["instructor_id"]
            isOneToOne: false
            referencedRelation: "instructors"
            referencedColumns: ["instructor_id"]
          },
          {
            foreignKeyName: "programs_organization_id_organizations_organization_id_fk"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["organization_id"]
          },
        ]
      }
      schedules: {
        Row: {
          created_at: string
          end_time: string
          is_exception: boolean
          organization_id: string
          parent_schedule_id: number | null
          program_id: number | null
          rrule: string | null
          schedule_id: number
          start_time: string
          student_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          end_time: string
          is_exception?: boolean
          organization_id: string
          parent_schedule_id?: number | null
          program_id?: number | null
          rrule?: string | null
          schedule_id?: never
          start_time: string
          student_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          end_time?: string
          is_exception?: boolean
          organization_id?: string
          parent_schedule_id?: number | null
          program_id?: number | null
          rrule?: string | null
          schedule_id?: never
          start_time?: string
          student_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "schedules_organization_id_organizations_organization_id_fk"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["organization_id"]
          },
          {
            foreignKeyName: "schedules_program_id_programs_program_id_fk"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["program_id"]
          },
          {
            foreignKeyName: "schedules_student_id_profiles_profile_id_fk"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      settings: {
        Row: {
          created_at: string
          organization_id: string
          setting_key: string
          setting_value: Json
          updated_at: string
        }
        Insert: {
          created_at?: string
          organization_id: string
          setting_key: string
          setting_value: Json
          updated_at?: string
        }
        Update: {
          created_at?: string
          organization_id?: string
          setting_key?: string
          setting_value?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "settings_organization_id_organizations_organization_id_fk"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["organization_id"]
          },
        ]
      }
      super_templates: {
        Row: {
          channel: Database["public"]["Enums"]["template_channel"]
          content: string
          created_at: string
          default_hours_before: number | null
          default_timing: Database["public"]["Enums"]["send_timing"]
          kakao_template_code: string
          name: string
          status: Database["public"]["Enums"]["template_status"]
          super_template_id: number
          type: string
          updated_at: string
          variables: Json
        }
        Insert: {
          channel?: Database["public"]["Enums"]["template_channel"]
          content: string
          created_at?: string
          default_hours_before?: number | null
          default_timing: Database["public"]["Enums"]["send_timing"]
          kakao_template_code: string
          name: string
          status?: Database["public"]["Enums"]["template_status"]
          super_template_id?: number
          type: string
          updated_at?: string
          variables?: Json
        }
        Update: {
          channel?: Database["public"]["Enums"]["template_channel"]
          content?: string
          created_at?: string
          default_hours_before?: number | null
          default_timing?: Database["public"]["Enums"]["send_timing"]
          kakao_template_code?: string
          name?: string
          status?: Database["public"]["Enums"]["template_status"]
          super_template_id?: number
          type?: string
          updated_at?: string
          variables?: Json
        }
        Relationships: []
      }
      test_send_logs: {
        Row: {
          log_id: number
          org_template_id: number | null
          organization_id: string | null
          profile_id: string
          recipient_phone: string
          sent_at: string
          super_template_id: number
        }
        Insert: {
          log_id?: number
          org_template_id?: number | null
          organization_id?: string | null
          profile_id: string
          recipient_phone: string
          sent_at?: string
          super_template_id: number
        }
        Update: {
          log_id?: number
          org_template_id?: number | null
          organization_id?: string | null
          profile_id?: string
          recipient_phone?: string
          sent_at?: string
          super_template_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "test_send_logs_org_template_id_fkey"
            columns: ["org_template_id"]
            isOneToOne: false
            referencedRelation: "organization_templates"
            referencedColumns: ["org_template_id"]
          },
          {
            foreignKeyName: "test_send_logs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["organization_id"]
          },
          {
            foreignKeyName: "test_send_logs_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "test_send_logs_super_template_id_fkey"
            columns: ["super_template_id"]
            isOneToOne: false
            referencedRelation: "super_templates"
            referencedColumns: ["super_template_id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_user_organization_id: { Args: never; Returns: string }
      is_org_admin: { Args: { org_id: string }; Returns: boolean }
      is_org_member: { Args: { org_id: string }; Returns: boolean }
      is_super_admin: { Args: never; Returns: boolean }
    }
    Enums: {
      alimtalk_status: "PENDING" | "SENT" | "FAILED"
      consult_result: "SUCCESS" | "FAILED"
      consult_status: "WAITING" | "COMPLETED"
      notification_type: "ALIMTALK" | "CONSULT_REQUEST"
      program_level: "BEGINNER" | "INTERMEDIATE" | "ADVANCED"
      program_status: "DRAFT" | "ACTIVE" | "ARCHIVED"
      send_mode: "TEST" | "LIVE"
      send_timing: "IMMEDIATE" | "SCHEDULED"
      template_channel: "ALIMTALK"
      template_status: "ACTIVE" | "INACTIVE"
      user_role: "STUDENT" | "ADMIN"
      user_state: "NORMAL" | "GRADUATE" | "DELETED"
      user_type: "EXAMINEE" | "DROPPER" | "ADULT"
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
      alimtalk_status: ["PENDING", "SENT", "FAILED"],
      consult_result: ["SUCCESS", "FAILED"],
      consult_status: ["WAITING", "COMPLETED"],
      notification_type: ["ALIMTALK", "CONSULT_REQUEST"],
      program_level: ["BEGINNER", "INTERMEDIATE", "ADVANCED"],
      program_status: ["DRAFT", "ACTIVE", "ARCHIVED"],
      send_mode: ["TEST", "LIVE"],
      send_timing: ["IMMEDIATE", "SCHEDULED"],
      template_channel: ["ALIMTALK"],
      template_status: ["ACTIVE", "INACTIVE"],
      user_role: ["STUDENT", "ADMIN"],
      user_state: ["NORMAL", "GRADUATE", "DELETED"],
      user_type: ["EXAMINEE", "DROPPER", "ADULT"],
    },
  },
} as const
