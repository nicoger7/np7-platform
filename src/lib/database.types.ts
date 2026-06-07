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
      contacts: {
        Row: {
          accepts_marketing: boolean | null
          ai_summary: string | null
          chatwoot_contact_id: string | null
          country: string | null
          created_at: string | null
          date_of_birth: string | null
          diet_allergies: string | null
          discipline: string | null
          disciplines: string[] | null
          email: string | null
          email2: string | null
          experience_locations: string[] | null
          id: string
          interested_products: string[] | null
          level: string | null
          location: string | null
          name: string
          notes: string | null
          phone: string | null
          source: string | null
          tags: string[] | null
          tshirt_size: string | null
          updated_at: string | null
        }
        Insert: {
          accepts_marketing?: boolean | null
          ai_summary?: string | null
          chatwoot_contact_id?: string | null
          country?: string | null
          created_at?: string | null
          date_of_birth?: string | null
          diet_allergies?: string | null
          discipline?: string | null
          disciplines?: string[] | null
          email?: string | null
          email2?: string | null
          experience_locations?: string[] | null
          id?: string
          interested_products?: string[] | null
          level?: string | null
          location?: string | null
          name: string
          notes?: string | null
          phone?: string | null
          source?: string | null
          tags?: string[] | null
          tshirt_size?: string | null
          updated_at?: string | null
        }
        Update: {
          accepts_marketing?: boolean | null
          ai_summary?: string | null
          chatwoot_contact_id?: string | null
          country?: string | null
          created_at?: string | null
          date_of_birth?: string | null
          diet_allergies?: string | null
          discipline?: string | null
          disciplines?: string[] | null
          email?: string | null
          email2?: string | null
          experience_locations?: string[] | null
          id?: string
          interested_products?: string[] | null
          level?: string | null
          location?: string | null
          name?: string
          notes?: string | null
          phone?: string | null
          source?: string | null
          tags?: string[] | null
          tshirt_size?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      exp_blog_posts: {
        Row: {
          content: string | null
          cover_image: string | null
          created_at: string | null
          id: string
          published_at: string | null
          slug: string
          status: string | null
          title: string
          updated_at: string | null
        }
        Insert: {
          content?: string | null
          cover_image?: string | null
          created_at?: string | null
          id?: string
          published_at?: string | null
          slug: string
          status?: string | null
          title: string
          updated_at?: string | null
        }
        Update: {
          content?: string | null
          cover_image?: string | null
          created_at?: string | null
          id?: string
          published_at?: string | null
          slug?: string
          status?: string | null
          title?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      exp_booking_addons: {
        Row: {
          booking_id: string | null
          component_id: string | null
          id: string
          label: string
          notes: string | null
          price: number | null
        }
        Insert: {
          booking_id?: string | null
          component_id?: string | null
          id?: string
          label: string
          notes?: string | null
          price?: number | null
        }
        Update: {
          booking_id?: string | null
          component_id?: string | null
          id?: string
          label?: string
          notes?: string | null
          price?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "exp_booking_addons_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "exp_bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exp_booking_addons_component_id_fkey"
            columns: ["component_id"]
            isOneToOne: false
            referencedRelation: "exp_components"
            referencedColumns: ["id"]
          },
        ]
      }
      exp_bookings: {
        Row: {
          agreed_price: number | null
          contact_id: string | null
          created_at: string | null
          downpayment_invoice_sent: boolean | null
          downpayment_received: boolean | null
          experience_id: string | null
          final_invoice_due: string | null
          final_invoice_sent: boolean | null
          final_payment_received: boolean | null
          fly_in: string | null
          fly_out: string | null
          id: string
          name: string
          notes: string | null
          package_id: string | null
          status: string | null
          traveling_with: string | null
          updated_at: string | null
          wa_group: boolean | null
        }
        Insert: {
          agreed_price?: number | null
          contact_id?: string | null
          created_at?: string | null
          downpayment_invoice_sent?: boolean | null
          downpayment_received?: boolean | null
          experience_id?: string | null
          final_invoice_due?: string | null
          final_invoice_sent?: boolean | null
          final_payment_received?: boolean | null
          fly_in?: string | null
          fly_out?: string | null
          id?: string
          name: string
          notes?: string | null
          package_id?: string | null
          status?: string | null
          traveling_with?: string | null
          updated_at?: string | null
          wa_group?: boolean | null
        }
        Update: {
          agreed_price?: number | null
          contact_id?: string | null
          created_at?: string | null
          downpayment_invoice_sent?: boolean | null
          downpayment_received?: boolean | null
          experience_id?: string | null
          final_invoice_due?: string | null
          final_invoice_sent?: boolean | null
          final_payment_received?: boolean | null
          fly_in?: string | null
          fly_out?: string | null
          id?: string
          name?: string
          notes?: string | null
          package_id?: string | null
          status?: string | null
          traveling_with?: string | null
          updated_at?: string | null
          wa_group?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "exp_bookings_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exp_bookings_experience_id_fkey"
            columns: ["experience_id"]
            isOneToOne: false
            referencedRelation: "exp_experiences"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exp_bookings_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "exp_packages"
            referencedColumns: ["id"]
          },
        ]
      }
      exp_components: {
        Row: {
          category: string
          created_at: string | null
          description: string | null
          experience_id: string | null
          id: string
          is_global: boolean | null
          name: string
          unit_cost: number | null
          updated_at: string | null
        }
        Insert: {
          category: string
          created_at?: string | null
          description?: string | null
          experience_id?: string | null
          id?: string
          is_global?: boolean | null
          name: string
          unit_cost?: number | null
          updated_at?: string | null
        }
        Update: {
          category?: string
          created_at?: string | null
          description?: string | null
          experience_id?: string | null
          id?: string
          is_global?: boolean | null
          name?: string
          unit_cost?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "exp_components_experience_id_fkey"
            columns: ["experience_id"]
            isOneToOne: false
            referencedRelation: "exp_experiences"
            referencedColumns: ["id"]
          },
        ]
      }
      exp_costs: {
        Row: {
          created_at: string | null
          date: string | null
          estimated_amount: number | null
          experience_id: string
          id: string
          item: string
          notes: string | null
          status: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          date?: string | null
          estimated_amount?: number | null
          experience_id: string
          id?: string
          item: string
          notes?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          date?: string | null
          estimated_amount?: number | null
          experience_id?: string
          id?: string
          item?: string
          notes?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "exp_costs_experience_id_fkey"
            columns: ["experience_id"]
            isOneToOne: false
            referencedRelation: "exp_experiences"
            referencedColumns: ["id"]
          },
        ]
      }
      exp_experiences: {
        Row: {
          active_status: string | null
          airport_code: string | null
          cancellation_policy: string | null
          coaches: string | null
          created_at: string | null
          currency: string | null
          date_end: string | null
          date_start: string | null
          deposit: number | null
          description: string | null
          estimated_costs: number | null
          expected_profit: number | null
          expected_revenue: number | null
          experience_code: string | null
          gallery: string[] | null
          hero_image: string | null
          hotel: string | null
          id: string
          location: string
          location_lat: number | null
          location_lng: number | null
          max_spots: number | null
          notes: string | null
          paid_profit: number | null
          paid_revenue: number | null
          po_code: string | null
          price: number | null
          price_from: number | null
          price_to: number | null
          pricing_details: string | null
          slug: string
          spots_taken: number | null
          status: string | null
          timezone: string | null
          title: string
          updated_at: string | null
          whats_included: string[] | null
          whatsapp_group_link: string | null
        }
        Insert: {
          active_status?: string | null
          airport_code?: string | null
          cancellation_policy?: string | null
          coaches?: string | null
          created_at?: string | null
          currency?: string | null
          date_end?: string | null
          date_start?: string | null
          deposit?: number | null
          description?: string | null
          estimated_costs?: number | null
          expected_profit?: number | null
          expected_revenue?: number | null
          experience_code?: string | null
          gallery?: string[] | null
          hero_image?: string | null
          hotel?: string | null
          id?: string
          location: string
          location_lat?: number | null
          location_lng?: number | null
          max_spots?: number | null
          notes?: string | null
          paid_profit?: number | null
          paid_revenue?: number | null
          po_code?: string | null
          price?: number | null
          price_from?: number | null
          price_to?: number | null
          pricing_details?: string | null
          slug: string
          spots_taken?: number | null
          status?: string | null
          timezone?: string | null
          title: string
          updated_at?: string | null
          whats_included?: string[] | null
          whatsapp_group_link?: string | null
        }
        Update: {
          active_status?: string | null
          airport_code?: string | null
          cancellation_policy?: string | null
          coaches?: string | null
          created_at?: string | null
          currency?: string | null
          date_end?: string | null
          date_start?: string | null
          deposit?: number | null
          description?: string | null
          estimated_costs?: number | null
          expected_profit?: number | null
          expected_revenue?: number | null
          experience_code?: string | null
          gallery?: string[] | null
          hero_image?: string | null
          hotel?: string | null
          id?: string
          location?: string
          location_lat?: number | null
          location_lng?: number | null
          max_spots?: number | null
          notes?: string | null
          paid_profit?: number | null
          paid_revenue?: number | null
          po_code?: string | null
          price?: number | null
          price_from?: number | null
          price_to?: number | null
          pricing_details?: string | null
          slug?: string
          spots_taken?: number | null
          status?: string | null
          timezone?: string | null
          title?: string
          updated_at?: string | null
          whats_included?: string[] | null
          whatsapp_group_link?: string | null
        }
        Relationships: []
      }
      exp_hotel_rooms: {
        Row: {
          booking_id: string | null
          check_in: string | null
          check_out: string | null
          comments: string | null
          created_at: string | null
          experience_id: string | null
          hotel: string
          id: string
          name: string
          partner_tag_along: string | null
          room_number: string | null
          room_type: string
          status: string | null
          transfer_need: boolean | null
          updated_at: string | null
        }
        Insert: {
          booking_id?: string | null
          check_in?: string | null
          check_out?: string | null
          comments?: string | null
          created_at?: string | null
          experience_id?: string | null
          hotel: string
          id?: string
          name: string
          partner_tag_along?: string | null
          room_number?: string | null
          room_type: string
          status?: string | null
          transfer_need?: boolean | null
          updated_at?: string | null
        }
        Update: {
          booking_id?: string | null
          check_in?: string | null
          check_out?: string | null
          comments?: string | null
          created_at?: string | null
          experience_id?: string | null
          hotel?: string
          id?: string
          name?: string
          partner_tag_along?: string | null
          room_number?: string | null
          room_type?: string
          status?: string | null
          transfer_need?: boolean | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "exp_hotel_rooms_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "exp_bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exp_hotel_rooms_experience_id_fkey"
            columns: ["experience_id"]
            isOneToOne: false
            referencedRelation: "exp_experiences"
            referencedColumns: ["id"]
          },
        ]
      }
      exp_inquiries: {
        Row: {
          created_at: string | null
          email: string
          experience_id: string | null
          id: string
          message: string | null
          name: string
          phone: string | null
          status: string | null
        }
        Insert: {
          created_at?: string | null
          email: string
          experience_id?: string | null
          id?: string
          message?: string | null
          name: string
          phone?: string | null
          status?: string | null
        }
        Update: {
          created_at?: string | null
          email?: string
          experience_id?: string | null
          id?: string
          message?: string | null
          name?: string
          phone?: string | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "exp_inquiries_experience_id_fkey"
            columns: ["experience_id"]
            isOneToOne: false
            referencedRelation: "exp_experiences"
            referencedColumns: ["id"]
          },
        ]
      }
      exp_package_components: {
        Row: {
          component_id: string | null
          id: string
          notes: string | null
          package_id: string | null
          quantity: number | null
        }
        Insert: {
          component_id?: string | null
          id?: string
          notes?: string | null
          package_id?: string | null
          quantity?: number | null
        }
        Update: {
          component_id?: string | null
          id?: string
          notes?: string | null
          package_id?: string | null
          quantity?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "exp_package_components_component_id_fkey"
            columns: ["component_id"]
            isOneToOne: false
            referencedRelation: "exp_components"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exp_package_components_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "exp_packages"
            referencedColumns: ["id"]
          },
        ]
      }
      exp_packages: {
        Row: {
          created_at: string | null
          deposit: number | null
          description: string | null
          experience_id: string | null
          id: string
          includes: string[] | null
          max_spots: number | null
          name: string
          price: number | null
          slug: string
          sort_order: number | null
          status: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          deposit?: number | null
          description?: string | null
          experience_id?: string | null
          id?: string
          includes?: string[] | null
          max_spots?: number | null
          name: string
          price?: number | null
          slug: string
          sort_order?: number | null
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          deposit?: number | null
          description?: string | null
          experience_id?: string | null
          id?: string
          includes?: string[] | null
          max_spots?: number | null
          name?: string
          price?: number | null
          slug?: string
          sort_order?: number | null
          status?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "exp_packages_experience_id_fkey"
            columns: ["experience_id"]
            isOneToOne: false
            referencedRelation: "exp_experiences"
            referencedColumns: ["id"]
          },
        ]
      }
      exp_pages: {
        Row: {
          content: string | null
          id: string
          slug: string
          title: string
          updated_at: string | null
        }
        Insert: {
          content?: string | null
          id?: string
          slug: string
          title: string
          updated_at?: string | null
        }
        Update: {
          content?: string | null
          id?: string
          slug?: string
          title?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      exp_payments: {
        Row: {
          amount: number
          booking_id: string | null
          contact_id: string | null
          created_at: string | null
          date: string | null
          direction: string | null
          experience_id: string | null
          id: string
          invoice_type: string | null
          method: string | null
          notes: string | null
          received_at: string | null
          reference: string | null
          status: string | null
          type: string
          unmatched: boolean | null
          updated_at: string | null
          vendor_id: string | null
        }
        Insert: {
          amount: number
          booking_id?: string | null
          contact_id?: string | null
          created_at?: string | null
          date?: string | null
          direction?: string | null
          experience_id?: string | null
          id?: string
          invoice_type?: string | null
          method?: string | null
          notes?: string | null
          received_at?: string | null
          reference?: string | null
          status?: string | null
          type: string
          unmatched?: boolean | null
          updated_at?: string | null
          vendor_id?: string | null
        }
        Update: {
          amount?: number
          booking_id?: string | null
          contact_id?: string | null
          created_at?: string | null
          date?: string | null
          direction?: string | null
          experience_id?: string | null
          id?: string
          invoice_type?: string | null
          method?: string | null
          notes?: string | null
          received_at?: string | null
          reference?: string | null
          status?: string | null
          type?: string
          unmatched?: boolean | null
          updated_at?: string | null
          vendor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "exp_payments_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "exp_bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exp_payments_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exp_payments_experience_id_fkey"
            columns: ["experience_id"]
            isOneToOne: false
            referencedRelation: "exp_experiences"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exp_payments_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      exp_task_templates: {
        Row: {
          created_at: string | null
          days_before_start: number | null
          default_assignee: string | null
          id: string
          name: string
          notes: string | null
        }
        Insert: {
          created_at?: string | null
          days_before_start?: number | null
          default_assignee?: string | null
          id?: string
          name: string
          notes?: string | null
        }
        Update: {
          created_at?: string | null
          days_before_start?: number | null
          default_assignee?: string | null
          id?: string
          name?: string
          notes?: string | null
        }
        Relationships: []
      }
      exp_tasks: {
        Row: {
          assignee: string | null
          booking_id: string | null
          created_at: string | null
          due_date: string | null
          experience_id: string | null
          id: string
          name: string
          notes: string | null
          status: string | null
          template_id: string | null
          updated_at: string | null
        }
        Insert: {
          assignee?: string | null
          booking_id?: string | null
          created_at?: string | null
          due_date?: string | null
          experience_id?: string | null
          id?: string
          name: string
          notes?: string | null
          status?: string | null
          template_id?: string | null
          updated_at?: string | null
        }
        Update: {
          assignee?: string | null
          booking_id?: string | null
          created_at?: string | null
          due_date?: string | null
          experience_id?: string | null
          id?: string
          name?: string
          notes?: string | null
          status?: string | null
          template_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "exp_tasks_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "exp_bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exp_tasks_experience_id_fkey"
            columns: ["experience_id"]
            isOneToOne: false
            referencedRelation: "exp_experiences"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exp_tasks_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "exp_task_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      hours_log: {
        Row: {
          category: string | null
          created_at: string | null
          date: string
          employee_id: string
          entry: string
          experience_id: string | null
          hours: number
          id: string
          is_general: boolean | null
          notes: string | null
          processed_at: string | null
          updated_at: string | null
        }
        Insert: {
          category?: string | null
          created_at?: string | null
          date: string
          employee_id: string
          entry: string
          experience_id?: string | null
          hours: number
          id?: string
          is_general?: boolean | null
          notes?: string | null
          processed_at?: string | null
          updated_at?: string | null
        }
        Update: {
          category?: string | null
          created_at?: string | null
          date?: string
          employee_id?: string
          entry?: string
          experience_id?: string | null
          hours?: number
          id?: string
          is_general?: boolean | null
          notes?: string | null
          processed_at?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "hours_log_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hours_log_experience_id_fkey"
            columns: ["experience_id"]
            isOneToOne: false
            referencedRelation: "exp_experiences"
            referencedColumns: ["id"]
          },
        ]
      }
      hw_inquiries: {
        Row: {
          contact_id: string | null
          created_at: string | null
          email: string
          id: string
          message: string | null
          name: string
          phone: string | null
          product_id: string | null
          status: string | null
        }
        Insert: {
          contact_id?: string | null
          created_at?: string | null
          email: string
          id?: string
          message?: string | null
          name: string
          phone?: string | null
          product_id?: string | null
          status?: string | null
        }
        Update: {
          contact_id?: string | null
          created_at?: string | null
          email?: string
          id?: string
          message?: string | null
          name?: string
          phone?: string | null
          product_id?: string | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "hw_inquiries_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hw_inquiries_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "hw_products"
            referencedColumns: ["id"]
          },
        ]
      }
      hw_products: {
        Row: {
          category: string
          created_at: string | null
          description: string | null
          id: string
          images: string[] | null
          name: string
          price: number | null
          slug: string
          specs: Json | null
          status: string | null
          updated_at: string | null
          year: number | null
        }
        Insert: {
          category: string
          created_at?: string | null
          description?: string | null
          id?: string
          images?: string[] | null
          name: string
          price?: number | null
          slug: string
          specs?: Json | null
          status?: string | null
          updated_at?: string | null
          year?: number | null
        }
        Update: {
          category?: string
          created_at?: string | null
          description?: string | null
          id?: string
          images?: string[] | null
          name?: string
          price?: number | null
          slug?: string
          specs?: Json | null
          status?: string | null
          updated_at?: string | null
          year?: number | null
        }
        Relationships: []
      }
      hw_variants: {
        Row: {
          id: string
          label: string
          product_id: string | null
          reserved_count: number | null
          stock_count: number | null
        }
        Insert: {
          id?: string
          label: string
          product_id?: string | null
          reserved_count?: number | null
          stock_count?: number | null
        }
        Update: {
          id?: string
          label?: string
          product_id?: string | null
          reserved_count?: number | null
          stock_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "hw_variants_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "hw_products"
            referencedColumns: ["id"]
          },
        ]
      }
      newsletter_subscribers: {
        Row: {
          email: string
          id: string
          source: string | null
          subscribed_at: string | null
          unsubscribed_at: string | null
        }
        Insert: {
          email: string
          id?: string
          source?: string | null
          subscribed_at?: string | null
          unsubscribed_at?: string | null
        }
        Update: {
          email?: string
          id?: string
          source?: string | null
          subscribed_at?: string | null
          unsubscribed_at?: string | null
        }
        Relationships: []
      }
      team_members: {
        Row: {
          active: boolean | null
          auth_user_id: string | null
          created_at: string | null
          email: string
          id: string
          name: string
          rate_per_hour: number | null
          role: string | null
        }
        Insert: {
          active?: boolean | null
          auth_user_id?: string | null
          created_at?: string | null
          email: string
          id?: string
          name: string
          rate_per_hour?: number | null
          role?: string | null
        }
        Update: {
          active?: boolean | null
          auth_user_id?: string | null
          created_at?: string | null
          email?: string
          id?: string
          name?: string
          rate_per_hour?: number | null
          role?: string | null
        }
        Relationships: []
      }
      vendors: {
        Row: {
          category: string[] | null
          chatwoot_contact_id: string | null
          company: string | null
          created_at: string | null
          email: string | null
          id: string
          name: string
          notes: string | null
          phone: string | null
          updated_at: string | null
        }
        Insert: {
          category?: string[] | null
          chatwoot_contact_id?: string | null
          company?: string | null
          created_at?: string | null
          email?: string | null
          id?: string
          name: string
          notes?: string | null
          phone?: string | null
          updated_at?: string | null
        }
        Update: {
          category?: string[] | null
          chatwoot_contact_id?: string | null
          company?: string | null
          created_at?: string | null
          email?: string | null
          id?: string
          name?: string
          notes?: string | null
          phone?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      is_admin: { Args: never; Returns: boolean }
      is_team_member: { Args: never; Returns: boolean }
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
