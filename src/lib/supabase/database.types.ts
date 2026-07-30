export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      audit_log: {
        Row: {
          action: string
          actor_id: string | null
          after: Json | null
          before: Json | null
          created_at: string
          entity: string
          entity_id: string | null
          id: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          after?: Json | null
          before?: Json | null
          created_at?: string
          entity: string
          entity_id?: string | null
          id?: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          after?: Json | null
          before?: Json | null
          created_at?: string
          entity?: string
          entity_id?: string | null
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_players: {
        Row: {
          booking_id: string
          created_at: string
          guest_name: string | null
          has_paid: boolean
          id: string
          profile_id: string | null
          share_cents: number | null
        }
        Insert: {
          booking_id: string
          created_at?: string
          guest_name?: string | null
          has_paid?: boolean
          id?: string
          profile_id?: string | null
          share_cents?: number | null
        }
        Update: {
          booking_id?: string
          created_at?: string
          guest_name?: string | null
          has_paid?: boolean
          id?: string
          profile_id?: string | null
          share_cents?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "booking_players_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_players_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_slots: {
        Row: {
          booking_id: string
          court_id: string
          time_range: unknown
        }
        Insert: {
          booking_id: string
          court_id: string
          time_range: unknown
        }
        Update: {
          booking_id?: string
          court_id?: string
          time_range?: unknown
        }
        Relationships: [
          {
            foreignKeyName: "booking_slots_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: true
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_slots_court_id_fkey"
            columns: ["court_id"]
            isOneToOne: false
            referencedRelation: "courts"
            referencedColumns: ["id"]
          },
        ]
      }
      bookings: {
        Row: {
          booked_by: string | null
          court_id: string
          created_at: string
          guest_email: string | null
          guest_name: string | null
          guest_phone: string | null
          id: string
          idempotency_key: string | null
          notes: string | null
          party_size: number
          payment_status: string
          reference_code: string
          source: string
          status: string
          time_range: unknown
          total_cents: number
          updated_at: string
        }
        Insert: {
          booked_by?: string | null
          court_id: string
          created_at?: string
          guest_email?: string | null
          guest_name?: string | null
          guest_phone?: string | null
          id?: string
          idempotency_key?: string | null
          notes?: string | null
          party_size?: number
          payment_status?: string
          reference_code?: string
          source?: string
          status?: string
          time_range: unknown
          total_cents: number
          updated_at?: string
        }
        Update: {
          booked_by?: string | null
          court_id?: string
          created_at?: string
          guest_email?: string | null
          guest_name?: string | null
          guest_phone?: string | null
          id?: string
          idempotency_key?: string | null
          notes?: string | null
          party_size?: number
          payment_status?: string
          reference_code?: string
          source?: string
          status?: string
          time_range?: unknown
          total_cents?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bookings_booked_by_fkey"
            columns: ["booked_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_court_id_fkey"
            columns: ["court_id"]
            isOneToOne: false
            referencedRelation: "courts"
            referencedColumns: ["id"]
          },
        ]
      }
      closures: {
        Row: {
          court_id: string | null
          created_at: string
          ends_at: string
          id: string
          reason: string | null
          starts_at: string
          venue_id: string
        }
        Insert: {
          court_id?: string | null
          created_at?: string
          ends_at: string
          id?: string
          reason?: string | null
          starts_at: string
          venue_id: string
        }
        Update: {
          court_id?: string | null
          created_at?: string
          ends_at?: string
          id?: string
          reason?: string | null
          starts_at?: string
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "closures_court_id_fkey"
            columns: ["court_id"]
            isOneToOne: false
            referencedRelation: "courts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "closures_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      courts: {
        Row: {
          created_at: string
          hourly_rate_cents: number
          id: string
          is_active: boolean
          is_indoor: boolean
          member_rate_cents: number | null
          name: string
          surface: string | null
          updated_at: string
          venue_id: string
        }
        Insert: {
          created_at?: string
          hourly_rate_cents: number
          id?: string
          is_active?: boolean
          is_indoor?: boolean
          member_rate_cents?: number | null
          name: string
          surface?: string | null
          updated_at?: string
          venue_id: string
        }
        Update: {
          created_at?: string
          hourly_rate_cents?: number
          id?: string
          is_active?: boolean
          is_indoor?: boolean
          member_rate_cents?: number | null
          name?: string
          surface?: string | null
          updated_at?: string
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "courts_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      credit_ledger: {
        Row: {
          created_at: string
          delta_cents: number
          id: string
          profile_id: string
          reason: string
          reference_id: string | null
        }
        Insert: {
          created_at?: string
          delta_cents: number
          id?: string
          profile_id: string
          reason: string
          reference_id?: string | null
        }
        Update: {
          created_at?: string
          delta_cents?: number
          id?: string
          profile_id?: string
          reason?: string
          reference_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "credit_ledger_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      credits: {
        Row: {
          balance_cents: number
          profile_id: string
          updated_at: string
        }
        Insert: {
          balance_cents?: number
          profile_id: string
          updated_at?: string
        }
        Update: {
          balance_cents?: number
          profile_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "credits_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      memberships: {
        Row: {
          created_at: string
          ends_on: string | null
          id: string
          profile_id: string
          starts_on: string
          status: string
          tier: string
        }
        Insert: {
          created_at?: string
          ends_on?: string | null
          id?: string
          profile_id: string
          starts_on: string
          status?: string
          tier: string
        }
        Update: {
          created_at?: string
          ends_on?: string | null
          id?: string
          profile_id?: string
          starts_on?: string
          status?: string
          tier?: string
        }
        Relationships: [
          {
            foreignKeyName: "memberships_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          channel: string
          created_at: string
          id: string
          payload: Json
          profile_id: string | null
          read_at: string | null
          sent_at: string | null
          template: string
        }
        Insert: {
          channel: string
          created_at?: string
          id?: string
          payload?: Json
          profile_id?: string | null
          read_at?: string | null
          sent_at?: string | null
          template: string
        }
        Update: {
          channel?: string
          created_at?: string
          id?: string
          payload?: Json
          profile_id?: string | null
          read_at?: string | null
          sent_at?: string | null
          template?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      operating_hours: {
        Row: {
          close_time: string
          day_of_week: number
          id: string
          open_time: string
          venue_id: string
        }
        Insert: {
          close_time: string
          day_of_week: number
          id?: string
          open_time: string
          venue_id: string
        }
        Update: {
          close_time?: string
          day_of_week?: number
          id?: string
          open_time?: string
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "operating_hours_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          booking_restricted_until: string | null
          created_at: string
          full_name: string | null
          id: string
          no_show_count: number
          phone: string | null
          role: string
          skill_level: number | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          booking_restricted_until?: string | null
          created_at?: string
          full_name?: string | null
          id: string
          no_show_count?: number
          phone?: string | null
          role?: string
          skill_level?: number | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          booking_restricted_until?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          no_show_count?: number
          phone?: string | null
          role?: string
          skill_level?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      session_signups: {
        Row: {
          checked_in_at: string | null
          created_at: string
          guest_name: string | null
          id: string
          paid: boolean
          profile_id: string | null
          session_id: string
          status: string
        }
        Insert: {
          checked_in_at?: string | null
          created_at?: string
          guest_name?: string | null
          id?: string
          paid?: boolean
          profile_id?: string | null
          session_id: string
          status?: string
        }
        Update: {
          checked_in_at?: string | null
          created_at?: string
          guest_name?: string | null
          id?: string
          paid?: boolean
          profile_id?: string | null
          session_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "session_signups_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_signups_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      sessions: {
        Row: {
          capacity: number
          courts_used: string[]
          cover_image_url: string | null
          created_at: string
          description: string | null
          ends_at: string
          format: string
          host_id: string | null
          id: string
          price_cents: number
          skill_max: number | null
          skill_min: number | null
          starts_at: string
          status: string
          title: string
          updated_at: string
          venue_id: string
        }
        Insert: {
          capacity: number
          courts_used?: string[]
          cover_image_url?: string | null
          created_at?: string
          description?: string | null
          ends_at: string
          format: string
          host_id?: string | null
          id?: string
          price_cents?: number
          skill_max?: number | null
          skill_min?: number | null
          starts_at: string
          status?: string
          title: string
          updated_at?: string
          venue_id: string
        }
        Update: {
          capacity?: number
          courts_used?: string[]
          cover_image_url?: string | null
          created_at?: string
          description?: string | null
          ends_at?: string
          format?: string
          host_id?: string | null
          id?: string
          price_cents?: number
          skill_max?: number | null
          skill_min?: number | null
          starts_at?: string
          status?: string
          title?: string
          updated_at?: string
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sessions_host_id_fkey"
            columns: ["host_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sessions_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      venues: {
        Row: {
          address: string | null
          amenities: string[]
          cancellation_cutoff_hours: number
          contact: string | null
          created_at: string
          id: string
          max_advance_days: number
          min_lead_minutes: number
          name: string
          photos: string[]
          timezone: string
          updated_at: string
        }
        Insert: {
          address?: string | null
          amenities?: string[]
          cancellation_cutoff_hours?: number
          contact?: string | null
          created_at?: string
          id?: string
          max_advance_days?: number
          min_lead_minutes?: number
          name: string
          photos?: string[]
          timezone?: string
          updated_at?: string
        }
        Update: {
          address?: string | null
          amenities?: string[]
          cancellation_cutoff_hours?: number
          contact?: string | null
          created_at?: string
          id?: string
          max_advance_days?: number
          min_lead_minutes?: number
          name?: string
          photos?: string[]
          timezone?: string
          updated_at?: string
        }
        Relationships: []
      }
      waitlist: {
        Row: {
          claim_expires_at: string | null
          court_id: string | null
          created_at: string
          desired_range: unknown
          id: string
          notified_at: string | null
          position: number | null
          profile_id: string
          session_id: string | null
        }
        Insert: {
          claim_expires_at?: string | null
          court_id?: string | null
          created_at?: string
          desired_range?: unknown
          id?: string
          notified_at?: string | null
          position?: number | null
          profile_id: string
          session_id?: string | null
        }
        Update: {
          claim_expires_at?: string | null
          court_id?: string | null
          created_at?: string
          desired_range?: unknown
          id?: string
          notified_at?: string | null
          position?: number | null
          profile_id?: string
          session_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "waitlist_court_id_fkey"
            columns: ["court_id"]
            isOneToOne: false
            referencedRelation: "courts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "waitlist_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "waitlist_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      booking_has_player: { Args: { p_booking_id: string }; Returns: boolean }
      cancel_booking: {
        Args: { p_booking_id: string; p_reference_code?: string }
        Returns: {
          booked_by: string | null
          court_id: string
          created_at: string
          guest_email: string | null
          guest_name: string | null
          guest_phone: string | null
          id: string
          idempotency_key: string | null
          notes: string | null
          party_size: number
          payment_status: string
          reference_code: string
          source: string
          status: string
          time_range: unknown
          total_cents: number
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "bookings"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      confirm_booking: {
        Args: { p_booking_id: string }
        Returns: {
          booked_by: string | null
          court_id: string
          created_at: string
          guest_email: string | null
          guest_name: string | null
          guest_phone: string | null
          id: string
          idempotency_key: string | null
          notes: string | null
          party_size: number
          payment_status: string
          reference_code: string
          source: string
          status: string
          time_range: unknown
          total_cents: number
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "bookings"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_booking: {
        Args: {
          p_booked_by?: string
          p_court_id: string
          p_duration_minutes: number
          p_guest_email?: string
          p_guest_name?: string
          p_guest_phone?: string
          p_idempotency_key?: string
          p_notes?: string
          p_party_size?: number
          p_player_names?: string[]
          p_source?: string
          p_starts_at: string
        }
        Returns: {
          booked_by: string | null
          court_id: string
          created_at: string
          guest_email: string | null
          guest_name: string | null
          guest_phone: string | null
          id: string
          idempotency_key: string | null
          notes: string | null
          party_size: number
          payment_status: string
          reference_code: string
          source: string
          status: string
          time_range: unknown
          total_cents: number
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "bookings"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      get_booking_by_reference: {
        Args: { p_reference_code: string }
        Returns: {
          court_id: string
          court_name: string
          ends_at: string
          id: string
          party_size: number
          payment_status: string
          reference_code: string
          starts_at: string
          status: string
          total_cents: number
        }[]
      }
      has_active_membership: {
        Args: { p_profile_id: string }
        Returns: boolean
      }
      is_admin: { Args: never; Returns: boolean }
      is_booking_owner: { Args: { p_booking_id: string }; Returns: boolean }
      is_organizer_or_admin: { Args: never; Returns: boolean }
      mark_no_show: {
        Args: { p_booking_id: string }
        Returns: {
          booked_by: string | null
          court_id: string
          created_at: string
          guest_email: string | null
          guest_name: string | null
          guest_phone: string | null
          id: string
          idempotency_key: string | null
          notes: string | null
          party_size: number
          payment_status: string
          reference_code: string
          source: string
          status: string
          time_range: unknown
          total_cents: number
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "bookings"
          isOneToOne: true
          isSetofReturn: false
        }
      }
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const

