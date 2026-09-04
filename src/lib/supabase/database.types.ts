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
          coach_fee_cents: number
          coach_id: string | null
          court_id: string
          created_at: string
          guest_email: string | null
          guest_name: string | null
          guest_phone: string | null
          id: string
          idempotency_key: string | null
          notes: string | null
          party_size: number
          payment_reference: string | null
          payment_slip_path: string | null
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
          coach_fee_cents?: number
          coach_id?: string | null
          court_id: string
          created_at?: string
          guest_email?: string | null
          guest_name?: string | null
          guest_phone?: string | null
          id?: string
          idempotency_key?: string | null
          notes?: string | null
          party_size?: number
          payment_reference?: string | null
          payment_slip_path?: string | null
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
          coach_fee_cents?: number
          coach_id?: string | null
          court_id?: string
          created_at?: string
          guest_email?: string | null
          guest_name?: string | null
          guest_phone?: string | null
          id?: string
          idempotency_key?: string | null
          notes?: string | null
          party_size?: number
          payment_reference?: string | null
          payment_slip_path?: string | null
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
            foreignKeyName: "bookings_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "coaches"
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
      coach_requests: {
        Row: {
          coach_id: string
          created_at: string
          guest_email: string | null
          guest_name: string | null
          guest_phone: string | null
          id: string
          message: string | null
          preferred_at: string | null
          profile_id: string | null
          status: string
        }
        Insert: {
          coach_id: string
          created_at?: string
          guest_email?: string | null
          guest_name?: string | null
          guest_phone?: string | null
          id?: string
          message?: string | null
          preferred_at?: string | null
          profile_id?: string | null
          status?: string
        }
        Update: {
          coach_id?: string
          created_at?: string
          guest_email?: string | null
          guest_name?: string | null
          guest_phone?: string | null
          id?: string
          message?: string | null
          preferred_at?: string | null
          profile_id?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "coach_requests_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "coaches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coach_requests_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      coaches: {
        Row: {
          bio: string | null
          created_at: string
          email: string | null
          hourly_rate_cents: number
          id: string
          is_active: boolean
          name: string
          phone: string | null
          photo_url: string | null
          sort_order: number
          updated_at: string
          venue_id: string
        }
        Insert: {
          bio?: string | null
          created_at?: string
          email?: string | null
          hourly_rate_cents?: number
          id?: string
          is_active?: boolean
          name: string
          phone?: string | null
          photo_url?: string | null
          sort_order?: number
          updated_at?: string
          venue_id: string
        }
        Update: {
          bio?: string | null
          created_at?: string
          email?: string | null
          hourly_rate_cents?: number
          id?: string
          is_active?: boolean
          name?: string
          phone?: string | null
          photo_url?: string | null
          sort_order?: number
          updated_at?: string
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "coaches_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      court_rate_periods: {
        Row: {
          court_id: string
          created_at: string
          end_time: string
          hourly_rate_cents: number
          id: string
          member_rate_cents: number | null
          start_time: string
        }
        Insert: {
          court_id: string
          created_at?: string
          end_time: string
          hourly_rate_cents: number
          id?: string
          member_rate_cents?: number | null
          start_time: string
        }
        Update: {
          court_id?: string
          created_at?: string
          end_time?: string
          hourly_rate_cents?: number
          id?: string
          member_rate_cents?: number | null
          start_time?: string
        }
        Relationships: [
          {
            foreignKeyName: "court_rate_periods_court_id_fkey"
            columns: ["court_id"]
            isOneToOne: false
            referencedRelation: "courts"
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
          venue_id: string | null
        }
        Insert: {
          created_at?: string
          ends_on?: string | null
          id?: string
          profile_id: string
          starts_on: string
          status?: string
          tier: string
          venue_id?: string | null
        }
        Update: {
          created_at?: string
          ends_on?: string | null
          id?: string
          profile_id?: string
          starts_on?: string
          status?: string
          tier?: string
          venue_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "memberships_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "memberships_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
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
          closes_next_day: boolean
          day_of_week: number
          id: string
          open_time: string
          venue_id: string
        }
        Insert: {
          close_time: string
          closes_next_day?: boolean
          day_of_week: number
          id?: string
          open_time: string
          venue_id: string
        }
        Update: {
          close_time?: string
          closes_next_day?: boolean
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
      payment_accounts: {
        Row: {
          account_name: string
          account_number: string
          bank_name: string
          created_at: string
          id: string
          remarks: string | null
          sort_order: number
          venue_id: string
        }
        Insert: {
          account_name: string
          account_number: string
          bank_name: string
          created_at?: string
          id?: string
          remarks?: string | null
          sort_order?: number
          venue_id: string
        }
        Update: {
          account_name?: string
          account_number?: string
          bank_name?: string
          created_at?: string
          id?: string
          remarks?: string | null
          sort_order?: number
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_accounts_venue_id_fkey"
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
          is_super_admin: boolean
          no_show_count: number
          phone: string | null
          role: string
          skill_level: number | null
          updated_at: string
          venue_id: string | null
        }
        Insert: {
          avatar_url?: string | null
          booking_restricted_until?: string | null
          created_at?: string
          full_name?: string | null
          id: string
          is_super_admin?: boolean
          no_show_count?: number
          phone?: string | null
          role?: string
          skill_level?: number | null
          updated_at?: string
          venue_id?: string | null
        }
        Update: {
          avatar_url?: string | null
          booking_restricted_until?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          is_super_admin?: boolean
          no_show_count?: number
          phone?: string | null
          role?: string
          skill_level?: number | null
          updated_at?: string
          venue_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
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
      venue_memberships: {
        Row: {
          created_at: string
          id: string
          profile_id: string
          role: string
          venue_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          profile_id: string
          role?: string
          venue_id: string
        }
        Update: {
          created_at?: string
          id?: string
          profile_id?: string
          role?: string
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "venue_memberships_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "venue_memberships_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      venue_sections: {
        Row: {
          body: string | null
          created_at: string
          id: string
          is_visible: boolean
          media_type: string | null
          media_url: string | null
          sort_order: number
          title: string | null
          updated_at: string
          venue_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          id?: string
          is_visible?: boolean
          media_type?: string | null
          media_url?: string | null
          sort_order?: number
          title?: string | null
          updated_at?: string
          venue_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          id?: string
          is_visible?: boolean
          media_type?: string | null
          media_url?: string | null
          sort_order?: number
          title?: string | null
          updated_at?: string
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "venue_sections_venue_id_fkey"
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
          announcement_enabled: boolean
          announcement_image_url: string | null
          announcement_link: string | null
          announcement_text: string | null
          announcement_type: string
          cancellation_cutoff_hours: number
          contact: string | null
          created_at: string
          custom_domain: string | null
          email_from: string | null
          features: Json
          footer_about: string | null
          footer_address: string | null
          footer_email: string | null
          footer_links: Json
          footer_phone: string | null
          footer_socials: Json
          hero_heading: string | null
          hero_media_type: string | null
          hero_media_url: string | null
          hero_subheading: string | null
          how_note: string | null
          how_note_hidden: boolean
          how_steps: string[] | null
          id: string
          is_active: boolean
          logo_url: string | null
          max_advance_days: number
          min_lead_minutes: number
          name: string
          photos: string[]
          slug: string | null
          timezone: string
          updated_at: string
        }
        Insert: {
          address?: string | null
          amenities?: string[]
          announcement_enabled?: boolean
          announcement_image_url?: string | null
          announcement_link?: string | null
          announcement_text?: string | null
          announcement_type?: string
          cancellation_cutoff_hours?: number
          contact?: string | null
          created_at?: string
          custom_domain?: string | null
          email_from?: string | null
          features?: Json
          footer_about?: string | null
          footer_address?: string | null
          footer_email?: string | null
          footer_links?: Json
          footer_phone?: string | null
          footer_socials?: Json
          hero_heading?: string | null
          hero_media_type?: string | null
          hero_media_url?: string | null
          hero_subheading?: string | null
          how_note?: string | null
          how_note_hidden?: boolean
          how_steps?: string[] | null
          id?: string
          is_active?: boolean
          logo_url?: string | null
          max_advance_days?: number
          min_lead_minutes?: number
          name: string
          photos?: string[]
          slug?: string | null
          timezone?: string
          updated_at?: string
        }
        Update: {
          address?: string | null
          amenities?: string[]
          announcement_enabled?: boolean
          announcement_image_url?: string | null
          announcement_link?: string | null
          announcement_text?: string | null
          announcement_type?: string
          cancellation_cutoff_hours?: number
          contact?: string | null
          created_at?: string
          custom_domain?: string | null
          email_from?: string | null
          features?: Json
          footer_about?: string | null
          footer_address?: string | null
          footer_email?: string | null
          footer_links?: Json
          footer_phone?: string | null
          footer_socials?: Json
          hero_heading?: string | null
          hero_media_type?: string | null
          hero_media_url?: string | null
          hero_subheading?: string | null
          how_note?: string | null
          how_note_hidden?: boolean
          how_steps?: string[] | null
          id?: string
          is_active?: boolean
          logo_url?: string | null
          max_advance_days?: number
          min_lead_minutes?: number
          name?: string
          photos?: string[]
          slug?: string | null
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
      admin_shares_venue_with: { Args: { p_profile: string }; Returns: boolean }
      admin_user_id_by_email: { Args: { p_email: string }; Returns: string }
      booking_has_player: { Args: { p_booking_id: string }; Returns: boolean }
      booking_venue: { Args: { p_booking: string }; Returns: string }
      can_admin_venue: { Args: { p_venue: string }; Returns: boolean }
      cancel_booking: {
        Args: { p_booking_id: string; p_reference_code?: string }
        Returns: {
          booked_by: string | null
          coach_fee_cents: number
          coach_id: string | null
          court_id: string
          created_at: string
          guest_email: string | null
          guest_name: string | null
          guest_phone: string | null
          id: string
          idempotency_key: string | null
          notes: string | null
          party_size: number
          payment_reference: string | null
          payment_slip_path: string | null
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
      coach_venue: { Args: { p_coach: string }; Returns: string }
      confirm_booking: {
        Args: { p_booking_id: string }
        Returns: {
          booked_by: string | null
          coach_fee_cents: number
          coach_id: string | null
          court_id: string
          created_at: string
          guest_email: string | null
          guest_name: string | null
          guest_phone: string | null
          id: string
          idempotency_key: string | null
          notes: string | null
          party_size: number
          payment_reference: string | null
          payment_slip_path: string | null
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
      court_venue: { Args: { p_court: string }; Returns: string }
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
          p_payment_reference?: string
          p_payment_slip_path?: string
          p_player_names?: string[]
          p_source?: string
          p_starts_at: string
        }
        Returns: {
          booked_by: string | null
          coach_fee_cents: number
          coach_id: string | null
          court_id: string
          created_at: string
          guest_email: string | null
          guest_name: string | null
          guest_phone: string | null
          id: string
          idempotency_key: string | null
          notes: string | null
          party_size: number
          payment_reference: string | null
          payment_slip_path: string | null
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
      create_bookings: {
        Args: {
          p_booked_by?: string
          p_coach_id?: string
          p_guest_email?: string
          p_guest_name?: string
          p_guest_phone?: string
          p_idempotency_key?: string
          p_notes?: string
          p_party_size?: number
          p_payment_reference?: string
          p_payment_slip_path?: string
          p_player_names?: string[]
          p_segments: Json
          p_source?: string
        }
        Returns: {
          booked_by: string | null
          coach_fee_cents: number
          coach_id: string | null
          court_id: string
          created_at: string
          guest_email: string | null
          guest_name: string | null
          guest_phone: string | null
          id: string
          idempotency_key: string | null
          notes: string | null
          party_size: number
          payment_reference: string | null
          payment_slip_path: string | null
          payment_status: string
          reference_code: string
          source: string
          status: string
          time_range: unknown
          total_cents: number
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "bookings"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      current_user_venue: { Args: never; Returns: string }
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
      has_active_membership:
        | { Args: { p_profile_id: string }; Returns: boolean }
        | {
            Args: { p_profile_id: string; p_venue_id: string }
            Returns: boolean
          }
      is_admin: { Args: never; Returns: boolean }
      is_admin_anywhere: { Args: never; Returns: boolean }
      is_admin_of: { Args: { p_venue: string }; Returns: boolean }
      is_booking_owner: { Args: { p_booking_id: string }; Returns: boolean }
      is_member_of: { Args: { p_venue: string }; Returns: boolean }
      is_organizer_or_admin: { Args: never; Returns: boolean }
      mark_no_show: {
        Args: { p_booking_id: string }
        Returns: {
          booked_by: string | null
          coach_fee_cents: number
          coach_id: string | null
          court_id: string
          created_at: string
          guest_email: string | null
          guest_name: string | null
          guest_phone: string | null
          id: string
          idempotency_key: string | null
          notes: string | null
          party_size: number
          payment_reference: string | null
          payment_slip_path: string | null
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
      profile_venue: { Args: { p_profile: string }; Returns: string }
      reschedule_booking: {
        Args: {
          p_booking_id: string
          p_new_court_id: string
          p_new_starts_at: string
        }
        Returns: {
          booked_by: string | null
          coach_fee_cents: number
          coach_id: string | null
          court_id: string
          created_at: string
          guest_email: string | null
          guest_name: string | null
          guest_phone: string | null
          id: string
          idempotency_key: string | null
          notes: string | null
          party_size: number
          payment_reference: string | null
          payment_slip_path: string | null
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
      session_venue: { Args: { p_session: string }; Returns: string }
      set_venue_feature: {
        Args: { p_enabled: boolean; p_key: string; p_venue: string }
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

