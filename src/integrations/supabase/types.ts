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
    PostgrestVersion: "12.2.12 (cd3cf9e)"
  }
  public: {
    Tables: {
      ai_queue: {
        Row: {
          coalesce_group_id: string | null
          completed_at: string | null
          conversation_history: Json
          conversation_id: string
          created_at: string
          id: string
          max_retries: number
          message_content: string
          message_hash: string
          message_id: string
          metadata: Json
          priority: number
          processing_started_at: string | null
          retry_count: number
          scheduled_at: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          coalesce_group_id?: string | null
          completed_at?: string | null
          conversation_history?: Json
          conversation_id: string
          created_at?: string
          id?: string
          max_retries?: number
          message_content: string
          message_hash: string
          message_id: string
          metadata?: Json
          priority?: number
          processing_started_at?: string | null
          retry_count?: number
          scheduled_at?: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          coalesce_group_id?: string | null
          completed_at?: string | null
          conversation_history?: Json
          conversation_id?: string
          created_at?: string
          id?: string
          max_retries?: number
          message_content?: string
          message_hash?: string
          message_id?: string
          metadata?: Json
          priority?: number
          processing_started_at?: string | null
          retry_count?: number
          scheduled_at?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      ai_rate_limits: {
        Row: {
          block_until: string | null
          created_at: string
          is_blocked: boolean
          last_request_at: string
          request_count: number
          updated_at: string
          user_id: string
          window_start: string
        }
        Insert: {
          block_until?: string | null
          created_at?: string
          is_blocked?: boolean
          last_request_at?: string
          request_count?: number
          updated_at?: string
          user_id: string
          window_start?: string
        }
        Update: {
          block_until?: string | null
          created_at?: string
          is_blocked?: boolean
          last_request_at?: string
          request_count?: number
          updated_at?: string
          user_id?: string
          window_start?: string
        }
        Relationships: []
      }
      beneficiaries: {
        Row: {
          aba_number: string | null
          account_number: string | null
          address_line_1: string
          address_line_2: string | null
          bank_country: string
          banking_info_type: string
          beneficiary_name: string
          beneficiary_nickname: string
          city: string
          country: string
          created_at: string
          currency: string
          email_address: string | null
          entity: string
          id: string
          invoice_1_analysis: Json | null
          invoice_1_url: string | null
          invoice_2_analysis: Json | null
          invoice_2_url: string | null
          invoices_analyzed_at: string | null
          postal_code: string
          purpose_description: string
          purpose_of_payment: string
          sending_bank_instructions: string | null
          state_province: string
          status: string
          updated_at: string
        }
        Insert: {
          aba_number?: string | null
          account_number?: string | null
          address_line_1: string
          address_line_2?: string | null
          bank_country: string
          banking_info_type: string
          beneficiary_name: string
          beneficiary_nickname: string
          city: string
          country: string
          created_at?: string
          currency: string
          email_address?: string | null
          entity: string
          id?: string
          invoice_1_analysis?: Json | null
          invoice_1_url?: string | null
          invoice_2_analysis?: Json | null
          invoice_2_url?: string | null
          invoices_analyzed_at?: string | null
          postal_code: string
          purpose_description: string
          purpose_of_payment: string
          sending_bank_instructions?: string | null
          state_province: string
          status?: string
          updated_at?: string
        }
        Update: {
          aba_number?: string | null
          account_number?: string | null
          address_line_1?: string
          address_line_2?: string | null
          bank_country?: string
          banking_info_type?: string
          beneficiary_name?: string
          beneficiary_nickname?: string
          city?: string
          country?: string
          created_at?: string
          currency?: string
          email_address?: string | null
          entity?: string
          id?: string
          invoice_1_analysis?: Json | null
          invoice_1_url?: string | null
          invoice_2_analysis?: Json | null
          invoice_2_url?: string | null
          invoices_analyzed_at?: string | null
          postal_code?: string
          purpose_description?: string
          purpose_of_payment?: string
          sending_bank_instructions?: string | null
          state_province?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      business_angles: {
        Row: {
          business_id: string
          created_at: string | null
          description: string | null
          display_order: number | null
          id: string
          is_active: boolean | null
          name: string
          slug: string
        }
        Insert: {
          business_id: string
          created_at?: string | null
          description?: string | null
          display_order?: number | null
          id?: string
          is_active?: boolean | null
          name: string
          slug: string
        }
        Update: {
          business_id?: string
          created_at?: string | null
          description?: string | null
          display_order?: number | null
          id?: string
          is_active?: boolean | null
          name?: string
          slug?: string
        }
        Relationships: [
          {
            foreignKeyName: "business_angles_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "business_tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      business_channels: {
        Row: {
          business_id: string
          created_at: string | null
          display_order: number | null
          id: string
          is_active: boolean | null
          name: string
          platform_format: string | null
          slug: string
        }
        Insert: {
          business_id: string
          created_at?: string | null
          display_order?: number | null
          id?: string
          is_active?: boolean | null
          name: string
          platform_format?: string | null
          slug: string
        }
        Update: {
          business_id?: string
          created_at?: string | null
          display_order?: number | null
          id?: string
          is_active?: boolean | null
          name?: string
          platform_format?: string | null
          slug?: string
        }
        Relationships: [
          {
            foreignKeyName: "business_channels_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "business_tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      business_tenants: {
        Row: {
          accent_color: string | null
          calendar_horizon_months: number | null
          compliance_rules: Json | null
          created_at: string | null
          disclaimer: string | null
          fonts: Json | null
          id: string
          industry: string | null
          is_active: boolean | null
          logo_url: string | null
          name: string
          posting_strategy: Json | null
          posts_per_day: number | null
          primary_color: string | null
          secondary_color: string | null
          short_disclaimer: string | null
          slug: string
          updated_at: string | null
        }
        Insert: {
          accent_color?: string | null
          calendar_horizon_months?: number | null
          compliance_rules?: Json | null
          created_at?: string | null
          disclaimer?: string | null
          fonts?: Json | null
          id?: string
          industry?: string | null
          is_active?: boolean | null
          logo_url?: string | null
          name: string
          posting_strategy?: Json | null
          posts_per_day?: number | null
          primary_color?: string | null
          secondary_color?: string | null
          short_disclaimer?: string | null
          slug: string
          updated_at?: string | null
        }
        Update: {
          accent_color?: string | null
          calendar_horizon_months?: number | null
          compliance_rules?: Json | null
          created_at?: string | null
          disclaimer?: string | null
          fonts?: Json | null
          id?: string
          industry?: string | null
          is_active?: boolean | null
          logo_url?: string | null
          name?: string
          posting_strategy?: Json | null
          posts_per_day?: number | null
          primary_color?: string | null
          secondary_color?: string | null
          short_disclaimer?: string | null
          slug?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      campaign_categories: {
        Row: {
          business_id: string
          created_at: string | null
          description: string | null
          display_order: number
          id: string
          is_active: boolean | null
          name: string
          slug: string
          updated_at: string | null
        }
        Insert: {
          business_id: string
          created_at?: string | null
          description?: string | null
          display_order?: number
          id?: string
          is_active?: boolean | null
          name: string
          slug: string
          updated_at?: string | null
        }
        Update: {
          business_id?: string
          created_at?: string | null
          description?: string | null
          display_order?: number
          id?: string
          is_active?: boolean | null
          name?: string
          slug?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "campaign_categories_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "business_tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_message_queue: {
        Row: {
          completed_at: string | null
          conversation_id: string
          created_at: string
          id: string
          max_retries: number
          message_content: string
          metadata: Json | null
          priority: number
          processing_started_at: string | null
          retry_count: number
          scheduled_at: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          conversation_id: string
          created_at?: string
          id?: string
          max_retries?: number
          message_content: string
          metadata?: Json | null
          priority?: number
          processing_started_at?: string | null
          retry_count?: number
          scheduled_at?: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          completed_at?: string | null
          conversation_id?: string
          created_at?: string
          id?: string
          max_retries?: number
          message_content?: string
          metadata?: Json | null
          priority?: number
          processing_started_at?: string | null
          retry_count?: number
          scheduled_at?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      client_applications: {
        Row: {
          client_email: string
          company_name: string
          company_summary: string | null
          contact_name: string
          created_at: string | null
          estimated_international_volume: number | null
          estimated_speis: number
          fiscal_document_url: string | null
          id: string
          international_countries: string | null
          payment_flow: string
          phone: string
          sender_company: string
          sender_email: string
          sender_name: string
          status: string | null
          submitted_at: string | null
          updated_at: string | null
          website: string | null
        }
        Insert: {
          client_email: string
          company_name: string
          company_summary?: string | null
          contact_name: string
          created_at?: string | null
          estimated_international_volume?: number | null
          estimated_speis: number
          fiscal_document_url?: string | null
          id?: string
          international_countries?: string | null
          payment_flow: string
          phone: string
          sender_company: string
          sender_email: string
          sender_name: string
          status?: string | null
          submitted_at?: string | null
          updated_at?: string | null
          website?: string | null
        }
        Update: {
          client_email?: string
          company_name?: string
          company_summary?: string | null
          contact_name?: string
          created_at?: string | null
          estimated_international_volume?: number | null
          estimated_speis?: number
          fiscal_document_url?: string | null
          id?: string
          international_countries?: string | null
          payment_flow?: string
          phone?: string
          sender_company?: string
          sender_email?: string
          sender_name?: string
          status?: string | null
          submitted_at?: string | null
          updated_at?: string | null
          website?: string | null
        }
        Relationships: []
      }
      commercial_branches: {
        Row: {
          branch_type: string | null
          business_id: string
          category_id: string
          created_at: string | null
          display_order: number
          id: string
          is_active: boolean | null
          name: string
          prompt_kit: Json | null
          slug: string
          strategic_config: Json
          updated_at: string | null
        }
        Insert: {
          branch_type?: string | null
          business_id: string
          category_id: string
          created_at?: string | null
          display_order?: number
          id?: string
          is_active?: boolean | null
          name: string
          prompt_kit?: Json | null
          slug: string
          strategic_config: Json
          updated_at?: string | null
        }
        Update: {
          branch_type?: string | null
          business_id?: string
          category_id?: string
          created_at?: string | null
          display_order?: number
          id?: string
          is_active?: boolean | null
          name?: string
          prompt_kit?: Json | null
          slug?: string
          strategic_config?: Json
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "commercial_branches_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "business_tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commercial_branches_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "campaign_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      comprobantes_historial: {
        Row: {
          archived_at: string
          archivo_url: string
          created_at: string
          email_destinatario: string
          empresa: string
          enviado_a_tiempo: boolean | null
          hora_envio: string | null
          hora_envio_aproximada: string | null
          id: string
          monto_dolares: number | null
          monto_pesos: number | null
          nombre_cliente: string
          notas_adicionales: string | null
          numero_operacion: string
          observaciones: string | null
          proximo_batch_horario: string | null
          status: string
          tiempo_procesamiento_estimado: number | null
          tipo_comprobante: string
          updated_at: string
        }
        Insert: {
          archived_at?: string
          archivo_url: string
          created_at: string
          email_destinatario: string
          empresa: string
          enviado_a_tiempo?: boolean | null
          hora_envio?: string | null
          hora_envio_aproximada?: string | null
          id?: string
          monto_dolares?: number | null
          monto_pesos?: number | null
          nombre_cliente: string
          notas_adicionales?: string | null
          numero_operacion: string
          observaciones?: string | null
          proximo_batch_horario?: string | null
          status?: string
          tiempo_procesamiento_estimado?: number | null
          tipo_comprobante: string
          updated_at: string
        }
        Update: {
          archived_at?: string
          archivo_url?: string
          created_at?: string
          email_destinatario?: string
          empresa?: string
          enviado_a_tiempo?: boolean | null
          hora_envio?: string | null
          hora_envio_aproximada?: string | null
          id?: string
          monto_dolares?: number | null
          monto_pesos?: number | null
          nombre_cliente?: string
          notas_adicionales?: string | null
          numero_operacion?: string
          observaciones?: string | null
          proximo_batch_horario?: string | null
          status?: string
          tiempo_procesamiento_estimado?: number | null
          tipo_comprobante?: string
          updated_at?: string
        }
        Relationships: []
      }
      comprobantes_pago: {
        Row: {
          archivo_url: string
          created_at: string
          email_destinatario: string
          empresa: string
          enviado_a_tiempo: boolean | null
          hora_envio: string | null
          hora_envio_aproximada: string | null
          id: string
          monto_dolares: number | null
          monto_pesos: number | null
          nombre_cliente: string
          notas_adicionales: string | null
          numero_operacion: string
          observaciones: string | null
          proximo_batch_horario: string | null
          status: string
          tiempo_procesamiento_estimado: number | null
          tipo_comprobante: string
          updated_at: string
        }
        Insert: {
          archivo_url: string
          created_at?: string
          email_destinatario: string
          empresa: string
          enviado_a_tiempo?: boolean | null
          hora_envio?: string | null
          hora_envio_aproximada?: string | null
          id?: string
          monto_dolares?: number | null
          monto_pesos?: number | null
          nombre_cliente: string
          notas_adicionales?: string | null
          numero_operacion: string
          observaciones?: string | null
          proximo_batch_horario?: string | null
          status?: string
          tiempo_procesamiento_estimado?: number | null
          tipo_comprobante: string
          updated_at?: string
        }
        Update: {
          archivo_url?: string
          created_at?: string
          email_destinatario?: string
          empresa?: string
          enviado_a_tiempo?: boolean | null
          hora_envio?: string | null
          hora_envio_aproximada?: string | null
          id?: string
          monto_dolares?: number | null
          monto_pesos?: number | null
          nombre_cliente?: string
          notas_adicionales?: string | null
          numero_operacion?: string
          observaciones?: string | null
          proximo_batch_horario?: string | null
          status?: string
          tiempo_procesamiento_estimado?: number | null
          tipo_comprobante?: string
          updated_at?: string
        }
        Relationships: []
      }
      content_calendar: {
        Row: {
          business_id: string
          channel: string
          created_at: string | null
          funnel_stage: string
          id: string
          piece_id: string | null
          quarter: string
          scheduled_date: string
          status: string
        }
        Insert: {
          business_id: string
          channel: string
          created_at?: string | null
          funnel_stage: string
          id?: string
          piece_id?: string | null
          quarter: string
          scheduled_date: string
          status?: string
        }
        Update: {
          business_id?: string
          channel?: string
          created_at?: string | null
          funnel_stage?: string
          id?: string
          piece_id?: string | null
          quarter?: string
          scheduled_date?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "content_calendar_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "business_tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_calendar_piece_id_fkey"
            columns: ["piece_id"]
            isOneToOne: false
            referencedRelation: "content_library"
            referencedColumns: ["id"]
          },
        ]
      }
      content_library: {
        Row: {
          business_id: string
          channels_adapted: boolean | null
          commercial_branch_id: string | null
          created_at: string | null
          funnel_stage: string
          id: string
          image_id: string | null
          image_type: string | null
          narrative_angle_id: string | null
          piece_data: Json
          pipeline_run_id: string | null
          status: string
          updated_at: string | null
        }
        Insert: {
          business_id: string
          channels_adapted?: boolean | null
          commercial_branch_id?: string | null
          created_at?: string | null
          funnel_stage: string
          id?: string
          image_id?: string | null
          image_type?: string | null
          narrative_angle_id?: string | null
          piece_data: Json
          pipeline_run_id?: string | null
          status?: string
          updated_at?: string | null
        }
        Update: {
          business_id?: string
          channels_adapted?: boolean | null
          commercial_branch_id?: string | null
          created_at?: string | null
          funnel_stage?: string
          id?: string
          image_id?: string | null
          image_type?: string | null
          narrative_angle_id?: string | null
          piece_data?: Json
          pipeline_run_id?: string | null
          status?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "content_library_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "business_tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_library_commercial_branch_id_fkey"
            columns: ["commercial_branch_id"]
            isOneToOne: false
            referencedRelation: "commercial_branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_library_image_id_fkey"
            columns: ["image_id"]
            isOneToOne: false
            referencedRelation: "image_library"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_library_narrative_angle_id_fkey"
            columns: ["narrative_angle_id"]
            isOneToOne: false
            referencedRelation: "narrative_angles"
            referencedColumns: ["id"]
          },
        ]
      }
      conversation_history: {
        Row: {
          compressed_history: Json
          conversation_id: string
          created_at: string
          id: string
          last_message_at: string
          token_count: number
          updated_at: string
          user_id: string
        }
        Insert: {
          compressed_history?: Json
          conversation_id: string
          created_at?: string
          id?: string
          last_message_at?: string
          token_count?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          compressed_history?: Json
          conversation_id?: string
          created_at?: string
          id?: string
          last_message_at?: string
          token_count?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      crm_prospect_actions: {
        Row: {
          accion: Database["public"]["Enums"]["accion_tipo"]
          comentario: string | null
          created_at: string | null
          hecho_por: string
          id: string
          prospect_id: string
        }
        Insert: {
          accion: Database["public"]["Enums"]["accion_tipo"]
          comentario?: string | null
          created_at?: string | null
          hecho_por: string
          id?: string
          prospect_id: string
        }
        Update: {
          accion?: Database["public"]["Enums"]["accion_tipo"]
          comentario?: string | null
          created_at?: string | null
          hecho_por?: string
          id?: string
          prospect_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_prospect_actions_prospect_id_fkey"
            columns: ["prospect_id"]
            isOneToOne: false
            referencedRelation: "crm_prospects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_prospect_actions_prospect_id_fkey"
            columns: ["prospect_id"]
            isOneToOne: false
            referencedRelation: "v_crm_kanban"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_prospect_actions_prospect_id_fkey"
            columns: ["prospect_id"]
            isOneToOne: false
            referencedRelation: "v_crm_unified"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_prospect_actions_prospect_id_fkey"
            columns: ["prospect_id"]
            isOneToOne: false
            referencedRelation: "v_pending_followups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_prospect_actions_prospect_id_fkey"
            columns: ["prospect_id"]
            isOneToOne: false
            referencedRelation: "v_stale_prospects"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_prospect_alerts: {
        Row: {
          alert_type: string
          created_at: string
          days_since_activity: number | null
          dismissed_at: string | null
          id: string
          is_dismissed: boolean
          message: string
          prospect_id: string
        }
        Insert: {
          alert_type?: string
          created_at?: string
          days_since_activity?: number | null
          dismissed_at?: string | null
          id?: string
          is_dismissed?: boolean
          message: string
          prospect_id: string
        }
        Update: {
          alert_type?: string
          created_at?: string
          days_since_activity?: number | null
          dismissed_at?: string | null
          id?: string
          is_dismissed?: boolean
          message?: string
          prospect_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_prospect_alerts_prospect_id_fkey"
            columns: ["prospect_id"]
            isOneToOne: false
            referencedRelation: "crm_prospects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_prospect_alerts_prospect_id_fkey"
            columns: ["prospect_id"]
            isOneToOne: false
            referencedRelation: "v_crm_kanban"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_prospect_alerts_prospect_id_fkey"
            columns: ["prospect_id"]
            isOneToOne: false
            referencedRelation: "v_crm_unified"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_prospect_alerts_prospect_id_fkey"
            columns: ["prospect_id"]
            isOneToOne: false
            referencedRelation: "v_pending_followups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_prospect_alerts_prospect_id_fkey"
            columns: ["prospect_id"]
            isOneToOne: false
            referencedRelation: "v_stale_prospects"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_prospect_notes: {
        Row: {
          author_email: string
          author_name: string
          created_at: string
          id: string
          message: string
          note_type: string
          prospect_id: string
        }
        Insert: {
          author_email: string
          author_name: string
          created_at?: string
          id?: string
          message: string
          note_type?: string
          prospect_id: string
        }
        Update: {
          author_email?: string
          author_name?: string
          created_at?: string
          id?: string
          message?: string
          note_type?: string
          prospect_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_prospect_notes_prospect_id_fkey"
            columns: ["prospect_id"]
            isOneToOne: false
            referencedRelation: "crm_prospects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_prospect_notes_prospect_id_fkey"
            columns: ["prospect_id"]
            isOneToOne: false
            referencedRelation: "v_crm_kanban"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_prospect_notes_prospect_id_fkey"
            columns: ["prospect_id"]
            isOneToOne: false
            referencedRelation: "v_crm_unified"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_prospect_notes_prospect_id_fkey"
            columns: ["prospect_id"]
            isOneToOne: false
            referencedRelation: "v_pending_followups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_prospect_notes_prospect_id_fkey"
            columns: ["prospect_id"]
            isOneToOne: false
            referencedRelation: "v_stale_prospects"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_prospects: {
        Row: {
          aprobado: boolean | null
          aprobado_at: string | null
          aprobado_por: string | null
          asignado_a: string | null
          autorizado_por: string | null
          cca_authorized_at: string | null
          cca_authorized_by: string | null
          cca_status: string | null
          client_email: string | null
          cliente_completed: boolean | null
          company_name: string
          company_summary: string | null
          contact_name: string | null
          created_at: string
          deleted_at: string | null
          estatus_general: string | null
          estimated_international_volume: number | null
          estimated_speis: number | null
          fecha_aprobacion_monex: string | null
          fecha_asignacion: string | null
          fecha_cambio_prioridad: string | null
          fecha_cca_firmado: string | null
          fecha_envio_firma_cliente: string | null
          fecha_envio_typeform_monex: string | null
          fecha_ingresado_sistema_cca: string | null
          fecha_observaciones_monex: string | null
          fecha_registro_type: string | null
          fecha_vobo_cca_final: string | null
          fecha_vobo_interno_cca: string | null
          fiscal_document_url: string | null
          id: string
          import_batch_id: string | null
          international_countries: string | null
          last_activity_at: string
          max_status_reached: string | null
          monex_approved_at: string | null
          monex_approved_by: string | null
          monto_cca: number | null
          observaciones_completed: boolean | null
          orden_llegada: number | null
          origen: string | null
          papeleria_completed: boolean | null
          papeleria_subida: boolean | null
          paperwork_reviewed_at: string | null
          paperwork_reviewed_by: string | null
          paperwork_uploaded_at: string | null
          paperwork_uploaded_by: string | null
          partner_company: string | null
          payment_flow: string | null
          phone: string | null
          pipeline_status: string | null
          prioridad_manual: boolean | null
          priority_level: number | null
          priority_order: number | null
          progress_percentage: number
          promoter_email: string | null
          promoter_name: string
          prospect_end_date: string | null
          proxima_llamada: string | null
          review_flag: Database["public"]["Enums"]["review_flag"] | null
          revision_completed: boolean | null
          status: string
          total_contactos: number | null
          total_llamadas: number | null
          type_status: string | null
          ultima_llamada: string | null
          updated_at: string
          user_id: string | null
          vobo_cca: boolean | null
          vobo_completed: boolean | null
          website: string | null
        }
        Insert: {
          aprobado?: boolean | null
          aprobado_at?: string | null
          aprobado_por?: string | null
          asignado_a?: string | null
          autorizado_por?: string | null
          cca_authorized_at?: string | null
          cca_authorized_by?: string | null
          cca_status?: string | null
          client_email?: string | null
          cliente_completed?: boolean | null
          company_name: string
          company_summary?: string | null
          contact_name?: string | null
          created_at?: string
          deleted_at?: string | null
          estatus_general?: string | null
          estimated_international_volume?: number | null
          estimated_speis?: number | null
          fecha_aprobacion_monex?: string | null
          fecha_asignacion?: string | null
          fecha_cambio_prioridad?: string | null
          fecha_cca_firmado?: string | null
          fecha_envio_firma_cliente?: string | null
          fecha_envio_typeform_monex?: string | null
          fecha_ingresado_sistema_cca?: string | null
          fecha_observaciones_monex?: string | null
          fecha_registro_type?: string | null
          fecha_vobo_cca_final?: string | null
          fecha_vobo_interno_cca?: string | null
          fiscal_document_url?: string | null
          id?: string
          import_batch_id?: string | null
          international_countries?: string | null
          last_activity_at?: string
          max_status_reached?: string | null
          monex_approved_at?: string | null
          monex_approved_by?: string | null
          monto_cca?: number | null
          observaciones_completed?: boolean | null
          orden_llegada?: number | null
          origen?: string | null
          papeleria_completed?: boolean | null
          papeleria_subida?: boolean | null
          paperwork_reviewed_at?: string | null
          paperwork_reviewed_by?: string | null
          paperwork_uploaded_at?: string | null
          paperwork_uploaded_by?: string | null
          partner_company?: string | null
          payment_flow?: string | null
          phone?: string | null
          pipeline_status?: string | null
          prioridad_manual?: boolean | null
          priority_level?: number | null
          priority_order?: number | null
          progress_percentage?: number
          promoter_email?: string | null
          promoter_name: string
          prospect_end_date?: string | null
          proxima_llamada?: string | null
          review_flag?: Database["public"]["Enums"]["review_flag"] | null
          revision_completed?: boolean | null
          status?: string
          total_contactos?: number | null
          total_llamadas?: number | null
          type_status?: string | null
          ultima_llamada?: string | null
          updated_at?: string
          user_id?: string | null
          vobo_cca?: boolean | null
          vobo_completed?: boolean | null
          website?: string | null
        }
        Update: {
          aprobado?: boolean | null
          aprobado_at?: string | null
          aprobado_por?: string | null
          asignado_a?: string | null
          autorizado_por?: string | null
          cca_authorized_at?: string | null
          cca_authorized_by?: string | null
          cca_status?: string | null
          client_email?: string | null
          cliente_completed?: boolean | null
          company_name?: string
          company_summary?: string | null
          contact_name?: string | null
          created_at?: string
          deleted_at?: string | null
          estatus_general?: string | null
          estimated_international_volume?: number | null
          estimated_speis?: number | null
          fecha_aprobacion_monex?: string | null
          fecha_asignacion?: string | null
          fecha_cambio_prioridad?: string | null
          fecha_cca_firmado?: string | null
          fecha_envio_firma_cliente?: string | null
          fecha_envio_typeform_monex?: string | null
          fecha_ingresado_sistema_cca?: string | null
          fecha_observaciones_monex?: string | null
          fecha_registro_type?: string | null
          fecha_vobo_cca_final?: string | null
          fecha_vobo_interno_cca?: string | null
          fiscal_document_url?: string | null
          id?: string
          import_batch_id?: string | null
          international_countries?: string | null
          last_activity_at?: string
          max_status_reached?: string | null
          monex_approved_at?: string | null
          monex_approved_by?: string | null
          monto_cca?: number | null
          observaciones_completed?: boolean | null
          orden_llegada?: number | null
          origen?: string | null
          papeleria_completed?: boolean | null
          papeleria_subida?: boolean | null
          paperwork_reviewed_at?: string | null
          paperwork_reviewed_by?: string | null
          paperwork_uploaded_at?: string | null
          paperwork_uploaded_by?: string | null
          partner_company?: string | null
          payment_flow?: string | null
          phone?: string | null
          pipeline_status?: string | null
          prioridad_manual?: boolean | null
          priority_level?: number | null
          priority_order?: number | null
          progress_percentage?: number
          promoter_email?: string | null
          promoter_name?: string
          prospect_end_date?: string | null
          proxima_llamada?: string | null
          review_flag?: Database["public"]["Enums"]["review_flag"] | null
          revision_completed?: boolean | null
          status?: string
          total_contactos?: number | null
          total_llamadas?: number | null
          type_status?: string | null
          ultima_llamada?: string | null
          updated_at?: string
          user_id?: string | null
          vobo_cca?: boolean | null
          vobo_completed?: boolean | null
          website?: string | null
        }
        Relationships: []
      }
      daily_fx_reports: {
        Row: {
          created_at: string | null
          filename: string
          id: string
          metadata: Json | null
          size: string | null
          type: string | null
          url: string
        }
        Insert: {
          created_at?: string | null
          filename: string
          id?: string
          metadata?: Json | null
          size?: string | null
          type?: string | null
          url: string
        }
        Update: {
          created_at?: string | null
          filename?: string
          id?: string
          metadata?: Json | null
          size?: string | null
          type?: string | null
          url?: string
        }
        Relationships: []
      }
      design_campaigns: {
        Row: {
          angle: string | null
          branch_data: Json | null
          brand: string
          brief: string
          business_id: string | null
          category_id: string | null
          channel: string | null
          commercial_branch_id: string | null
          content_type: string
          created_at: string | null
          id: string
          moment_id: string | null
          name: string
          partner: string
          status: string
          updated_at: string | null
          user_id: string
          vertical_id: string | null
        }
        Insert: {
          angle?: string | null
          branch_data?: Json | null
          brand: string
          brief: string
          business_id?: string | null
          category_id?: string | null
          channel?: string | null
          commercial_branch_id?: string | null
          content_type: string
          created_at?: string | null
          id?: string
          moment_id?: string | null
          name: string
          partner?: string
          status?: string
          updated_at?: string | null
          user_id: string
          vertical_id?: string | null
        }
        Update: {
          angle?: string | null
          branch_data?: Json | null
          brand?: string
          brief?: string
          business_id?: string | null
          category_id?: string | null
          channel?: string | null
          commercial_branch_id?: string | null
          content_type?: string
          created_at?: string | null
          id?: string
          moment_id?: string | null
          name?: string
          partner?: string
          status?: string
          updated_at?: string | null
          user_id?: string
          vertical_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "design_campaigns_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "business_tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "design_campaigns_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "campaign_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "design_campaigns_commercial_branch_id_fkey"
            columns: ["commercial_branch_id"]
            isOneToOne: false
            referencedRelation: "commercial_branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "design_campaigns_moment_id_fkey"
            columns: ["moment_id"]
            isOneToOne: false
            referencedRelation: "market_moments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "design_campaigns_vertical_id_fkey"
            columns: ["vertical_id"]
            isOneToOne: false
            referencedRelation: "industry_verticals"
            referencedColumns: ["id"]
          },
        ]
      }
      design_images: {
        Row: {
          brand: string
          business_id: string | null
          campaign_id: string | null
          collection: string
          created_at: string | null
          description: string
          id: string
          prompt_used: string | null
          source: string
          storage_path: string
          tags: string[] | null
          theme: string | null
          usage_count: number | null
        }
        Insert: {
          brand: string
          business_id?: string | null
          campaign_id?: string | null
          collection?: string
          created_at?: string | null
          description: string
          id?: string
          prompt_used?: string | null
          source: string
          storage_path: string
          tags?: string[] | null
          theme?: string | null
          usage_count?: number | null
        }
        Update: {
          brand?: string
          business_id?: string | null
          campaign_id?: string | null
          collection?: string
          created_at?: string | null
          description?: string
          id?: string
          prompt_used?: string | null
          source?: string
          storage_path?: string
          tags?: string[] | null
          theme?: string | null
          usage_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "design_images_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "business_tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "design_images_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "design_campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      design_library: {
        Row: {
          business_id: string
          campaign_id: string | null
          commercial_branch_id: string | null
          created_at: string | null
          cta: string
          funnel_stage: string | null
          headline: string
          html_content: string | null
          id: string
          image_id: string | null
          is_active: boolean
          narrative_angle_id: string | null
          piece_id: string | null
          platform_format: string
          promoter_name: string | null
          promoter_photo: string | null
          promoter_role: string | null
          rendered_url: string | null
          status: string
          subcopy: string
          template_id: string
          updated_at: string | null
          version_number: number
        }
        Insert: {
          business_id: string
          campaign_id?: string | null
          commercial_branch_id?: string | null
          created_at?: string | null
          cta: string
          funnel_stage?: string | null
          headline: string
          html_content?: string | null
          id?: string
          image_id?: string | null
          is_active?: boolean
          narrative_angle_id?: string | null
          piece_id?: string | null
          platform_format: string
          promoter_name?: string | null
          promoter_photo?: string | null
          promoter_role?: string | null
          rendered_url?: string | null
          status?: string
          subcopy: string
          template_id: string
          updated_at?: string | null
          version_number?: number
        }
        Update: {
          business_id?: string
          campaign_id?: string | null
          commercial_branch_id?: string | null
          created_at?: string | null
          cta?: string
          funnel_stage?: string | null
          headline?: string
          html_content?: string | null
          id?: string
          image_id?: string | null
          is_active?: boolean
          narrative_angle_id?: string | null
          piece_id?: string | null
          platform_format?: string
          promoter_name?: string | null
          promoter_photo?: string | null
          promoter_role?: string | null
          rendered_url?: string | null
          status?: string
          subcopy?: string
          template_id?: string
          updated_at?: string | null
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "design_library_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "business_tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "design_library_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "design_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "design_library_commercial_branch_id_fkey"
            columns: ["commercial_branch_id"]
            isOneToOne: false
            referencedRelation: "commercial_branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "design_library_image_id_fkey"
            columns: ["image_id"]
            isOneToOne: false
            referencedRelation: "image_library"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "design_library_narrative_angle_id_fkey"
            columns: ["narrative_angle_id"]
            isOneToOne: false
            referencedRelation: "narrative_angles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "design_library_piece_id_fkey"
            columns: ["piece_id"]
            isOneToOne: false
            referencedRelation: "design_pieces"
            referencedColumns: ["id"]
          },
        ]
      }
      design_pieces: {
        Row: {
          business_id: string | null
          campaign_id: string
          created_at: string | null
          cta: string
          headline: string
          html_content: string | null
          id: string
          image_id: string | null
          platform_format: string
          png_url: string | null
          promoter_id: string | null
          status: string
          subcopy: string
        }
        Insert: {
          business_id?: string | null
          campaign_id: string
          created_at?: string | null
          cta: string
          headline: string
          html_content?: string | null
          id?: string
          image_id?: string | null
          platform_format: string
          png_url?: string | null
          promoter_id?: string | null
          status?: string
          subcopy: string
        }
        Update: {
          business_id?: string | null
          campaign_id?: string
          created_at?: string | null
          cta?: string
          headline?: string
          html_content?: string | null
          id?: string
          image_id?: string | null
          platform_format?: string
          png_url?: string | null
          promoter_id?: string | null
          status?: string
          subcopy?: string
        }
        Relationships: [
          {
            foreignKeyName: "design_pieces_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "business_tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "design_pieces_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "design_campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      executive_companies: {
        Row: {
          assigned_at: string
          assigned_by: string | null
          company_name: string
          executive_user_id: string
          id: string
          is_active: boolean
        }
        Insert: {
          assigned_at?: string
          assigned_by?: string | null
          company_name: string
          executive_user_id: string
          id?: string
          is_active?: boolean
        }
        Update: {
          assigned_at?: string
          assigned_by?: string | null
          company_name?: string
          executive_user_id?: string
          id?: string
          is_active?: boolean
        }
        Relationships: []
      }
      extended_user_roles: {
        Row: {
          assigned_by: string | null
          created_at: string
          extended_role: string
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          assigned_by?: string | null
          created_at?: string
          extended_role?: string
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          assigned_by?: string | null
          created_at?: string
          extended_role?: string
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      financial_analysis: {
        Row: {
          analysis_date: string
          content: string
          created_at: string
          economic_data: Json | null
          id: string
          position: number | null
          title: string
          updated_at: string
        }
        Insert: {
          analysis_date: string
          content: string
          created_at?: string
          economic_data?: Json | null
          id?: string
          position?: number | null
          title: string
          updated_at?: string
        }
        Update: {
          analysis_date?: string
          content?: string
          created_at?: string
          economic_data?: Json | null
          id?: string
          position?: number | null
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      fx_deal_confirmations: {
        Row: {
          booked_by: string
          buy_amount: number
          buy_currency: string
          client_address: string | null
          client_contact: string | null
          client_email: string | null
          client_name: string
          client_phone: string | null
          created_at: string | null
          deal_number: string
          deal_type: string
          exchange_rate: number
          fee: number | null
          fee_text: string | null
          fx_dealer: string | null
          generated_by: string
          id: string
          pay_amount: number
          pay_currency: string
          pdf_generated_at: string | null
          processor: string | null
          prospect_id: string | null
          rel_manager: string | null
          remarks: string | null
          total_due: number
          trade_date: string
          updated_at: string | null
        }
        Insert: {
          booked_by: string
          buy_amount: number
          buy_currency: string
          client_address?: string | null
          client_contact?: string | null
          client_email?: string | null
          client_name: string
          client_phone?: string | null
          created_at?: string | null
          deal_number: string
          deal_type: string
          exchange_rate: number
          fee?: number | null
          fee_text?: string | null
          fx_dealer?: string | null
          generated_by: string
          id?: string
          pay_amount: number
          pay_currency: string
          pdf_generated_at?: string | null
          processor?: string | null
          prospect_id?: string | null
          rel_manager?: string | null
          remarks?: string | null
          total_due: number
          trade_date: string
          updated_at?: string | null
        }
        Update: {
          booked_by?: string
          buy_amount?: number
          buy_currency?: string
          client_address?: string | null
          client_contact?: string | null
          client_email?: string | null
          client_name?: string
          client_phone?: string | null
          created_at?: string | null
          deal_number?: string
          deal_type?: string
          exchange_rate?: number
          fee?: number | null
          fee_text?: string | null
          fx_dealer?: string | null
          generated_by?: string
          id?: string
          pay_amount?: number
          pay_currency?: string
          pdf_generated_at?: string | null
          processor?: string | null
          prospect_id?: string | null
          rel_manager?: string | null
          remarks?: string | null
          total_due?: number
          trade_date?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fx_deal_confirmations_prospect_id_fkey"
            columns: ["prospect_id"]
            isOneToOne: false
            referencedRelation: "crm_prospects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fx_deal_confirmations_prospect_id_fkey"
            columns: ["prospect_id"]
            isOneToOne: false
            referencedRelation: "v_crm_kanban"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fx_deal_confirmations_prospect_id_fkey"
            columns: ["prospect_id"]
            isOneToOne: false
            referencedRelation: "v_crm_unified"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fx_deal_confirmations_prospect_id_fkey"
            columns: ["prospect_id"]
            isOneToOne: false
            referencedRelation: "v_pending_followups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fx_deal_confirmations_prospect_id_fkey"
            columns: ["prospect_id"]
            isOneToOne: false
            referencedRelation: "v_stale_prospects"
            referencedColumns: ["id"]
          },
        ]
      }
      fx_saved_beneficiaries: {
        Row: {
          account_address: string | null
          account_name: string
          account_number: string
          bank_address: string | null
          bank_name: string | null
          beneficiary_name: string
          concept: string | null
          created_at: string | null
          id: string
          is_active: boolean | null
          swift: string | null
          user_id: string | null
        }
        Insert: {
          account_address?: string | null
          account_name: string
          account_number: string
          bank_address?: string | null
          bank_name?: string | null
          beneficiary_name: string
          concept?: string | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          swift?: string | null
          user_id?: string | null
        }
        Update: {
          account_address?: string | null
          account_name?: string
          account_number?: string
          bank_address?: string | null
          bank_name?: string | null
          beneficiary_name?: string
          concept?: string | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          swift?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      generated_ideas: {
        Row: {
          angle: string | null
          branch_id: string | null
          business_id: string
          channel: string | null
          created_at: string | null
          cta: string
          headline: string
          id: string
          image_suggestion: string | null
          moment_id: string | null
          status: string
          subcopy: string
          vertical_id: string | null
        }
        Insert: {
          angle?: string | null
          branch_id?: string | null
          business_id: string
          channel?: string | null
          created_at?: string | null
          cta: string
          headline: string
          id?: string
          image_suggestion?: string | null
          moment_id?: string | null
          status?: string
          subcopy: string
          vertical_id?: string | null
        }
        Update: {
          angle?: string | null
          branch_id?: string | null
          business_id?: string
          channel?: string | null
          created_at?: string | null
          cta?: string
          headline?: string
          id?: string
          image_suggestion?: string | null
          moment_id?: string | null
          status?: string
          subcopy?: string
          vertical_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "generated_ideas_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "commercial_branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "generated_ideas_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "business_tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "generated_ideas_moment_id_fkey"
            columns: ["moment_id"]
            isOneToOne: false
            referencedRelation: "market_moments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "generated_ideas_vertical_id_fkey"
            columns: ["vertical_id"]
            isOneToOne: false
            referencedRelation: "industry_verticals"
            referencedColumns: ["id"]
          },
        ]
      }
      image_library: {
        Row: {
          angle_tag: string
          business_id: string
          commercial_branch_id: string | null
          created_at: string | null
          id: string
          image_base64: string | null
          image_intent: string | null
          image_type: string | null
          image_url: string | null
          pipeline_run_id: string | null
        }
        Insert: {
          angle_tag: string
          business_id: string
          commercial_branch_id?: string | null
          created_at?: string | null
          id?: string
          image_base64?: string | null
          image_intent?: string | null
          image_type?: string | null
          image_url?: string | null
          pipeline_run_id?: string | null
        }
        Update: {
          angle_tag?: string
          business_id?: string
          commercial_branch_id?: string | null
          created_at?: string | null
          id?: string
          image_base64?: string | null
          image_intent?: string | null
          image_type?: string | null
          image_url?: string | null
          pipeline_run_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "image_library_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "business_tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "image_library_commercial_branch_id_fkey"
            columns: ["commercial_branch_id"]
            isOneToOne: false
            referencedRelation: "commercial_branches"
            referencedColumns: ["id"]
          },
        ]
      }
      industry_verticals: {
        Row: {
          business_id: string
          category_id: string
          created_at: string | null
          description: string | null
          display_order: number
          id: string
          is_active: boolean | null
          keywords: string[] | null
          name: string
          slug: string
          updated_at: string | null
          visual_context: string | null
        }
        Insert: {
          business_id: string
          category_id: string
          created_at?: string | null
          description?: string | null
          display_order?: number
          id?: string
          is_active?: boolean | null
          keywords?: string[] | null
          name: string
          slug: string
          updated_at?: string | null
          visual_context?: string | null
        }
        Update: {
          business_id?: string
          category_id?: string
          created_at?: string | null
          description?: string | null
          display_order?: number
          id?: string
          is_active?: boolean | null
          keywords?: string[] | null
          name?: string
          slug?: string
          updated_at?: string | null
          visual_context?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "industry_verticals_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "business_tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "industry_verticals_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "campaign_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      market_data_snapshots: {
        Row: {
          created_at: string | null
          data: Json
          data_type: string
          id: string
          metadata: Json | null
          snapshot_date: string
          snapshot_time: string
          source: string | null
        }
        Insert: {
          created_at?: string | null
          data: Json
          data_type: string
          id?: string
          metadata?: Json | null
          snapshot_date: string
          snapshot_time?: string
          source?: string | null
        }
        Update: {
          created_at?: string | null
          data?: Json
          data_type?: string
          id?: string
          metadata?: Json | null
          snapshot_date?: string
          snapshot_time?: string
          source?: string | null
        }
        Relationships: []
      }
      market_moments: {
        Row: {
          business_id: string
          category_id: string
          created_at: string | null
          description: string | null
          id: string
          is_active: boolean | null
          name: string
          slug: string
          trigger_type: string
          updated_at: string | null
        }
        Insert: {
          business_id: string
          category_id: string
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          slug: string
          trigger_type: string
          updated_at?: string | null
        }
        Update: {
          business_id?: string
          category_id?: string
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          slug?: string
          trigger_type?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "market_moments_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "business_tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "market_moments_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "campaign_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      master_prompts: {
        Row: {
          business_id: string
          created_at: string | null
          id: string
          prompt_text: string
          prompt_type: string
          version: number
        }
        Insert: {
          business_id: string
          created_at?: string | null
          id?: string
          prompt_text: string
          prompt_type?: string
          version?: number
        }
        Update: {
          business_id?: string
          created_at?: string | null
          id?: string
          prompt_text?: string
          prompt_type?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "master_prompts_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "business_tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      members: {
        Row: {
          created_at: string | null
          display_name: string
          id: string
          role: string | null
          user_id: string | null
          workspace_id: string | null
        }
        Insert: {
          created_at?: string | null
          display_name: string
          id?: string
          role?: string | null
          user_id?: string | null
          workspace_id?: string | null
        }
        Update: {
          created_at?: string | null
          display_name?: string
          id?: string
          role?: string | null
          user_id?: string | null
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "members_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      monex_clients: {
        Row: {
          client_name: string
          compliance_status: string
          country: string
          created_at: string
          customer_id: string
          entity_id: string
          id: string
          updated_at: string
        }
        Insert: {
          client_name: string
          compliance_status: string
          country: string
          created_at?: string
          customer_id: string
          entity_id: string
          id?: string
          updated_at?: string
        }
        Update: {
          client_name?: string
          compliance_status?: string
          country?: string
          created_at?: string
          customer_id?: string
          entity_id?: string
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      monex_companies: {
        Row: {
          broker_expires: string | null
          broker_id: string | null
          broker_rate: number | null
          created_at: string | null
          id: string
          name: string
          owner_id: string | null
          splits: Json | null
          type: string
          updated_at: string | null
        }
        Insert: {
          broker_expires?: string | null
          broker_id?: string | null
          broker_rate?: number | null
          created_at?: string | null
          id?: string
          name: string
          owner_id?: string | null
          splits?: Json | null
          type: string
          updated_at?: string | null
        }
        Update: {
          broker_expires?: string | null
          broker_id?: string | null
          broker_rate?: number | null
          created_at?: string | null
          id?: string
          name?: string
          owner_id?: string | null
          splits?: Json | null
          type?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "monex_companies_broker_id_fkey"
            columns: ["broker_id"]
            isOneToOne: false
            referencedRelation: "monex_promoters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "monex_companies_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "monex_promoters"
            referencedColumns: ["id"]
          },
        ]
      }
      monex_promoters: {
        Row: {
          created_at: string | null
          default_rate: number | null
          id: string
          name: string
          type: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          default_rate?: number | null
          id?: string
          name: string
          type: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          default_rate?: number | null
          id?: string
          name?: string
          type?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      monex_report_operations: {
        Row: {
          client_name: string
          commission_amount: number
          created_at: string | null
          deal_number: string
          details: Json | null
          id: string
          operation_date: string
          promoter_name: string
          report_id: string | null
          total_revenue: number
        }
        Insert: {
          client_name: string
          commission_amount: number
          created_at?: string | null
          deal_number: string
          details?: Json | null
          id?: string
          operation_date: string
          promoter_name: string
          report_id?: string | null
          total_revenue: number
        }
        Update: {
          client_name?: string
          commission_amount?: number
          created_at?: string | null
          deal_number?: string
          details?: Json | null
          id?: string
          operation_date?: string
          promoter_name?: string
          report_id?: string | null
          total_revenue?: number
        }
        Relationships: [
          {
            foreignKeyName: "monex_report_operations_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "monex_reports"
            referencedColumns: ["id"]
          },
        ]
      }
      monex_reports: {
        Row: {
          created_at: string | null
          id: string
          month: number
          status: string
          summary_data: Json | null
          updated_at: string | null
          year: number
        }
        Insert: {
          created_at?: string | null
          id?: string
          month: number
          status?: string
          summary_data?: Json | null
          updated_at?: string | null
          year: number
        }
        Update: {
          created_at?: string | null
          id?: string
          month?: number
          status?: string
          summary_data?: Json | null
          updated_at?: string | null
          year?: number
        }
        Relationships: []
      }
      monex_transactions: {
        Row: {
          buy_amount: number
          buy_currency: string
          client_exchange_rate: number | null
          client_name: string
          created_at: string | null
          currency_pair: string | null
          deal_number: string
          deal_type: string
          entry_date: string
          has_cost: boolean | null
          id: string
          owner_name: string | null
          owner_type: string | null
          report_month: string | null
          report_year: number | null
          sell_amount: number
          sell_currency: string
          trading_cost_rate: number | null
          updated_at: string | null
          volume_usd: number | null
        }
        Insert: {
          buy_amount: number
          buy_currency: string
          client_exchange_rate?: number | null
          client_name: string
          created_at?: string | null
          currency_pair?: string | null
          deal_number: string
          deal_type: string
          entry_date: string
          has_cost?: boolean | null
          id?: string
          owner_name?: string | null
          owner_type?: string | null
          report_month?: string | null
          report_year?: number | null
          sell_amount: number
          sell_currency: string
          trading_cost_rate?: number | null
          updated_at?: string | null
          volume_usd?: number | null
        }
        Update: {
          buy_amount?: number
          buy_currency?: string
          client_exchange_rate?: number | null
          client_name?: string
          created_at?: string | null
          currency_pair?: string | null
          deal_number?: string
          deal_type?: string
          entry_date?: string
          has_cost?: boolean | null
          id?: string
          owner_name?: string | null
          owner_type?: string | null
          report_month?: string | null
          report_year?: number | null
          sell_amount?: number
          sell_currency?: string
          trading_cost_rate?: number | null
          updated_at?: string | null
          volume_usd?: number | null
        }
        Relationships: []
      }
      narrative_angles: {
        Row: {
          created_at: string | null
          description: string | null
          display_order: number | null
          funnel_stage: string
          id: string
          is_active: boolean | null
          name: string
          prompt_instruction: string
          slug: string
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          display_order?: number | null
          funnel_stage: string
          id?: string
          is_active?: boolean | null
          name: string
          prompt_instruction: string
          slug: string
        }
        Update: {
          created_at?: string | null
          description?: string | null
          display_order?: number | null
          funnel_stage?: string
          id?: string
          is_active?: boolean | null
          name?: string
          prompt_instruction?: string
          slug?: string
        }
        Relationships: []
      }
      notas_calendario: {
        Row: {
          actualizada_en: string
          autor: string | null
          contenido: string
          creada_en: string
          etiquetas: string[] | null
          fecha: string
          fuente: string | null
          id: number
          indice_diario: number
          publicada: boolean
          titulo: string
        }
        Insert: {
          actualizada_en?: string
          autor?: string | null
          contenido: string
          creada_en?: string
          etiquetas?: string[] | null
          fecha: string
          fuente?: string | null
          id?: number
          indice_diario: number
          publicada?: boolean
          titulo: string
        }
        Update: {
          actualizada_en?: string
          autor?: string | null
          contenido?: string
          creada_en?: string
          etiquetas?: string[] | null
          fecha?: string
          fuente?: string | null
          id?: number
          indice_diario?: number
          publicada?: boolean
          titulo?: string
        }
        Relationships: []
      }
      operaciones: {
        Row: {
          beneficiario_id: string | null
          cliente_nombre: string
          cliente_numero: string
          created_at: string
          estado: string
          fecha_pacto: string
          fecha_vencimiento: string | null
          id: string
          institucion_origen: string
          metodo_pago: string
          moneda: string
          monto: number
          monto_pesos: number | null
          notas: string | null
          tipo_cambio: number | null
          updated_at: string
        }
        Insert: {
          beneficiario_id?: string | null
          cliente_nombre: string
          cliente_numero: string
          created_at?: string
          estado?: string
          fecha_pacto?: string
          fecha_vencimiento?: string | null
          id?: string
          institucion_origen: string
          metodo_pago?: string
          moneda?: string
          monto: number
          monto_pesos?: number | null
          notas?: string | null
          tipo_cambio?: number | null
          updated_at?: string
        }
        Update: {
          beneficiario_id?: string | null
          cliente_nombre?: string
          cliente_numero?: string
          created_at?: string
          estado?: string
          fecha_pacto?: string
          fecha_vencimiento?: string | null
          id?: string
          institucion_origen?: string
          metodo_pago?: string
          moneda?: string
          monto?: number
          monto_pesos?: number | null
          notas?: string | null
          tipo_cambio?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "operaciones_beneficiario_id_fkey"
            columns: ["beneficiario_id"]
            isOneToOne: false
            referencedRelation: "beneficiaries"
            referencedColumns: ["id"]
          },
        ]
      }
      organizational_hierarchy: {
        Row: {
          child_user_id: string | null
          created_at: string
          created_by: string | null
          id: string
          parent_user_id: string | null
        }
        Insert: {
          child_user_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          parent_user_id?: string | null
        }
        Update: {
          child_user_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          parent_user_id?: string | null
        }
        Relationships: []
      }
      pld_alerts: {
        Row: {
          accumulated_amount: number | null
          alert_type: Database["public"]["Enums"]["pld_alert_type"]
          client_id: string
          country_code: string | null
          created_at: string
          description: string
          deviation_reason: string | null
          dictamen: string | null
          id: string
          operation_id: string | null
          period_type: string | null
          review_notes: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          severity: Database["public"]["Enums"]["pld_alert_severity"]
          status: Database["public"]["Enums"]["pld_alert_status"]
          threshold_exceeded: number | null
          title: string
        }
        Insert: {
          accumulated_amount?: number | null
          alert_type: Database["public"]["Enums"]["pld_alert_type"]
          client_id: string
          country_code?: string | null
          created_at?: string
          description: string
          deviation_reason?: string | null
          dictamen?: string | null
          id?: string
          operation_id?: string | null
          period_type?: string | null
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          severity: Database["public"]["Enums"]["pld_alert_severity"]
          status?: Database["public"]["Enums"]["pld_alert_status"]
          threshold_exceeded?: number | null
          title: string
        }
        Update: {
          accumulated_amount?: number | null
          alert_type?: Database["public"]["Enums"]["pld_alert_type"]
          client_id?: string
          country_code?: string | null
          created_at?: string
          description?: string
          deviation_reason?: string | null
          dictamen?: string | null
          id?: string
          operation_id?: string | null
          period_type?: string | null
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          severity?: Database["public"]["Enums"]["pld_alert_severity"]
          status?: Database["public"]["Enums"]["pld_alert_status"]
          threshold_exceeded?: number | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "pld_alerts_operation_id_fkey"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "pld_operations"
            referencedColumns: ["id"]
          },
        ]
      }
      pld_anonymous_reports: {
        Row: {
          contact_method: string | null
          created_at: string
          description: string
          id: string
          investigation_notes: string | null
          related_info: string | null
          resolution: string | null
          resolved_at: string | null
          resolved_by: string | null
          status: Database["public"]["Enums"]["pld_internal_report_status"]
          updated_at: string
        }
        Insert: {
          contact_method?: string | null
          created_at?: string
          description: string
          id?: string
          investigation_notes?: string | null
          related_info?: string | null
          resolution?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: Database["public"]["Enums"]["pld_internal_report_status"]
          updated_at?: string
        }
        Update: {
          contact_method?: string | null
          created_at?: string
          description?: string
          id?: string
          investigation_notes?: string | null
          related_info?: string | null
          resolution?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: Database["public"]["Enums"]["pld_internal_report_status"]
          updated_at?: string
        }
        Relationships: []
      }
      pld_audit_log: {
        Row: {
          action_type: Database["public"]["Enums"]["pld_audit_action"]
          change_summary: string | null
          created_at: string
          entity_folio: string | null
          entity_id: string | null
          entity_type: Database["public"]["Enums"]["pld_audit_entity"]
          id: string
          ip_address: string | null
          new_values: Json | null
          old_values: Json | null
          session_id: string | null
          user_agent: string | null
          user_email: string | null
          user_id: string | null
          user_role: Database["public"]["Enums"]["pld_user_role"] | null
        }
        Insert: {
          action_type: Database["public"]["Enums"]["pld_audit_action"]
          change_summary?: string | null
          created_at?: string
          entity_folio?: string | null
          entity_id?: string | null
          entity_type: Database["public"]["Enums"]["pld_audit_entity"]
          id?: string
          ip_address?: string | null
          new_values?: Json | null
          old_values?: Json | null
          session_id?: string | null
          user_agent?: string | null
          user_email?: string | null
          user_id?: string | null
          user_role?: Database["public"]["Enums"]["pld_user_role"] | null
        }
        Update: {
          action_type?: Database["public"]["Enums"]["pld_audit_action"]
          change_summary?: string | null
          created_at?: string
          entity_folio?: string | null
          entity_id?: string | null
          entity_type?: Database["public"]["Enums"]["pld_audit_entity"]
          id?: string
          ip_address?: string | null
          new_values?: Json | null
          old_values?: Json | null
          session_id?: string | null
          user_agent?: string | null
          user_email?: string | null
          user_id?: string | null
          user_role?: Database["public"]["Enums"]["pld_user_role"] | null
        }
        Relationships: []
      }
      pld_beneficial_owners: {
        Row: {
          blocked_match_id: string | null
          chain_level: number | null
          client_id: string
          control_type: Database["public"]["Enums"]["pld_control_type"]
          created_at: string
          curp: string | null
          date_of_birth: string | null
          full_name: string
          id: string
          identification_document_url: string | null
          is_blocked: boolean | null
          is_controlling: boolean | null
          is_pep: boolean | null
          last_updated_check: string | null
          nationality: string | null
          normalized_name: string
          notes: string | null
          ownership_percentage: number | null
          parent_entity_id: string | null
          pep_match_id: string | null
          rfc: string | null
          updated_at: string
          verified_at: string | null
          verified_by: string | null
        }
        Insert: {
          blocked_match_id?: string | null
          chain_level?: number | null
          client_id: string
          control_type?: Database["public"]["Enums"]["pld_control_type"]
          created_at?: string
          curp?: string | null
          date_of_birth?: string | null
          full_name: string
          id?: string
          identification_document_url?: string | null
          is_blocked?: boolean | null
          is_controlling?: boolean | null
          is_pep?: boolean | null
          last_updated_check?: string | null
          nationality?: string | null
          normalized_name: string
          notes?: string | null
          ownership_percentage?: number | null
          parent_entity_id?: string | null
          pep_match_id?: string | null
          rfc?: string | null
          updated_at?: string
          verified_at?: string | null
          verified_by?: string | null
        }
        Update: {
          blocked_match_id?: string | null
          chain_level?: number | null
          client_id?: string
          control_type?: Database["public"]["Enums"]["pld_control_type"]
          created_at?: string
          curp?: string | null
          date_of_birth?: string | null
          full_name?: string
          id?: string
          identification_document_url?: string | null
          is_blocked?: boolean | null
          is_controlling?: boolean | null
          is_pep?: boolean | null
          last_updated_check?: string | null
          nationality?: string | null
          normalized_name?: string
          notes?: string | null
          ownership_percentage?: number | null
          parent_entity_id?: string | null
          pep_match_id?: string | null
          rfc?: string | null
          updated_at?: string
          verified_at?: string | null
          verified_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pld_beneficial_owners_blocked_match_id_fkey"
            columns: ["blocked_match_id"]
            isOneToOne: false
            referencedRelation: "pld_blocked_list"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pld_beneficial_owners_parent_entity_id_fkey"
            columns: ["parent_entity_id"]
            isOneToOne: false
            referencedRelation: "pld_beneficial_owners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pld_beneficial_owners_parent_entity_id_fkey"
            columns: ["parent_entity_id"]
            isOneToOne: false
            referencedRelation: "pld_beneficial_owners_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pld_beneficial_owners_pep_match_id_fkey"
            columns: ["pep_match_id"]
            isOneToOne: false
            referencedRelation: "pld_pep_list"
            referencedColumns: ["id"]
          },
        ]
      }
      pld_blocked_list: {
        Row: {
          blocked_date: string | null
          created_at: string
          created_by: string | null
          full_name: string
          id: string
          identifier: string | null
          identifier_type: string | null
          is_active: boolean | null
          normalized_name: string
          notes: string | null
          reason: string | null
          source: Database["public"]["Enums"]["pld_blocked_source"]
          source_reference: string | null
          updated_at: string
        }
        Insert: {
          blocked_date?: string | null
          created_at?: string
          created_by?: string | null
          full_name: string
          id?: string
          identifier?: string | null
          identifier_type?: string | null
          is_active?: boolean | null
          normalized_name: string
          notes?: string | null
          reason?: string | null
          source: Database["public"]["Enums"]["pld_blocked_source"]
          source_reference?: string | null
          updated_at?: string
        }
        Update: {
          blocked_date?: string | null
          created_at?: string
          created_by?: string | null
          full_name?: string
          id?: string
          identifier?: string | null
          identifier_type?: string | null
          is_active?: boolean | null
          normalized_name?: string
          notes?: string | null
          reason?: string | null
          source?: Database["public"]["Enums"]["pld_blocked_source"]
          source_reference?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      pld_cash_approvals: {
        Row: {
          amount: number
          approval_notes: string | null
          client_id: string
          client_type: string
          created_at: string
          id: string
          operation_id: string
          rejection_reason: string | null
          requested_at: string
          requested_by: string
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          threshold_exceeded: number
          updated_at: string
        }
        Insert: {
          amount: number
          approval_notes?: string | null
          client_id: string
          client_type: string
          created_at?: string
          id?: string
          operation_id: string
          rejection_reason?: string | null
          requested_at?: string
          requested_by: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          threshold_exceeded: number
          updated_at?: string
        }
        Update: {
          amount?: number
          approval_notes?: string | null
          client_id?: string
          client_type?: string
          created_at?: string
          id?: string
          operation_id?: string
          rejection_reason?: string | null
          requested_at?: string
          requested_by?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          threshold_exceeded?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pld_cash_approvals_operation_id_fkey"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "pld_operations"
            referencedColumns: ["id"]
          },
        ]
      }
      pld_client_documents: {
        Row: {
          client_id: string
          created_at: string
          document_name: string
          document_type: Database["public"]["Enums"]["pld_document_type"]
          expiration_date: string | null
          file_size: number | null
          file_url: string
          id: string
          is_valid: boolean | null
          mime_type: string | null
          notes: string | null
          previous_version_id: string | null
          updated_at: string
          uploaded_at: string
          uploaded_by: string
          verified_at: string | null
          verified_by: string | null
          version: number | null
        }
        Insert: {
          client_id: string
          created_at?: string
          document_name: string
          document_type: Database["public"]["Enums"]["pld_document_type"]
          expiration_date?: string | null
          file_size?: number | null
          file_url: string
          id?: string
          is_valid?: boolean | null
          mime_type?: string | null
          notes?: string | null
          previous_version_id?: string | null
          updated_at?: string
          uploaded_at?: string
          uploaded_by: string
          verified_at?: string | null
          verified_by?: string | null
          version?: number | null
        }
        Update: {
          client_id?: string
          created_at?: string
          document_name?: string
          document_type?: Database["public"]["Enums"]["pld_document_type"]
          expiration_date?: string | null
          file_size?: number | null
          file_url?: string
          id?: string
          is_valid?: boolean | null
          mime_type?: string | null
          notes?: string | null
          previous_version_id?: string | null
          updated_at?: string
          uploaded_at?: string
          uploaded_by?: string
          verified_at?: string | null
          verified_by?: string | null
          version?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "pld_client_documents_previous_version_id_fkey"
            columns: ["previous_version_id"]
            isOneToOne: false
            referencedRelation: "pld_client_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pld_client_documents_previous_version_id_fkey"
            columns: ["previous_version_id"]
            isOneToOne: false
            referencedRelation: "pld_client_documents_view"
            referencedColumns: ["id"]
          },
        ]
      }
      pld_client_operations_summary: {
        Row: {
          alerts_generated: number | null
          cash_amount_mxn: number | null
          cash_operations: number | null
          client_id: string
          created_at: string
          id: string
          last_calculated_at: string | null
          period_end: string
          period_start: string
          period_type: string
          total_amount_mxn: number | null
          total_amount_usd: number | null
          total_operations: number | null
          transfer_amount_mxn: number | null
          transfer_operations: number | null
          updated_at: string
        }
        Insert: {
          alerts_generated?: number | null
          cash_amount_mxn?: number | null
          cash_operations?: number | null
          client_id: string
          created_at?: string
          id?: string
          last_calculated_at?: string | null
          period_end: string
          period_start: string
          period_type: string
          total_amount_mxn?: number | null
          total_amount_usd?: number | null
          total_operations?: number | null
          transfer_amount_mxn?: number | null
          transfer_operations?: number | null
          updated_at?: string
        }
        Update: {
          alerts_generated?: number | null
          cash_amount_mxn?: number | null
          cash_operations?: number | null
          client_id?: string
          created_at?: string
          id?: string
          last_calculated_at?: string | null
          period_end?: string
          period_start?: string
          period_type?: string
          total_amount_mxn?: number | null
          total_amount_usd?: number | null
          total_operations?: number | null
          transfer_amount_mxn?: number | null
          transfer_operations?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      pld_client_products: {
        Row: {
          available_limit: number | null
          client_id: string
          contract_url: string | null
          created_at: string | null
          created_by: string | null
          credit_limit: number | null
          currency: string
          description: string | null
          end_date: string | null
          folio: string
          id: string
          interest_rate: number | null
          notes: string | null
          product_type: Database["public"]["Enums"]["product_type"]
          renewal_date: string | null
          signed_at: string | null
          signed_by: string | null
          start_date: string
          status: Database["public"]["Enums"]["product_status"]
          updated_at: string | null
          used_amount: number | null
        }
        Insert: {
          available_limit?: number | null
          client_id: string
          contract_url?: string | null
          created_at?: string | null
          created_by?: string | null
          credit_limit?: number | null
          currency?: string
          description?: string | null
          end_date?: string | null
          folio: string
          id?: string
          interest_rate?: number | null
          notes?: string | null
          product_type: Database["public"]["Enums"]["product_type"]
          renewal_date?: string | null
          signed_at?: string | null
          signed_by?: string | null
          start_date: string
          status?: Database["public"]["Enums"]["product_status"]
          updated_at?: string | null
          used_amount?: number | null
        }
        Update: {
          available_limit?: number | null
          client_id?: string
          contract_url?: string | null
          created_at?: string | null
          created_by?: string | null
          credit_limit?: number | null
          currency?: string
          description?: string | null
          end_date?: string | null
          folio?: string
          id?: string
          interest_rate?: number | null
          notes?: string | null
          product_type?: Database["public"]["Enums"]["product_type"]
          renewal_date?: string | null
          signed_at?: string | null
          signed_by?: string | null
          start_date?: string
          status?: Database["public"]["Enums"]["product_status"]
          updated_at?: string | null
          used_amount?: number | null
        }
        Relationships: []
      }
      pld_client_risk: {
        Row: {
          activity_factor: number | null
          activity_score: number | null
          activity_weight: number | null
          calculation_notes: string | null
          client_id: string
          country_factor: number | null
          country_score: number | null
          country_weight: number | null
          created_at: string
          id: string
          last_calculated_at: string | null
          manual_override: boolean | null
          override_by: string | null
          override_reason: string | null
          pep_factor: number | null
          pep_score: number | null
          pep_weight: number | null
          risk_level: Database["public"]["Enums"]["pld_risk_level"]
          risk_score: number | null
          updated_at: string
          volume_factor: number | null
          volume_score: number | null
          volume_weight: number | null
        }
        Insert: {
          activity_factor?: number | null
          activity_score?: number | null
          activity_weight?: number | null
          calculation_notes?: string | null
          client_id: string
          country_factor?: number | null
          country_score?: number | null
          country_weight?: number | null
          created_at?: string
          id?: string
          last_calculated_at?: string | null
          manual_override?: boolean | null
          override_by?: string | null
          override_reason?: string | null
          pep_factor?: number | null
          pep_score?: number | null
          pep_weight?: number | null
          risk_level?: Database["public"]["Enums"]["pld_risk_level"]
          risk_score?: number | null
          updated_at?: string
          volume_factor?: number | null
          volume_score?: number | null
          volume_weight?: number | null
        }
        Update: {
          activity_factor?: number | null
          activity_score?: number | null
          activity_weight?: number | null
          calculation_notes?: string | null
          client_id?: string
          country_factor?: number | null
          country_score?: number | null
          country_weight?: number | null
          created_at?: string
          id?: string
          last_calculated_at?: string | null
          manual_override?: boolean | null
          override_by?: string | null
          override_reason?: string | null
          pep_factor?: number | null
          pep_score?: number | null
          pep_weight?: number | null
          risk_level?: Database["public"]["Enums"]["pld_risk_level"]
          risk_score?: number | null
          updated_at?: string
          volume_factor?: number | null
          volume_score?: number | null
          volume_weight?: number | null
        }
        Relationships: []
      }
      pld_committee_alerts: {
        Row: {
          alert_id: string
          assigned_at: string
          assigned_by: string
          assignment_notes: string | null
          created_at: string
          dictamen: Database["public"]["Enums"]["pld_committee_dictamen"] | null
          dictamen_at: string | null
          dictamen_by: string | null
          dictamen_reasoning: string | null
          follow_up_date: string | null
          follow_up_notes: string | null
          follow_up_required: boolean | null
          id: string
          meeting_id: string | null
          priority: number | null
          requires_vote: boolean | null
          review_notes: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: Database["public"]["Enums"]["pld_committee_alert_status"]
          updated_at: string
          votes_abstain: number | null
          votes_against: number | null
          votes_favor: number | null
          voting_members: string[] | null
        }
        Insert: {
          alert_id: string
          assigned_at?: string
          assigned_by: string
          assignment_notes?: string | null
          created_at?: string
          dictamen?:
            | Database["public"]["Enums"]["pld_committee_dictamen"]
            | null
          dictamen_at?: string | null
          dictamen_by?: string | null
          dictamen_reasoning?: string | null
          follow_up_date?: string | null
          follow_up_notes?: string | null
          follow_up_required?: boolean | null
          id?: string
          meeting_id?: string | null
          priority?: number | null
          requires_vote?: boolean | null
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["pld_committee_alert_status"]
          updated_at?: string
          votes_abstain?: number | null
          votes_against?: number | null
          votes_favor?: number | null
          voting_members?: string[] | null
        }
        Update: {
          alert_id?: string
          assigned_at?: string
          assigned_by?: string
          assignment_notes?: string | null
          created_at?: string
          dictamen?:
            | Database["public"]["Enums"]["pld_committee_dictamen"]
            | null
          dictamen_at?: string | null
          dictamen_by?: string | null
          dictamen_reasoning?: string | null
          follow_up_date?: string | null
          follow_up_notes?: string | null
          follow_up_required?: boolean | null
          id?: string
          meeting_id?: string | null
          priority?: number | null
          requires_vote?: boolean | null
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["pld_committee_alert_status"]
          updated_at?: string
          votes_abstain?: number | null
          votes_against?: number | null
          votes_favor?: number | null
          voting_members?: string[] | null
        }
        Relationships: [
          {
            foreignKeyName: "pld_committee_alerts_alert_id_fkey"
            columns: ["alert_id"]
            isOneToOne: true
            referencedRelation: "pld_alerts"
            referencedColumns: ["id"]
          },
        ]
      }
      pld_committee_meetings: {
        Row: {
          absent_members: string[] | null
          agenda: string | null
          attachments: Json | null
          attendees: string[] | null
          created_at: string
          created_by: string
          decisions: string | null
          ended_at: string | null
          guests: string[] | null
          id: string
          location: string | null
          meeting_date: string
          meeting_number: string
          meeting_time: string | null
          minutes: string | null
          observations: string | null
          pending_actions: string | null
          signed_minutes_url: string | null
          started_at: string | null
          status: Database["public"]["Enums"]["pld_meeting_status"]
          updated_at: string
        }
        Insert: {
          absent_members?: string[] | null
          agenda?: string | null
          attachments?: Json | null
          attendees?: string[] | null
          created_at?: string
          created_by: string
          decisions?: string | null
          ended_at?: string | null
          guests?: string[] | null
          id?: string
          location?: string | null
          meeting_date: string
          meeting_number: string
          meeting_time?: string | null
          minutes?: string | null
          observations?: string | null
          pending_actions?: string | null
          signed_minutes_url?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["pld_meeting_status"]
          updated_at?: string
        }
        Update: {
          absent_members?: string[] | null
          agenda?: string | null
          attachments?: Json | null
          attendees?: string[] | null
          created_at?: string
          created_by?: string
          decisions?: string | null
          ended_at?: string | null
          guests?: string[] | null
          id?: string
          location?: string | null
          meeting_date?: string
          meeting_number?: string
          meeting_time?: string | null
          minutes?: string | null
          observations?: string | null
          pending_actions?: string | null
          signed_minutes_url?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["pld_meeting_status"]
          updated_at?: string
        }
        Relationships: []
      }
      pld_committee_members: {
        Row: {
          created_at: string
          created_by: string | null
          department: string | null
          email: string | null
          full_name: string
          id: string
          is_active: boolean | null
          is_president: boolean | null
          is_secretary: boolean | null
          joined_at: string
          left_at: string | null
          notes: string | null
          phone: string | null
          position: string
          signature_url: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          department?: string | null
          email?: string | null
          full_name: string
          id?: string
          is_active?: boolean | null
          is_president?: boolean | null
          is_secretary?: boolean | null
          joined_at?: string
          left_at?: string | null
          notes?: string | null
          phone?: string | null
          position: string
          signature_url?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          department?: string | null
          email?: string | null
          full_name?: string
          id?: string
          is_active?: boolean | null
          is_president?: boolean | null
          is_secretary?: boolean | null
          joined_at?: string
          left_at?: string | null
          notes?: string | null
          phone?: string | null
          position?: string
          signature_url?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      pld_committee_votes: {
        Row: {
          committee_alert_id: string
          id: string
          member_id: string
          reasoning: string | null
          vote: string
          voted_at: string
        }
        Insert: {
          committee_alert_id: string
          id?: string
          member_id: string
          reasoning?: string | null
          vote: string
          voted_at?: string
        }
        Update: {
          committee_alert_id?: string
          id?: string
          member_id?: string
          reasoning?: string | null
          vote?: string
          voted_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pld_committee_votes_committee_alert_id_fkey"
            columns: ["committee_alert_id"]
            isOneToOne: false
            referencedRelation: "pld_committee_alerts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pld_committee_votes_committee_alert_id_fkey"
            columns: ["committee_alert_id"]
            isOneToOne: false
            referencedRelation: "pld_committee_alerts_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pld_committee_votes_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "pld_committee_members"
            referencedColumns: ["id"]
          },
        ]
      }
      pld_gafi_countries: {
        Row: {
          added_date: string | null
          country_code: string
          country_name: string
          created_at: string
          id: string
          is_active: boolean | null
          list_type: Database["public"]["Enums"]["pld_gafi_list_type"]
          notes: string | null
          removal_date: string | null
          updated_at: string
        }
        Insert: {
          added_date?: string | null
          country_code: string
          country_name: string
          created_at?: string
          id?: string
          is_active?: boolean | null
          list_type: Database["public"]["Enums"]["pld_gafi_list_type"]
          notes?: string | null
          removal_date?: string | null
          updated_at?: string
        }
        Update: {
          added_date?: string | null
          country_code?: string
          country_name?: string
          created_at?: string
          id?: string
          is_active?: boolean | null
          list_type?: Database["public"]["Enums"]["pld_gafi_list_type"]
          notes?: string | null
          removal_date?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      pld_internal_reports: {
        Row: {
          created_at: string
          description: string
          id: string
          investigation_notes: string | null
          related_client_id: string | null
          related_operation_id: string | null
          report_category: string | null
          report_type: string
          reporter_id: string | null
          resolution: string | null
          resolved_at: string | null
          resolved_by: string | null
          status: Database["public"]["Enums"]["pld_internal_report_status"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          description: string
          id?: string
          investigation_notes?: string | null
          related_client_id?: string | null
          related_operation_id?: string | null
          report_category?: string | null
          report_type: string
          reporter_id?: string | null
          resolution?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: Database["public"]["Enums"]["pld_internal_report_status"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          investigation_notes?: string | null
          related_client_id?: string | null
          related_operation_id?: string | null
          report_category?: string | null
          report_type?: string
          reporter_id?: string | null
          resolution?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: Database["public"]["Enums"]["pld_internal_report_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pld_internal_reports_related_operation_id_fkey"
            columns: ["related_operation_id"]
            isOneToOne: false
            referencedRelation: "pld_operations"
            referencedColumns: ["id"]
          },
        ]
      }
      pld_operations: {
        Row: {
          amount: number
          amount_usd: number | null
          approval_notes: string | null
          approved_at: string | null
          approved_by: string | null
          client_id: string
          created_at: string
          created_by: string
          currency: string
          description: string | null
          document_reference: string | null
          exchange_rate: number | null
          folio: string
          id: string
          operation_date: string
          operation_type: Database["public"]["Enums"]["pld_operation_type"]
          payment_method: Database["public"]["Enums"]["pld_payment_method"]
          rejection_reason: string | null
          requires_approval: boolean | null
          status: Database["public"]["Enums"]["pld_operation_status"]
          updated_at: string
        }
        Insert: {
          amount: number
          amount_usd?: number | null
          approval_notes?: string | null
          approved_at?: string | null
          approved_by?: string | null
          client_id: string
          created_at?: string
          created_by: string
          currency?: string
          description?: string | null
          document_reference?: string | null
          exchange_rate?: number | null
          folio: string
          id?: string
          operation_date: string
          operation_type: Database["public"]["Enums"]["pld_operation_type"]
          payment_method: Database["public"]["Enums"]["pld_payment_method"]
          rejection_reason?: string | null
          requires_approval?: boolean | null
          status?: Database["public"]["Enums"]["pld_operation_status"]
          updated_at?: string
        }
        Update: {
          amount?: number
          amount_usd?: number | null
          approval_notes?: string | null
          approved_at?: string | null
          approved_by?: string | null
          client_id?: string
          created_at?: string
          created_by?: string
          currency?: string
          description?: string | null
          document_reference?: string | null
          exchange_rate?: number | null
          folio?: string
          id?: string
          operation_date?: string
          operation_type?: Database["public"]["Enums"]["pld_operation_type"]
          payment_method?: Database["public"]["Enums"]["pld_payment_method"]
          rejection_reason?: string | null
          requires_approval?: boolean | null
          status?: Database["public"]["Enums"]["pld_operation_status"]
          updated_at?: string
        }
        Relationships: []
      }
      pld_pep_list: {
        Row: {
          country: string | null
          created_at: string
          created_by: string | null
          end_date: string | null
          full_name: string
          id: string
          institution: string | null
          is_active: boolean | null
          normalized_name: string
          notes: string | null
          position: string | null
          source: string | null
          source_reference: string | null
          start_date: string | null
          updated_at: string
        }
        Insert: {
          country?: string | null
          created_at?: string
          created_by?: string | null
          end_date?: string | null
          full_name: string
          id?: string
          institution?: string | null
          is_active?: boolean | null
          normalized_name: string
          notes?: string | null
          position?: string | null
          source?: string | null
          source_reference?: string | null
          start_date?: string | null
          updated_at?: string
        }
        Update: {
          country?: string | null
          created_at?: string
          created_by?: string | null
          end_date?: string | null
          full_name?: string
          id?: string
          institution?: string | null
          is_active?: boolean | null
          normalized_name?: string
          notes?: string | null
          position?: string | null
          source?: string | null
          source_reference?: string | null
          start_date?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      pld_risk_factors: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          factor_name: string
          factor_type: string
          factor_value: string
          id: string
          is_active: boolean | null
          risk_score: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          factor_name: string
          factor_type: string
          factor_value: string
          id?: string
          is_active?: boolean | null
          risk_score: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          factor_name?: string
          factor_type?: string
          factor_value?: string
          id?: string
          is_active?: boolean | null
          risk_score?: number
          updated_at?: string
        }
        Relationships: []
      }
      pld_risk_weights: {
        Row: {
          activity_weight: number
          country_weight: number
          id: string
          pep_weight: number
          updated_at: string | null
          updated_by: string | null
          volume_weight: number
        }
        Insert: {
          activity_weight?: number
          country_weight?: number
          id?: string
          pep_weight?: number
          updated_at?: string | null
          updated_by?: string | null
          volume_weight?: number
        }
        Update: {
          activity_weight?: number
          country_weight?: number
          id?: string
          pep_weight?: number
          updated_at?: string | null
          updated_by?: string | null
          volume_weight?: number
        }
        Relationships: []
      }
      pld_screening_logs: {
        Row: {
          blocked_matches: Json | null
          blocked_status: string
          client_id: string | null
          compliance_actions: string[] | null
          exported_at: string | null
          exported_format: string | null
          id: string
          match_score: number | null
          match_type: string | null
          notes: string | null
          pep_matches: Json | null
          pep_status: string
          risk_assessment: string | null
          search_aliases: string[] | null
          search_country: string | null
          search_dob: string | null
          search_identifier: string | null
          search_name: string
          search_name_normalized: string
          search_state: string | null
          searched_at: string
          searched_by: string | null
        }
        Insert: {
          blocked_matches?: Json | null
          blocked_status: string
          client_id?: string | null
          compliance_actions?: string[] | null
          exported_at?: string | null
          exported_format?: string | null
          id?: string
          match_score?: number | null
          match_type?: string | null
          notes?: string | null
          pep_matches?: Json | null
          pep_status: string
          risk_assessment?: string | null
          search_aliases?: string[] | null
          search_country?: string | null
          search_dob?: string | null
          search_identifier?: string | null
          search_name: string
          search_name_normalized: string
          search_state?: string | null
          searched_at?: string
          searched_by?: string | null
        }
        Update: {
          blocked_matches?: Json | null
          blocked_status?: string
          client_id?: string | null
          compliance_actions?: string[] | null
          exported_at?: string | null
          exported_format?: string | null
          id?: string
          match_score?: number | null
          match_type?: string | null
          notes?: string | null
          pep_matches?: Json | null
          pep_status?: string
          risk_assessment?: string | null
          search_aliases?: string[] | null
          search_country?: string | null
          search_dob?: string | null
          search_identifier?: string | null
          search_name?: string
          search_name_normalized?: string
          search_state?: string | null
          searched_at?: string
          searched_by?: string | null
        }
        Relationships: []
      }
      pld_thresholds: {
        Row: {
          amount: number
          created_at: string
          created_by: string | null
          currency: string
          description: string | null
          effective_from: string
          effective_to: string | null
          id: string
          is_active: boolean | null
          period: string | null
          regulatory_reference: string | null
          threshold_name: string
          threshold_type: string
          updated_at: string
        }
        Insert: {
          amount: number
          created_at?: string
          created_by?: string | null
          currency?: string
          description?: string | null
          effective_from?: string
          effective_to?: string | null
          id?: string
          is_active?: boolean | null
          period?: string | null
          regulatory_reference?: string | null
          threshold_name: string
          threshold_type: string
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string | null
          currency?: string
          description?: string | null
          effective_from?: string
          effective_to?: string | null
          id?: string
          is_active?: boolean | null
          period?: string | null
          regulatory_reference?: string | null
          threshold_name?: string
          threshold_type?: string
          updated_at?: string
        }
        Relationships: []
      }
      pld_transactional_profiles: {
        Row: {
          average_amount: number | null
          client_id: string
          country_of_origin: string | null
          created_at: string
          created_by: string
          economic_activity: string | null
          expected_frequency:
            | Database["public"]["Enums"]["pld_frequency"]
            | null
          id: string
          is_pep: boolean | null
          max_declared_amount: number | null
          notes: string | null
          pep_institution: string | null
          pep_position: string | null
          permitted_operation_types:
            | Database["public"]["Enums"]["pld_operation_type"][]
            | null
          permitted_payment_methods:
            | Database["public"]["Enums"]["pld_payment_method"][]
            | null
          source_of_funds: string | null
          updated_at: string
        }
        Insert: {
          average_amount?: number | null
          client_id: string
          country_of_origin?: string | null
          created_at?: string
          created_by: string
          economic_activity?: string | null
          expected_frequency?:
            | Database["public"]["Enums"]["pld_frequency"]
            | null
          id?: string
          is_pep?: boolean | null
          max_declared_amount?: number | null
          notes?: string | null
          pep_institution?: string | null
          pep_position?: string | null
          permitted_operation_types?:
            | Database["public"]["Enums"]["pld_operation_type"][]
            | null
          permitted_payment_methods?:
            | Database["public"]["Enums"]["pld_payment_method"][]
            | null
          source_of_funds?: string | null
          updated_at?: string
        }
        Update: {
          average_amount?: number | null
          client_id?: string
          country_of_origin?: string | null
          created_at?: string
          created_by?: string
          economic_activity?: string | null
          expected_frequency?:
            | Database["public"]["Enums"]["pld_frequency"]
            | null
          id?: string
          is_pep?: boolean | null
          max_declared_amount?: number | null
          notes?: string | null
          pep_institution?: string | null
          pep_position?: string | null
          permitted_operation_types?:
            | Database["public"]["Enums"]["pld_operation_type"][]
            | null
          permitted_payment_methods?:
            | Database["public"]["Enums"]["pld_payment_method"][]
            | null
          source_of_funds?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      pld_uif_report_operations: {
        Row: {
          alert_id: string | null
          created_at: string
          id: string
          operation_id: string
          report_id: string
        }
        Insert: {
          alert_id?: string | null
          created_at?: string
          id?: string
          operation_id: string
          report_id: string
        }
        Update: {
          alert_id?: string | null
          created_at?: string
          id?: string
          operation_id?: string
          report_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pld_uif_report_operations_alert_id_fkey"
            columns: ["alert_id"]
            isOneToOne: false
            referencedRelation: "pld_alerts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pld_uif_report_operations_operation_id_fkey"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "pld_operations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pld_uif_report_operations_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "pld_uif_reports"
            referencedColumns: ["id"]
          },
        ]
      }
      pld_uif_reports: {
        Row: {
          confirmed_at: string | null
          created_at: string
          date_from: string
          date_to: string
          deadline_at: string | null
          escalation_sent: boolean | null
          escalation_sent_at: string | null
          generated_at: string
          generated_by: string
          id: string
          is_24_hour_report: boolean | null
          notes: string | null
          operations_count: number | null
          pdf_url: string | null
          report_number: string | null
          report_type: Database["public"]["Enums"]["pld_uif_report_type"]
          risk_assessment: string | null
          status: Database["public"]["Enums"]["pld_uif_report_status"]
          submitted_at: string | null
          supporting_evidence: string | null
          suspicious_activity_description: string | null
          total_amount: number | null
          updated_at: string
        }
        Insert: {
          confirmed_at?: string | null
          created_at?: string
          date_from: string
          date_to: string
          deadline_at?: string | null
          escalation_sent?: boolean | null
          escalation_sent_at?: string | null
          generated_at?: string
          generated_by: string
          id?: string
          is_24_hour_report?: boolean | null
          notes?: string | null
          operations_count?: number | null
          pdf_url?: string | null
          report_number?: string | null
          report_type: Database["public"]["Enums"]["pld_uif_report_type"]
          risk_assessment?: string | null
          status?: Database["public"]["Enums"]["pld_uif_report_status"]
          submitted_at?: string | null
          supporting_evidence?: string | null
          suspicious_activity_description?: string | null
          total_amount?: number | null
          updated_at?: string
        }
        Update: {
          confirmed_at?: string | null
          created_at?: string
          date_from?: string
          date_to?: string
          deadline_at?: string | null
          escalation_sent?: boolean | null
          escalation_sent_at?: string | null
          generated_at?: string
          generated_by?: string
          id?: string
          is_24_hour_report?: boolean | null
          notes?: string | null
          operations_count?: number | null
          pdf_url?: string | null
          report_number?: string | null
          report_type?: Database["public"]["Enums"]["pld_uif_report_type"]
          risk_assessment?: string | null
          status?: Database["public"]["Enums"]["pld_uif_report_status"]
          submitted_at?: string | null
          supporting_evidence?: string | null
          suspicious_activity_description?: string | null
          total_amount?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      pld_user_roles: {
        Row: {
          assigned_at: string
          assigned_by: string | null
          created_at: string
          id: string
          is_active: boolean | null
          notes: string | null
          role: Database["public"]["Enums"]["pld_user_role"]
          updated_at: string
          user_id: string
        }
        Insert: {
          assigned_at?: string
          assigned_by?: string | null
          created_at?: string
          id?: string
          is_active?: boolean | null
          notes?: string | null
          role: Database["public"]["Enums"]["pld_user_role"]
          updated_at?: string
          user_id: string
        }
        Update: {
          assigned_at?: string
          assigned_by?: string | null
          created_at?: string
          id?: string
          is_active?: boolean | null
          notes?: string | null
          role?: Database["public"]["Enums"]["pld_user_role"]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          email: string
          full_name: string | null
          id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          email: string
          full_name?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string
          full_name?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      projects: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          name: string
          workspace_id: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          name: string
          workspace_id?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          name?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "projects_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      prospect_activities: {
        Row: {
          activity_type: Database["public"]["Enums"]["activity_type"]
          completado: boolean | null
          completado_at: string | null
          creado_por: string
          created_at: string | null
          descripcion: string | null
          duracion_minutos: number | null
          id: string
          programado_para: string | null
          prospect_id: string
          resultado: string | null
        }
        Insert: {
          activity_type: Database["public"]["Enums"]["activity_type"]
          completado?: boolean | null
          completado_at?: string | null
          creado_por: string
          created_at?: string | null
          descripcion?: string | null
          duracion_minutos?: number | null
          id?: string
          programado_para?: string | null
          prospect_id: string
          resultado?: string | null
        }
        Update: {
          activity_type?: Database["public"]["Enums"]["activity_type"]
          completado?: boolean | null
          completado_at?: string | null
          creado_por?: string
          created_at?: string | null
          descripcion?: string | null
          duracion_minutos?: number | null
          id?: string
          programado_para?: string | null
          prospect_id?: string
          resultado?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "prospect_activities_prospect_id_fkey"
            columns: ["prospect_id"]
            isOneToOne: false
            referencedRelation: "crm_prospects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prospect_activities_prospect_id_fkey"
            columns: ["prospect_id"]
            isOneToOne: false
            referencedRelation: "v_crm_kanban"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prospect_activities_prospect_id_fkey"
            columns: ["prospect_id"]
            isOneToOne: false
            referencedRelation: "v_crm_unified"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prospect_activities_prospect_id_fkey"
            columns: ["prospect_id"]
            isOneToOne: false
            referencedRelation: "v_pending_followups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prospect_activities_prospect_id_fkey"
            columns: ["prospect_id"]
            isOneToOne: false
            referencedRelation: "v_stale_prospects"
            referencedColumns: ["id"]
          },
        ]
      }
      prospect_imports: {
        Row: {
          asignado_a: string | null
          completed_at: string | null
          created_at: string | null
          errores: Json | null
          estado: string | null
          id: string
          importado_por: string
          nombre_archivo: string
          registros_duplicados: number | null
          registros_error: number | null
          registros_importados: number | null
          total_registros: number
        }
        Insert: {
          asignado_a?: string | null
          completed_at?: string | null
          created_at?: string | null
          errores?: Json | null
          estado?: string | null
          id?: string
          importado_por: string
          nombre_archivo: string
          registros_duplicados?: number | null
          registros_error?: number | null
          registros_importados?: number | null
          total_registros: number
        }
        Update: {
          asignado_a?: string | null
          completed_at?: string | null
          created_at?: string | null
          errores?: Json | null
          estado?: string | null
          id?: string
          importado_por?: string
          nombre_archivo?: string
          registros_duplicados?: number | null
          registros_error?: number | null
          registros_importados?: number | null
          total_registros?: number
        }
        Relationships: []
      }
      prospect_movement_logs: {
        Row: {
          auto_updated_fields: Json | null
          created_at: string | null
          from_status: string
          id: string
          movement_type: string
          prospect_id: string
          timestamp: string | null
          to_status: string
          user_email: string | null
          user_id: string | null
        }
        Insert: {
          auto_updated_fields?: Json | null
          created_at?: string | null
          from_status: string
          id?: string
          movement_type?: string
          prospect_id: string
          timestamp?: string | null
          to_status: string
          user_email?: string | null
          user_id?: string | null
        }
        Update: {
          auto_updated_fields?: Json | null
          created_at?: string | null
          from_status?: string
          id?: string
          movement_type?: string
          prospect_id?: string
          timestamp?: string | null
          to_status?: string
          user_email?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "prospect_movement_logs_prospect_id_fkey"
            columns: ["prospect_id"]
            isOneToOne: false
            referencedRelation: "crm_prospects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prospect_movement_logs_prospect_id_fkey"
            columns: ["prospect_id"]
            isOneToOne: false
            referencedRelation: "v_crm_kanban"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prospect_movement_logs_prospect_id_fkey"
            columns: ["prospect_id"]
            isOneToOne: false
            referencedRelation: "v_crm_unified"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prospect_movement_logs_prospect_id_fkey"
            columns: ["prospect_id"]
            isOneToOne: false
            referencedRelation: "v_pending_followups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prospect_movement_logs_prospect_id_fkey"
            columns: ["prospect_id"]
            isOneToOne: false
            referencedRelation: "v_stale_prospects"
            referencedColumns: ["id"]
          },
        ]
      }
      prospect_process_timeline: {
        Row: {
          created_at: string | null
          from_status: string | null
          id: string
          moved_by_user_email: string | null
          moved_by_user_id: string | null
          moved_by_user_name: string | null
          prospect_id: string
          step_color: string
          step_description: string
          step_icon: string
          step_name: string
          to_status: string
        }
        Insert: {
          created_at?: string | null
          from_status?: string | null
          id?: string
          moved_by_user_email?: string | null
          moved_by_user_id?: string | null
          moved_by_user_name?: string | null
          prospect_id: string
          step_color?: string
          step_description: string
          step_icon?: string
          step_name: string
          to_status: string
        }
        Update: {
          created_at?: string | null
          from_status?: string | null
          id?: string
          moved_by_user_email?: string | null
          moved_by_user_id?: string | null
          moved_by_user_name?: string | null
          prospect_id?: string
          step_color?: string
          step_description?: string
          step_icon?: string
          step_name?: string
          to_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "prospect_process_timeline_prospect_id_fkey"
            columns: ["prospect_id"]
            isOneToOne: false
            referencedRelation: "crm_prospects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prospect_process_timeline_prospect_id_fkey"
            columns: ["prospect_id"]
            isOneToOne: false
            referencedRelation: "v_crm_kanban"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prospect_process_timeline_prospect_id_fkey"
            columns: ["prospect_id"]
            isOneToOne: false
            referencedRelation: "v_crm_unified"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prospect_process_timeline_prospect_id_fkey"
            columns: ["prospect_id"]
            isOneToOne: false
            referencedRelation: "v_pending_followups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prospect_process_timeline_prospect_id_fkey"
            columns: ["prospect_id"]
            isOneToOne: false
            referencedRelation: "v_stale_prospects"
            referencedColumns: ["id"]
          },
        ]
      }
      schema_versions: {
        Row: {
          created_at: string | null
          entity_type: string
          id: string
          schema_definition: Json
          version: number
        }
        Insert: {
          created_at?: string | null
          entity_type: string
          id?: string
          schema_definition: Json
          version: number
        }
        Update: {
          created_at?: string | null
          entity_type?: string
          id?: string
          schema_definition?: Json
          version?: number
        }
        Relationships: []
      }
      scory2: {
        Row: {
          "Acepto declaraci├│n de veracidad y responsabilidad sobre los da":
            | string
            | null
          "Acta constitutiva -Poderes": string | null
          "Asamblea actualizada": string | null
          "C├│mo conociste al cliente": string | null
          "Comprobante Domicilio": string | null
          "Conocimiento ampliado cliente ( Explica a detalle el modelo de ":
            | string
            | null
          "Constancia CSF Accionista": string | null
          "Constancia situacion fiscal empresa": string | null
          "Correo electr├│nico": string | null
          "Creado por": string | null
          created_at: string
          "Domicilio fiscal de la empresa": string | null
          "Domicilio opeativo de la empresa": string | null
          "Facturas Empresas clientes": string | null
          "Facturas Empresas Proveedores pdf": string | null
          "Fecha de creacion": string | null
          "Fecha de primer contacto": string | null
          "Fotos exterior": string | null
          "Fotos interior empresa": string | null
          "Giro o actividad principal": string | null
          id: string
          "INE ACCIONISTAS": string | null
          "INE AUTORIZADOS": string | null
          "Nombre comercial empresa": string | null
          "Nombre de la empresa": string | null
          "Pagina de internet y redes sociales ( si no cuenta explique el ":
            | string
            | null
          "Persona de contacto principal": string | null
          Poderes: string | null
          "Telefono de contacto con ext y celular": string | null
          "Tipo Contacto": string | null
          "Ubicacion google maps": string | null
        }
        Insert: {
          "Acepto declaraci├│n de veracidad y responsabilidad sobre los da"?:
            | string
            | null
          "Acta constitutiva -Poderes"?: string | null
          "Asamblea actualizada"?: string | null
          "C├│mo conociste al cliente"?: string | null
          "Comprobante Domicilio"?: string | null
          "Conocimiento ampliado cliente ( Explica a detalle el modelo de "?:
            | string
            | null
          "Constancia CSF Accionista"?: string | null
          "Constancia situacion fiscal empresa"?: string | null
          "Correo electr├│nico"?: string | null
          "Creado por"?: string | null
          created_at?: string
          "Domicilio fiscal de la empresa"?: string | null
          "Domicilio opeativo de la empresa"?: string | null
          "Facturas Empresas clientes"?: string | null
          "Facturas Empresas Proveedores pdf"?: string | null
          "Fecha de creacion"?: string | null
          "Fecha de primer contacto"?: string | null
          "Fotos exterior"?: string | null
          "Fotos interior empresa"?: string | null
          "Giro o actividad principal"?: string | null
          id: string
          "INE ACCIONISTAS"?: string | null
          "INE AUTORIZADOS"?: string | null
          "Nombre comercial empresa"?: string | null
          "Nombre de la empresa"?: string | null
          "Pagina de internet y redes sociales ( si no cuenta explique el "?:
            | string
            | null
          "Persona de contacto principal"?: string | null
          Poderes?: string | null
          "Telefono de contacto con ext y celular"?: string | null
          "Tipo Contacto"?: string | null
          "Ubicacion google maps"?: string | null
        }
        Update: {
          "Acepto declaraci├│n de veracidad y responsabilidad sobre los da"?:
            | string
            | null
          "Acta constitutiva -Poderes"?: string | null
          "Asamblea actualizada"?: string | null
          "C├│mo conociste al cliente"?: string | null
          "Comprobante Domicilio"?: string | null
          "Conocimiento ampliado cliente ( Explica a detalle el modelo de "?:
            | string
            | null
          "Constancia CSF Accionista"?: string | null
          "Constancia situacion fiscal empresa"?: string | null
          "Correo electr├│nico"?: string | null
          "Creado por"?: string | null
          created_at?: string
          "Domicilio fiscal de la empresa"?: string | null
          "Domicilio opeativo de la empresa"?: string | null
          "Facturas Empresas clientes"?: string | null
          "Facturas Empresas Proveedores pdf"?: string | null
          "Fecha de creacion"?: string | null
          "Fecha de primer contacto"?: string | null
          "Fotos exterior"?: string | null
          "Fotos interior empresa"?: string | null
          "Giro o actividad principal"?: string | null
          id?: string
          "INE ACCIONISTAS"?: string | null
          "INE AUTORIZADOS"?: string | null
          "Nombre comercial empresa"?: string | null
          "Nombre de la empresa"?: string | null
          "Pagina de internet y redes sociales ( si no cuenta explique el "?:
            | string
            | null
          "Persona de contacto principal"?: string | null
          Poderes?: string | null
          "Telefono de contacto con ext y celular"?: string | null
          "Tipo Contacto"?: string | null
          "Ubicacion google maps"?: string | null
        }
        Relationships: []
      }
      task_alerts: {
        Row: {
          alert_type: string
          created_at: string | null
          days_inactive: number
          dismissed_at: string | null
          id: string
          task_id: string | null
          workspace_id: string | null
        }
        Insert: {
          alert_type?: string
          created_at?: string | null
          days_inactive: number
          dismissed_at?: string | null
          id?: string
          task_id?: string | null
          workspace_id?: string | null
        }
        Update: {
          alert_type?: string
          created_at?: string | null
          days_inactive?: number
          dismissed_at?: string | null
          id?: string
          task_id?: string | null
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "task_alerts_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_alerts_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      task_attachments: {
        Row: {
          created_at: string | null
          file_name: string
          id: string
          mime_type: string | null
          size_bytes: number | null
          storage_path: string
          task_id: string | null
          uploaded_by: string | null
          workspace_id: string | null
        }
        Insert: {
          created_at?: string | null
          file_name: string
          id?: string
          mime_type?: string | null
          size_bytes?: number | null
          storage_path: string
          task_id?: string | null
          uploaded_by?: string | null
          workspace_id?: string | null
        }
        Update: {
          created_at?: string | null
          file_name?: string
          id?: string
          mime_type?: string | null
          size_bytes?: number | null
          storage_path?: string
          task_id?: string | null
          uploaded_by?: string | null
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "task_attachments_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_attachments_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_attachments_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      task_modifications: {
        Row: {
          created_at: string
          field_changed: string
          id: string
          modification_type: string
          modified_by: string
          new_value: string | null
          old_value: string | null
          process_index: number | null
          task_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          field_changed: string
          id?: string
          modification_type: string
          modified_by: string
          new_value?: string | null
          old_value?: string | null
          process_index?: number | null
          task_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          field_changed?: string
          id?: string
          modification_type?: string
          modified_by?: string
          new_value?: string | null
          old_value?: string | null
          process_index?: number | null
          task_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_modifications_modified_by_fkey"
            columns: ["modified_by"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_modifications_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_modifications_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      task_notes: {
        Row: {
          author_id: string | null
          created_at: string | null
          id: string
          message: string
          task_id: string | null
          workspace_id: string | null
        }
        Insert: {
          author_id?: string | null
          created_at?: string | null
          id?: string
          message: string
          task_id?: string | null
          workspace_id?: string | null
        }
        Update: {
          author_id?: string | null
          created_at?: string | null
          id?: string
          message?: string
          task_id?: string | null
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "task_notes_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_notes_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_notes_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          assignee_id: string | null
          created_at: string | null
          description: string | null
          id: string
          last_activity_at: string | null
          progress: number
          project_id: string | null
          status: string
          title: string
          updated_at: string | null
          workspace_id: string | null
        }
        Insert: {
          assignee_id?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          last_activity_at?: string | null
          progress?: number
          project_id?: string | null
          status?: string
          title: string
          updated_at?: string | null
          workspace_id?: string | null
        }
        Update: {
          assignee_id?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          last_activity_at?: string | null
          progress?: number
          project_id?: string | null
          status?: string
          title?: string
          updated_at?: string | null
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tasks_assignee_id_fkey"
            columns: ["assignee_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      user_business_memberships: {
        Row: {
          business_id: string
          created_at: string | null
          id: string
          role: string
          user_id: string
        }
        Insert: {
          business_id: string
          created_at?: string | null
          id?: string
          role: string
          user_id: string
        }
        Update: {
          business_id?: string
          created_at?: string | null
          id?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_business_memberships_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "business_tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      user_permissions: {
        Row: {
          expires_at: string | null
          granted_at: string
          grantee_user_id: string
          grantor_user_id: string
          id: string
          is_active: boolean
          notes: string | null
          permission_type: string
          resource_type: string
          target_user_id: string | null
        }
        Insert: {
          expires_at?: string | null
          granted_at?: string
          grantee_user_id: string
          grantor_user_id: string
          id?: string
          is_active?: boolean
          notes?: string | null
          permission_type?: string
          resource_type?: string
          target_user_id?: string | null
        }
        Update: {
          expires_at?: string | null
          granted_at?: string
          grantee_user_id?: string
          grantor_user_id?: string
          id?: string
          is_active?: boolean
          notes?: string | null
          permission_type?: string
          resource_type?: string
          target_user_id?: string | null
        }
        Relationships: []
      }
      user_rate_limits: {
        Row: {
          block_until: string | null
          created_at: string
          is_blocked: boolean
          last_request_at: string
          request_count: number
          updated_at: string
          user_id: string
          window_start: string
        }
        Insert: {
          block_until?: string | null
          created_at?: string
          is_blocked?: boolean
          last_request_at?: string
          request_count?: number
          updated_at?: string
          user_id: string
          window_start?: string
        }
        Update: {
          block_until?: string | null
          created_at?: string
          is_blocked?: boolean
          last_request_at?: string
          request_count?: number
          updated_at?: string
          user_id?: string
          window_start?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["user_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["user_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["user_role"]
          user_id?: string
        }
        Relationships: []
      }
      workspaces: {
        Row: {
          created_at: string | null
          id: string
          name: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          name: string
        }
        Update: {
          created_at?: string | null
          id?: string
          name?: string
        }
        Relationships: []
      }
      xending_alert_rules: {
        Row: {
          category: string
          condition: string
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          metric_key: string
          name: string
          promoter_specific: boolean
          severity: string
          threshold_value: number
          updated_at: string
        }
        Insert: {
          category: string
          condition: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          metric_key: string
          name: string
          promoter_specific?: boolean
          severity: string
          threshold_value: number
          updated_at?: string
        }
        Update: {
          category?: string
          condition?: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          metric_key?: string
          name?: string
          promoter_specific?: boolean
          severity?: string
          threshold_value?: number
          updated_at?: string
        }
        Relationships: []
      }
      xending_alerts: {
        Row: {
          acknowledged_at: string | null
          acknowledged_by: string | null
          created_at: string
          id: string
          message: string
          metric_key: string
          metric_value: number | null
          month: string
          promoter_id: string | null
          resolved_at: string | null
          resolved_by: string | null
          rule_id: string
          severity: string
          status: string
          threshold_value: number | null
          title: string
          updated_at: string
        }
        Insert: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          created_at?: string
          id?: string
          message: string
          metric_key: string
          metric_value?: number | null
          month: string
          promoter_id?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          rule_id: string
          severity: string
          status?: string
          threshold_value?: number | null
          title: string
          updated_at?: string
        }
        Update: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          created_at?: string
          id?: string
          message?: string
          metric_key?: string
          metric_value?: number | null
          month?: string
          promoter_id?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          rule_id?: string
          severity?: string
          status?: string
          threshold_value?: number | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "xending_alerts_acknowledged_by_fkey"
            columns: ["acknowledged_by"]
            isOneToOne: false
            referencedRelation: "xending_org_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "xending_alerts_promoter_id_fkey"
            columns: ["promoter_id"]
            isOneToOne: false
            referencedRelation: "v_promoter_payout_by_partner"
            referencedColumns: ["promoter_id"]
          },
          {
            foreignKeyName: "xending_alerts_promoter_id_fkey"
            columns: ["promoter_id"]
            isOneToOne: false
            referencedRelation: "v_promoter_payout_consolidated"
            referencedColumns: ["promoter_id"]
          },
          {
            foreignKeyName: "xending_alerts_promoter_id_fkey"
            columns: ["promoter_id"]
            isOneToOne: false
            referencedRelation: "v_promoter_performance"
            referencedColumns: ["promoter_id"]
          },
          {
            foreignKeyName: "xending_alerts_promoter_id_fkey"
            columns: ["promoter_id"]
            isOneToOne: false
            referencedRelation: "v_promoter_scorecard"
            referencedColumns: ["promoter_id"]
          },
          {
            foreignKeyName: "xending_alerts_promoter_id_fkey"
            columns: ["promoter_id"]
            isOneToOne: false
            referencedRelation: "v_revenue_by_promoter_monthly"
            referencedColumns: ["promoter_id"]
          },
          {
            foreignKeyName: "xending_alerts_promoter_id_fkey"
            columns: ["promoter_id"]
            isOneToOne: false
            referencedRelation: "xending_promoters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "xending_alerts_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "xending_org_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "xending_alerts_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "xending_alert_rules"
            referencedColumns: ["id"]
          },
        ]
      }
      xending_audit_log: {
        Row: {
          actor_user_id: string | null
          after_json: Json | null
          before_json: Json | null
          created_at: string
          entity: string
          entity_id: string
          event: string
          id: string
        }
        Insert: {
          actor_user_id?: string | null
          after_json?: Json | null
          before_json?: Json | null
          created_at?: string
          entity: string
          entity_id: string
          event: string
          id?: string
        }
        Update: {
          actor_user_id?: string | null
          after_json?: Json | null
          before_json?: Json | null
          created_at?: string
          entity?: string
          entity_id?: string
          event?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "xending_audit_log_actor_user_id_fkey"
            columns: ["actor_user_id"]
            isOneToOne: false
            referencedRelation: "xending_org_users"
            referencedColumns: ["id"]
          },
        ]
      }
      xending_bank_accounts: {
        Row: {
          account_address: string | null
          account_name: string
          account_number: string
          bank_address: string | null
          bank_name: string
          created_at: string | null
          created_by: string | null
          id: string
          is_active: boolean | null
          name: string
          swift: string
        }
        Insert: {
          account_address?: string | null
          account_name: string
          account_number: string
          bank_address?: string | null
          bank_name: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          swift: string
        }
        Update: {
          account_address?: string | null
          account_name?: string
          account_number?: string
          bank_address?: string | null
          bank_name?: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          swift?: string
        }
        Relationships: []
      }
      xending_expense_categories: {
        Row: {
          display_order: number
          id: string
          is_active: boolean
          is_default: boolean
          name: string
        }
        Insert: {
          display_order?: number
          id?: string
          is_active?: boolean
          is_default?: boolean
          name: string
        }
        Update: {
          display_order?: number
          id?: string
          is_active?: boolean
          is_default?: boolean
          name?: string
        }
        Relationships: []
      }
      xending_expenses: {
        Row: {
          amount_mxn: number
          amount_usd: number
          category_id: string
          created_at: string
          created_by: string | null
          id: string
          month: string
          notes: string | null
          subcategory: string | null
          updated_at: string
        }
        Insert: {
          amount_mxn?: number
          amount_usd?: number
          category_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          month: string
          notes?: string | null
          subcategory?: string | null
          updated_at?: string
        }
        Update: {
          amount_mxn?: number
          amount_usd?: number
          category_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          month?: string
          notes?: string | null
          subcategory?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "xending_expenses_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "xending_expense_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "xending_expenses_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "xending_org_users"
            referencedColumns: ["id"]
          },
        ]
      }
      xending_kpi_monthly: {
        Row: {
          computed_at: string
          id: string
          kpi_key: string
          month: string
          value: number
        }
        Insert: {
          computed_at?: string
          id?: string
          kpi_key: string
          month: string
          value?: number
        }
        Update: {
          computed_at?: string
          id?: string
          kpi_key?: string
          month?: string
          value?: number
        }
        Relationships: []
      }
      xending_meeting_topics: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          is_done: boolean
          meeting_date: string
          notes: string | null
          proposed_by: string
          topic: string
          topic_type: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_done?: boolean
          meeting_date: string
          notes?: string | null
          proposed_by: string
          topic: string
          topic_type?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_done?: boolean
          meeting_date?: string
          notes?: string | null
          proposed_by?: string
          topic?: string
          topic_type?: string
        }
        Relationships: []
      }
      xending_org_users: {
        Row: {
          channel_prefs: Json | null
          created_at: string
          email: string
          id: string
          name: string
          role: Database["public"]["Enums"]["xending_org_role"]
          updated_at: string
        }
        Insert: {
          channel_prefs?: Json | null
          created_at?: string
          email: string
          id?: string
          name: string
          role?: Database["public"]["Enums"]["xending_org_role"]
          updated_at?: string
        }
        Update: {
          channel_prefs?: Json | null
          created_at?: string
          email?: string
          id?: string
          name?: string
          role?: Database["public"]["Enums"]["xending_org_role"]
          updated_at?: string
        }
        Relationships: []
      }
      xending_partner_config: {
        Row: {
          created_at: string
          display_name: string
          id: string
          is_active: boolean
          notes: string | null
          partner: Database["public"]["Enums"]["xending_partner_type"]
          rule_type: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_name: string
          id?: string
          is_active?: boolean
          notes?: string | null
          partner: Database["public"]["Enums"]["xending_partner_type"]
          rule_type?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_name?: string
          id?: string
          is_active?: boolean
          notes?: string | null
          partner?: Database["public"]["Enums"]["xending_partner_type"]
          rule_type?: string
          updated_at?: string
        }
        Relationships: []
      }
      xending_plan_targets: {
        Row: {
          created_at: string
          id: string
          kpi_key: string
          month: string
          scenario: Database["public"]["Enums"]["xending_scenario_type"]
          target_value: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          kpi_key: string
          month: string
          scenario?: Database["public"]["Enums"]["xending_scenario_type"]
          target_value: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          kpi_key?: string
          month?: string
          scenario?: Database["public"]["Enums"]["xending_scenario_type"]
          target_value?: number
          updated_at?: string
        }
        Relationships: []
      }
      xending_promoter_payout_rules: {
        Row: {
          broker_for_promoter_id: string | null
          broker_rate: number | null
          company_override_name: string | null
          created_at: string
          default_rate: number
          id: string
          is_active: boolean
          notes: string | null
          override_rate: number | null
          partner: Database["public"]["Enums"]["xending_partner_type"]
          promoter_id: string
          rule_type: string
          updated_at: string
          valid_from: string | null
          valid_until: string | null
        }
        Insert: {
          broker_for_promoter_id?: string | null
          broker_rate?: number | null
          company_override_name?: string | null
          created_at?: string
          default_rate?: number
          id?: string
          is_active?: boolean
          notes?: string | null
          override_rate?: number | null
          partner: Database["public"]["Enums"]["xending_partner_type"]
          promoter_id: string
          rule_type?: string
          updated_at?: string
          valid_from?: string | null
          valid_until?: string | null
        }
        Update: {
          broker_for_promoter_id?: string | null
          broker_rate?: number | null
          company_override_name?: string | null
          created_at?: string
          default_rate?: number
          id?: string
          is_active?: boolean
          notes?: string | null
          override_rate?: number | null
          partner?: Database["public"]["Enums"]["xending_partner_type"]
          promoter_id?: string
          rule_type?: string
          updated_at?: string
          valid_from?: string | null
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "xending_promoter_payout_rules_broker_for_promoter_id_fkey"
            columns: ["broker_for_promoter_id"]
            isOneToOne: false
            referencedRelation: "v_promoter_payout_by_partner"
            referencedColumns: ["promoter_id"]
          },
          {
            foreignKeyName: "xending_promoter_payout_rules_broker_for_promoter_id_fkey"
            columns: ["broker_for_promoter_id"]
            isOneToOne: false
            referencedRelation: "v_promoter_payout_consolidated"
            referencedColumns: ["promoter_id"]
          },
          {
            foreignKeyName: "xending_promoter_payout_rules_broker_for_promoter_id_fkey"
            columns: ["broker_for_promoter_id"]
            isOneToOne: false
            referencedRelation: "v_promoter_performance"
            referencedColumns: ["promoter_id"]
          },
          {
            foreignKeyName: "xending_promoter_payout_rules_broker_for_promoter_id_fkey"
            columns: ["broker_for_promoter_id"]
            isOneToOne: false
            referencedRelation: "v_promoter_scorecard"
            referencedColumns: ["promoter_id"]
          },
          {
            foreignKeyName: "xending_promoter_payout_rules_broker_for_promoter_id_fkey"
            columns: ["broker_for_promoter_id"]
            isOneToOne: false
            referencedRelation: "v_revenue_by_promoter_monthly"
            referencedColumns: ["promoter_id"]
          },
          {
            foreignKeyName: "xending_promoter_payout_rules_broker_for_promoter_id_fkey"
            columns: ["broker_for_promoter_id"]
            isOneToOne: false
            referencedRelation: "xending_promoters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "xending_promoter_payout_rules_promoter_id_fkey"
            columns: ["promoter_id"]
            isOneToOne: false
            referencedRelation: "v_promoter_payout_by_partner"
            referencedColumns: ["promoter_id"]
          },
          {
            foreignKeyName: "xending_promoter_payout_rules_promoter_id_fkey"
            columns: ["promoter_id"]
            isOneToOne: false
            referencedRelation: "v_promoter_payout_consolidated"
            referencedColumns: ["promoter_id"]
          },
          {
            foreignKeyName: "xending_promoter_payout_rules_promoter_id_fkey"
            columns: ["promoter_id"]
            isOneToOne: false
            referencedRelation: "v_promoter_performance"
            referencedColumns: ["promoter_id"]
          },
          {
            foreignKeyName: "xending_promoter_payout_rules_promoter_id_fkey"
            columns: ["promoter_id"]
            isOneToOne: false
            referencedRelation: "v_promoter_scorecard"
            referencedColumns: ["promoter_id"]
          },
          {
            foreignKeyName: "xending_promoter_payout_rules_promoter_id_fkey"
            columns: ["promoter_id"]
            isOneToOne: false
            referencedRelation: "v_revenue_by_promoter_monthly"
            referencedColumns: ["promoter_id"]
          },
          {
            foreignKeyName: "xending_promoter_payout_rules_promoter_id_fkey"
            columns: ["promoter_id"]
            isOneToOne: false
            referencedRelation: "xending_promoters"
            referencedColumns: ["id"]
          },
        ]
      }
      xending_promoter_payouts: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          created_at: string
          gross_revenue_usd: number
          id: string
          month: string
          notes: string | null
          partner: Database["public"]["Enums"]["xending_partner_type"]
          payout_amount: number
          payout_currency: string
          promoter_id: string
          rule_applied: string | null
          status: string
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          gross_revenue_usd?: number
          id?: string
          month: string
          notes?: string | null
          partner: Database["public"]["Enums"]["xending_partner_type"]
          payout_amount?: number
          payout_currency?: string
          promoter_id: string
          rule_applied?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          gross_revenue_usd?: number
          id?: string
          month?: string
          notes?: string | null
          partner?: Database["public"]["Enums"]["xending_partner_type"]
          payout_amount?: number
          payout_currency?: string
          promoter_id?: string
          rule_applied?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "xending_promoter_payouts_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "xending_org_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "xending_promoter_payouts_promoter_id_fkey"
            columns: ["promoter_id"]
            isOneToOne: false
            referencedRelation: "v_promoter_payout_by_partner"
            referencedColumns: ["promoter_id"]
          },
          {
            foreignKeyName: "xending_promoter_payouts_promoter_id_fkey"
            columns: ["promoter_id"]
            isOneToOne: false
            referencedRelation: "v_promoter_payout_consolidated"
            referencedColumns: ["promoter_id"]
          },
          {
            foreignKeyName: "xending_promoter_payouts_promoter_id_fkey"
            columns: ["promoter_id"]
            isOneToOne: false
            referencedRelation: "v_promoter_performance"
            referencedColumns: ["promoter_id"]
          },
          {
            foreignKeyName: "xending_promoter_payouts_promoter_id_fkey"
            columns: ["promoter_id"]
            isOneToOne: false
            referencedRelation: "v_promoter_scorecard"
            referencedColumns: ["promoter_id"]
          },
          {
            foreignKeyName: "xending_promoter_payouts_promoter_id_fkey"
            columns: ["promoter_id"]
            isOneToOne: false
            referencedRelation: "v_revenue_by_promoter_monthly"
            referencedColumns: ["promoter_id"]
          },
          {
            foreignKeyName: "xending_promoter_payouts_promoter_id_fkey"
            columns: ["promoter_id"]
            isOneToOne: false
            referencedRelation: "xending_promoters"
            referencedColumns: ["id"]
          },
        ]
      }
      xending_promoter_strikes: {
        Row: {
          assigned_at: string
          assigned_by: string
          created_at: string
          id: string
          promoter_id: string
          reason: string
          revert_reason: string | null
          reverted: boolean
          reverted_at: string | null
          reverted_by: string | null
          scory_company_name: string | null
          year: number
        }
        Insert: {
          assigned_at?: string
          assigned_by: string
          created_at?: string
          id?: string
          promoter_id: string
          reason: string
          revert_reason?: string | null
          reverted?: boolean
          reverted_at?: string | null
          reverted_by?: string | null
          scory_company_name?: string | null
          year: number
        }
        Update: {
          assigned_at?: string
          assigned_by?: string
          created_at?: string
          id?: string
          promoter_id?: string
          reason?: string
          revert_reason?: string | null
          reverted?: boolean
          reverted_at?: string | null
          reverted_by?: string | null
          scory_company_name?: string | null
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "xending_promoter_strikes_promoter_id_fkey"
            columns: ["promoter_id"]
            isOneToOne: false
            referencedRelation: "v_promoter_payout_by_partner"
            referencedColumns: ["promoter_id"]
          },
          {
            foreignKeyName: "xending_promoter_strikes_promoter_id_fkey"
            columns: ["promoter_id"]
            isOneToOne: false
            referencedRelation: "v_promoter_payout_consolidated"
            referencedColumns: ["promoter_id"]
          },
          {
            foreignKeyName: "xending_promoter_strikes_promoter_id_fkey"
            columns: ["promoter_id"]
            isOneToOne: false
            referencedRelation: "v_promoter_performance"
            referencedColumns: ["promoter_id"]
          },
          {
            foreignKeyName: "xending_promoter_strikes_promoter_id_fkey"
            columns: ["promoter_id"]
            isOneToOne: false
            referencedRelation: "v_promoter_scorecard"
            referencedColumns: ["promoter_id"]
          },
          {
            foreignKeyName: "xending_promoter_strikes_promoter_id_fkey"
            columns: ["promoter_id"]
            isOneToOne: false
            referencedRelation: "v_revenue_by_promoter_monthly"
            referencedColumns: ["promoter_id"]
          },
          {
            foreignKeyName: "xending_promoter_strikes_promoter_id_fkey"
            columns: ["promoter_id"]
            isOneToOne: false
            referencedRelation: "xending_promoters"
            referencedColumns: ["id"]
          },
        ]
      }
      xending_promoters: {
        Row: {
          created_at: string
          id: string
          monthly_salary_mxn: number | null
          name: string
          partner_source: Database["public"]["Enums"]["xending_partner_type"]
          revenue_target_usd: number | null
          start_date: string | null
          status: Database["public"]["Enums"]["xending_promoter_status"]
          target_monthly_revenue_mxn: number | null
          type: Database["public"]["Enums"]["xending_promoter_type"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          monthly_salary_mxn?: number | null
          name: string
          partner_source?: Database["public"]["Enums"]["xending_partner_type"]
          revenue_target_usd?: number | null
          start_date?: string | null
          status?: Database["public"]["Enums"]["xending_promoter_status"]
          target_monthly_revenue_mxn?: number | null
          type: Database["public"]["Enums"]["xending_promoter_type"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          monthly_salary_mxn?: number | null
          name?: string
          partner_source?: Database["public"]["Enums"]["xending_partner_type"]
          revenue_target_usd?: number | null
          start_date?: string | null
          status?: Database["public"]["Enums"]["xending_promoter_status"]
          target_monthly_revenue_mxn?: number | null
          type?: Database["public"]["Enums"]["xending_promoter_type"]
          updated_at?: string
        }
        Relationships: []
      }
      xending_revenue: {
        Row: {
          client_name: string | null
          created_at: string
          currency_pair: string | null
          date: string
          gross_revenue_usd: number
          id: string
          net_revenue_usd: number
          operation_count: number | null
          partner: Database["public"]["Enums"]["xending_partner_type"]
          promoter_id: string
          report_month: string
          report_year: number
          updated_at: string
          volume_usd: number | null
          xending_share_pct: number | null
        }
        Insert: {
          client_name?: string | null
          created_at?: string
          currency_pair?: string | null
          date: string
          gross_revenue_usd?: number
          id?: string
          net_revenue_usd?: number
          operation_count?: number | null
          partner: Database["public"]["Enums"]["xending_partner_type"]
          promoter_id: string
          report_month: string
          report_year: number
          updated_at?: string
          volume_usd?: number | null
          xending_share_pct?: number | null
        }
        Update: {
          client_name?: string | null
          created_at?: string
          currency_pair?: string | null
          date?: string
          gross_revenue_usd?: number
          id?: string
          net_revenue_usd?: number
          operation_count?: number | null
          partner?: Database["public"]["Enums"]["xending_partner_type"]
          promoter_id?: string
          report_month?: string
          report_year?: number
          updated_at?: string
          volume_usd?: number | null
          xending_share_pct?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "xending_revenue_promoter_id_fkey"
            columns: ["promoter_id"]
            isOneToOne: false
            referencedRelation: "v_promoter_payout_by_partner"
            referencedColumns: ["promoter_id"]
          },
          {
            foreignKeyName: "xending_revenue_promoter_id_fkey"
            columns: ["promoter_id"]
            isOneToOne: false
            referencedRelation: "v_promoter_payout_consolidated"
            referencedColumns: ["promoter_id"]
          },
          {
            foreignKeyName: "xending_revenue_promoter_id_fkey"
            columns: ["promoter_id"]
            isOneToOne: false
            referencedRelation: "v_promoter_performance"
            referencedColumns: ["promoter_id"]
          },
          {
            foreignKeyName: "xending_revenue_promoter_id_fkey"
            columns: ["promoter_id"]
            isOneToOne: false
            referencedRelation: "v_promoter_scorecard"
            referencedColumns: ["promoter_id"]
          },
          {
            foreignKeyName: "xending_revenue_promoter_id_fkey"
            columns: ["promoter_id"]
            isOneToOne: false
            referencedRelation: "v_revenue_by_promoter_monthly"
            referencedColumns: ["promoter_id"]
          },
          {
            foreignKeyName: "xending_revenue_promoter_id_fkey"
            columns: ["promoter_id"]
            isOneToOne: false
            referencedRelation: "xending_promoters"
            referencedColumns: ["id"]
          },
        ]
      }
      xending_revenue_tiers: {
        Row: {
          effective_from: string
          id: string
          is_active: boolean
          max_amount: number | null
          min_amount: number
          partner: Database["public"]["Enums"]["xending_partner_type"]
          xending_percentage: number
        }
        Insert: {
          effective_from?: string
          id?: string
          is_active?: boolean
          max_amount?: number | null
          min_amount: number
          partner: Database["public"]["Enums"]["xending_partner_type"]
          xending_percentage: number
        }
        Update: {
          effective_from?: string
          id?: string
          is_active?: boolean
          max_amount?: number | null
          min_amount?: number
          partner?: Database["public"]["Enums"]["xending_partner_type"]
          xending_percentage?: number
        }
        Relationships: []
      }
      xending_scenarios: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_active: boolean
          name: string
          scenario_params: Json
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          scenario_params?: Json
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          scenario_params?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "xending_scenarios_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "xending_org_users"
            referencedColumns: ["id"]
          },
        ]
      }
      xending_weekly_tasks: {
        Row: {
          archived_at: string | null
          assigned_to: string
          created_at: string
          created_by: string | null
          description: string | null
          due_date: string
          estimated_hours: number | null
          id: string
          notes: string | null
          priority: string
          progress: number | null
          status: string
          title: string
          updated_at: string
          week_start: string
        }
        Insert: {
          archived_at?: string | null
          assigned_to: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_date: string
          estimated_hours?: number | null
          id?: string
          notes?: string | null
          priority?: string
          progress?: number | null
          status?: string
          title: string
          updated_at?: string
          week_start: string
        }
        Update: {
          archived_at?: string | null
          assigned_to?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_date?: string
          estimated_hours?: number | null
          id?: string
          notes?: string | null
          priority?: string
          progress?: number | null
          status?: string
          title?: string
          updated_at?: string
          week_start?: string
        }
        Relationships: []
      }
    }
    Views: {
      monex_transaction_analytics_by_currency: {
        Row: {
          currency_pair: string | null
          percentage: number | null
          report_month: string | null
          report_year: number | null
          total_operations: number | null
          total_volume_usd: number | null
        }
        Relationships: []
      }
      monex_transaction_analytics_by_promoter: {
        Row: {
          operations_no_cost: number | null
          operations_with_cost: number | null
          owner_name: string | null
          owner_type: string | null
          report_month: string | null
          report_year: number | null
          total_operations: number | null
          total_volume_usd: number | null
          unique_companies: number | null
        }
        Relationships: []
      }
      monex_transaction_analytics_by_type: {
        Row: {
          deal_type: string | null
          percentage: number | null
          report_month: string | null
          report_year: number | null
          total_operations: number | null
          total_volume_usd: number | null
        }
        Relationships: []
      }
      pld_beneficial_owners_view: {
        Row: {
          blocked_match_id: string | null
          chain_level: number | null
          client_id: string | null
          control_type: Database["public"]["Enums"]["pld_control_type"] | null
          created_at: string | null
          curp: string | null
          date_of_birth: string | null
          full_name: string | null
          id: string | null
          identification_document_url: string | null
          is_blocked: boolean | null
          is_controlling: boolean | null
          is_pep: boolean | null
          last_updated_check: string | null
          nationality: string | null
          needs_update: boolean | null
          normalized_name: string | null
          notes: string | null
          ownership_percentage: number | null
          parent_entity_id: string | null
          pep_match_id: string | null
          rfc: string | null
          updated_at: string | null
          verified_at: string | null
          verified_by: string | null
        }
        Insert: {
          blocked_match_id?: string | null
          chain_level?: number | null
          client_id?: string | null
          control_type?: Database["public"]["Enums"]["pld_control_type"] | null
          created_at?: string | null
          curp?: string | null
          date_of_birth?: string | null
          full_name?: string | null
          id?: string | null
          identification_document_url?: string | null
          is_blocked?: boolean | null
          is_controlling?: boolean | null
          is_pep?: boolean | null
          last_updated_check?: string | null
          nationality?: string | null
          needs_update?: never
          normalized_name?: string | null
          notes?: string | null
          ownership_percentage?: number | null
          parent_entity_id?: string | null
          pep_match_id?: string | null
          rfc?: string | null
          updated_at?: string | null
          verified_at?: string | null
          verified_by?: string | null
        }
        Update: {
          blocked_match_id?: string | null
          chain_level?: number | null
          client_id?: string | null
          control_type?: Database["public"]["Enums"]["pld_control_type"] | null
          created_at?: string | null
          curp?: string | null
          date_of_birth?: string | null
          full_name?: string | null
          id?: string | null
          identification_document_url?: string | null
          is_blocked?: boolean | null
          is_controlling?: boolean | null
          is_pep?: boolean | null
          last_updated_check?: string | null
          nationality?: string | null
          needs_update?: never
          normalized_name?: string | null
          notes?: string | null
          ownership_percentage?: number | null
          parent_entity_id?: string | null
          pep_match_id?: string | null
          rfc?: string | null
          updated_at?: string | null
          verified_at?: string | null
          verified_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pld_beneficial_owners_blocked_match_id_fkey"
            columns: ["blocked_match_id"]
            isOneToOne: false
            referencedRelation: "pld_blocked_list"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pld_beneficial_owners_parent_entity_id_fkey"
            columns: ["parent_entity_id"]
            isOneToOne: false
            referencedRelation: "pld_beneficial_owners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pld_beneficial_owners_parent_entity_id_fkey"
            columns: ["parent_entity_id"]
            isOneToOne: false
            referencedRelation: "pld_beneficial_owners_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pld_beneficial_owners_pep_match_id_fkey"
            columns: ["pep_match_id"]
            isOneToOne: false
            referencedRelation: "pld_pep_list"
            referencedColumns: ["id"]
          },
        ]
      }
      pld_client_documents_view: {
        Row: {
          client_id: string | null
          created_at: string | null
          document_name: string | null
          document_type: Database["public"]["Enums"]["pld_document_type"] | null
          expiration_date: string | null
          file_size: number | null
          file_url: string | null
          id: string | null
          is_expired: boolean | null
          is_valid: boolean | null
          mime_type: string | null
          notes: string | null
          previous_version_id: string | null
          updated_at: string | null
          uploaded_at: string | null
          uploaded_by: string | null
          verified_at: string | null
          verified_by: string | null
          version: number | null
        }
        Insert: {
          client_id?: string | null
          created_at?: string | null
          document_name?: string | null
          document_type?:
            | Database["public"]["Enums"]["pld_document_type"]
            | null
          expiration_date?: string | null
          file_size?: number | null
          file_url?: string | null
          id?: string | null
          is_expired?: never
          is_valid?: boolean | null
          mime_type?: string | null
          notes?: string | null
          previous_version_id?: string | null
          updated_at?: string | null
          uploaded_at?: string | null
          uploaded_by?: string | null
          verified_at?: string | null
          verified_by?: string | null
          version?: number | null
        }
        Update: {
          client_id?: string | null
          created_at?: string | null
          document_name?: string | null
          document_type?:
            | Database["public"]["Enums"]["pld_document_type"]
            | null
          expiration_date?: string | null
          file_size?: number | null
          file_url?: string | null
          id?: string | null
          is_expired?: never
          is_valid?: boolean | null
          mime_type?: string | null
          notes?: string | null
          previous_version_id?: string | null
          updated_at?: string | null
          uploaded_at?: string | null
          uploaded_by?: string | null
          verified_at?: string | null
          verified_by?: string | null
          version?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "pld_client_documents_previous_version_id_fkey"
            columns: ["previous_version_id"]
            isOneToOne: false
            referencedRelation: "pld_client_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pld_client_documents_previous_version_id_fkey"
            columns: ["previous_version_id"]
            isOneToOne: false
            referencedRelation: "pld_client_documents_view"
            referencedColumns: ["id"]
          },
        ]
      }
      pld_committee_alerts_view: {
        Row: {
          alert_created_at: string | null
          alert_description: string | null
          alert_id: string | null
          alert_title: string | null
          alert_type: Database["public"]["Enums"]["pld_alert_type"] | null
          assigned_at: string | null
          client_id: string | null
          dictamen: Database["public"]["Enums"]["pld_committee_dictamen"] | null
          dictamen_at: string | null
          dictamen_reasoning: string | null
          follow_up_date: string | null
          follow_up_required: boolean | null
          id: string | null
          meeting_date: string | null
          meeting_id: string | null
          meeting_number: string | null
          operation_id: string | null
          priority: number | null
          severity: Database["public"]["Enums"]["pld_alert_severity"] | null
          status:
            | Database["public"]["Enums"]["pld_committee_alert_status"]
            | null
          votes_abstain: number | null
          votes_against: number | null
          votes_favor: number | null
        }
        Relationships: [
          {
            foreignKeyName: "pld_alerts_operation_id_fkey"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "pld_operations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pld_committee_alerts_alert_id_fkey"
            columns: ["alert_id"]
            isOneToOne: true
            referencedRelation: "pld_alerts"
            referencedColumns: ["id"]
          },
        ]
      }
      pld_committee_meetings_summary: {
        Row: {
          absent_count: number | null
          alerts_dictaminated: number | null
          alerts_reviewed: number | null
          attendees_count: number | null
          created_at: string | null
          id: string | null
          location: string | null
          meeting_date: string | null
          meeting_number: string | null
          status: Database["public"]["Enums"]["pld_meeting_status"] | null
        }
        Insert: {
          absent_count?: never
          alerts_dictaminated?: never
          alerts_reviewed?: never
          attendees_count?: never
          created_at?: string | null
          id?: string | null
          location?: string | null
          meeting_date?: string | null
          meeting_number?: string | null
          status?: Database["public"]["Enums"]["pld_meeting_status"] | null
        }
        Update: {
          absent_count?: never
          alerts_dictaminated?: never
          alerts_reviewed?: never
          attendees_count?: never
          created_at?: string | null
          id?: string | null
          location?: string | null
          meeting_date?: string | null
          meeting_number?: string | null
          status?: Database["public"]["Enums"]["pld_meeting_status"] | null
        }
        Relationships: []
      }
      v_active_alerts: {
        Row: {
          acknowledged_at: string | null
          acknowledged_by: string | null
          created_at: string | null
          id: string | null
          message: string | null
          metric_key: string | null
          metric_value: number | null
          month: string | null
          promoter_id: string | null
          promoter_name: string | null
          rule_category: string | null
          rule_name: string | null
          severity: string | null
          status: string | null
          threshold_value: number | null
          title: string | null
        }
        Relationships: [
          {
            foreignKeyName: "xending_alerts_acknowledged_by_fkey"
            columns: ["acknowledged_by"]
            isOneToOne: false
            referencedRelation: "xending_org_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "xending_alerts_promoter_id_fkey"
            columns: ["promoter_id"]
            isOneToOne: false
            referencedRelation: "v_promoter_payout_by_partner"
            referencedColumns: ["promoter_id"]
          },
          {
            foreignKeyName: "xending_alerts_promoter_id_fkey"
            columns: ["promoter_id"]
            isOneToOne: false
            referencedRelation: "v_promoter_payout_consolidated"
            referencedColumns: ["promoter_id"]
          },
          {
            foreignKeyName: "xending_alerts_promoter_id_fkey"
            columns: ["promoter_id"]
            isOneToOne: false
            referencedRelation: "v_promoter_performance"
            referencedColumns: ["promoter_id"]
          },
          {
            foreignKeyName: "xending_alerts_promoter_id_fkey"
            columns: ["promoter_id"]
            isOneToOne: false
            referencedRelation: "v_promoter_scorecard"
            referencedColumns: ["promoter_id"]
          },
          {
            foreignKeyName: "xending_alerts_promoter_id_fkey"
            columns: ["promoter_id"]
            isOneToOne: false
            referencedRelation: "v_revenue_by_promoter_monthly"
            referencedColumns: ["promoter_id"]
          },
          {
            foreignKeyName: "xending_alerts_promoter_id_fkey"
            columns: ["promoter_id"]
            isOneToOne: false
            referencedRelation: "xending_promoters"
            referencedColumns: ["id"]
          },
        ]
      }
      v_avg_time_per_stage: {
        Row: {
          avg_days: number | null
          stage_transition: string | null
          transition_count: number | null
        }
        Relationships: []
      }
      v_breakeven_analysis: {
        Row: {
          cumulative_expenses_usd: number | null
          cumulative_margin_usd: number | null
          cumulative_revenue_usd: number | null
          expenses_usd: number | null
          is_breakeven: boolean | null
          month: string | null
          net_margin_usd: number | null
          revenue_usd: number | null
        }
        Relationships: []
      }
      v_calls_per_day_by_promoter: {
        Row: {
          dias_con_llamadas: number | null
          promedio_llamadas_dia: number | null
          promotor: string | null
          total_llamadas: number | null
        }
        Relationships: []
      }
      v_client_products_summary: {
        Row: {
          active_products: number | null
          client_id: string | null
          credito_mxn_count: number | null
          credito_usd_count: number | null
          fx_lines: number | null
          total_limit_mxn: number | null
          total_limit_usd: number | null
          total_products: number | null
          total_used_mxn: number | null
          total_used_usd: number | null
        }
        Relationships: []
      }
      v_contact_success_rate: {
        Row: {
          llamadas_exitosas: number | null
          promotor: string | null
          tasa_contacto: number | null
          total_llamadas: number | null
        }
        Relationships: []
      }
      v_crm_kanban: {
        Row: {
          aprobado: boolean | null
          autorizado_por: string | null
          created_at: string | null
          empresa: string | null
          fecha_cambio_prioridad: string | null
          id: string | null
          observaciones_completed: boolean | null
          orden_llegada: number | null
          papeleria_subida: boolean | null
          prioridad_manual: boolean | null
          promotor: string | null
          review_flag: Database["public"]["Enums"]["review_flag"] | null
          revision_completed: boolean | null
          status: string | null
          ultima_accion: Database["public"]["Enums"]["accion_tipo"] | null
          ultima_accion_at: string | null
          ultima_accion_por: string | null
          updated_at: string | null
          user_id: string | null
          vobo_cca: boolean | null
        }
        Insert: {
          aprobado?: never
          autorizado_por?: never
          created_at?: string | null
          empresa?: string | null
          fecha_cambio_prioridad?: never
          id?: string | null
          observaciones_completed?: never
          orden_llegada?: never
          papeleria_subida?: never
          prioridad_manual?: never
          promotor?: string | null
          review_flag?: Database["public"]["Enums"]["review_flag"] | null
          revision_completed?: never
          status?: string | null
          ultima_accion?: never
          ultima_accion_at?: never
          ultima_accion_por?: never
          updated_at?: string | null
          user_id?: string | null
          vobo_cca?: never
        }
        Update: {
          aprobado?: never
          autorizado_por?: never
          created_at?: string | null
          empresa?: string | null
          fecha_cambio_prioridad?: never
          id?: string | null
          observaciones_completed?: never
          orden_llegada?: never
          papeleria_subida?: never
          prioridad_manual?: never
          promotor?: string | null
          review_flag?: Database["public"]["Enums"]["review_flag"] | null
          revision_completed?: never
          status?: string | null
          ultima_accion?: never
          ultima_accion_at?: never
          ultima_accion_por?: never
          updated_at?: string | null
          user_id?: string | null
          vobo_cca?: never
        }
        Relationships: []
      }
      v_crm_unified: {
        Row: {
          aprobado: boolean | null
          asignado_a: string | null
          contacto: string | null
          created_at: string | null
          crm_status: string | null
          email: string | null
          empresa: string | null
          fecha_asignacion: string | null
          id: string | null
          orden_llegada: number | null
          origen: string | null
          pagina_web: string | null
          papeleria_subida: boolean | null
          partner: string | null
          progress_percentage: number | null
          promotor: string | null
          proxima_llamada: string | null
          review_flag: Database["public"]["Enums"]["review_flag"] | null
          status: string | null
          telefono: string | null
          total_contactos: number | null
          total_llamadas: number | null
          ultima_accion: string | null
          ultima_accion_at: string | null
          ultima_accion_por: string | null
          ultima_llamada: string | null
          updated_at: string | null
          vobo_cca: boolean | null
        }
        Insert: {
          aprobado?: boolean | null
          asignado_a?: string | null
          contacto?: string | null
          created_at?: string | null
          crm_status?: string | null
          email?: string | null
          empresa?: string | null
          fecha_asignacion?: string | null
          id?: string | null
          orden_llegada?: number | null
          origen?: string | null
          pagina_web?: string | null
          papeleria_subida?: boolean | null
          partner?: string | null
          progress_percentage?: number | null
          promotor?: string | null
          proxima_llamada?: string | null
          review_flag?: Database["public"]["Enums"]["review_flag"] | null
          status?: string | null
          telefono?: string | null
          total_contactos?: number | null
          total_llamadas?: number | null
          ultima_accion?: never
          ultima_accion_at?: never
          ultima_accion_por?: never
          ultima_llamada?: string | null
          updated_at?: string | null
          vobo_cca?: boolean | null
        }
        Update: {
          aprobado?: boolean | null
          asignado_a?: string | null
          contacto?: string | null
          created_at?: string | null
          crm_status?: string | null
          email?: string | null
          empresa?: string | null
          fecha_asignacion?: string | null
          id?: string | null
          orden_llegada?: number | null
          origen?: string | null
          pagina_web?: string | null
          papeleria_subida?: boolean | null
          partner?: string | null
          progress_percentage?: number | null
          promotor?: string | null
          proxima_llamada?: string | null
          review_flag?: Database["public"]["Enums"]["review_flag"] | null
          status?: string | null
          telefono?: string | null
          total_contactos?: number | null
          total_llamadas?: number | null
          ultima_accion?: never
          ultima_accion_at?: never
          ultima_accion_por?: never
          ultima_llamada?: string | null
          updated_at?: string | null
          vobo_cca?: boolean | null
        }
        Relationships: []
      }
      v_document_turnaround: {
        Row: {
          avg_days_turnaround: number | null
          pares_documentos: number | null
          promotor: string | null
        }
        Relationships: []
      }
      v_financial_summary_monthly: {
        Row: {
          expenses_usd: number | null
          month: string | null
          net_margin_usd: number | null
          revenue_usd: number | null
        }
        Relationships: []
      }
      v_followup_compliance: {
        Row: {
          completados: number | null
          programados: number | null
          promotor: string | null
          tasa_cumplimiento: number | null
          vencidos: number | null
        }
        Relationships: []
      }
      v_fx_deal_confirmations: {
        Row: {
          booked_by: string | null
          buy_amount: number | null
          buy_currency: string | null
          client_address: string | null
          client_contact: string | null
          client_email: string | null
          client_name: string | null
          client_phone: string | null
          created_at: string | null
          deal_number: string | null
          deal_type: string | null
          exchange_rate: number | null
          fee: number | null
          fee_text: string | null
          fx_dealer: string | null
          generated_by: string | null
          id: string | null
          pay_amount: number | null
          pay_currency: string | null
          pdf_generated_at: string | null
          processor: string | null
          prospect_empresa: string | null
          prospect_id: string | null
          prospect_partner: string | null
          prospect_promotor: string | null
          prospect_status: string | null
          rel_manager: string | null
          remarks: string | null
          total_due: number | null
          trade_date: string | null
          updated_at: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fx_deal_confirmations_prospect_id_fkey"
            columns: ["prospect_id"]
            isOneToOne: false
            referencedRelation: "crm_prospects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fx_deal_confirmations_prospect_id_fkey"
            columns: ["prospect_id"]
            isOneToOne: false
            referencedRelation: "v_crm_kanban"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fx_deal_confirmations_prospect_id_fkey"
            columns: ["prospect_id"]
            isOneToOne: false
            referencedRelation: "v_crm_unified"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fx_deal_confirmations_prospect_id_fkey"
            columns: ["prospect_id"]
            isOneToOne: false
            referencedRelation: "v_pending_followups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fx_deal_confirmations_prospect_id_fkey"
            columns: ["prospect_id"]
            isOneToOne: false
            referencedRelation: "v_stale_prospects"
            referencedColumns: ["id"]
          },
        ]
      }
      v_gross_margin_by_partner: {
        Row: {
          gross_margin_usd: number | null
          partner: Database["public"]["Enums"]["xending_partner_type"] | null
          report_month: string | null
          total_payout_usd: number | null
          total_revenue_usd: number | null
        }
        Relationships: []
      }
      v_meeting_completion: {
        Row: {
          programadas: number | null
          promotor: string | null
          realizadas: number | null
          tasa_realizacion: number | null
        }
        Relationships: []
      }
      v_operational_kpis_by_partner: {
        Row: {
          avg_ticket_size: number | null
          partner: Database["public"]["Enums"]["xending_partner_type"] | null
          report_month: string | null
          revenue_yield: number | null
          total_operations: number | null
          total_revenue_usd: number | null
          total_volume_usd: number | null
        }
        Relationships: []
      }
      v_pending_followups: {
        Row: {
          asignado_a: string | null
          contacto: string | null
          email: string | null
          empresa: string | null
          id: string | null
          proxima_llamada: string | null
          status: string | null
          telefono: string | null
          total_llamadas: number | null
          ultima_llamada: string | null
        }
        Insert: {
          asignado_a?: never
          contacto?: string | null
          email?: string | null
          empresa?: string | null
          id?: string | null
          proxima_llamada?: string | null
          status?: string | null
          telefono?: string | null
          total_llamadas?: number | null
          ultima_llamada?: string | null
        }
        Update: {
          asignado_a?: never
          contacto?: string | null
          email?: string | null
          empresa?: string | null
          id?: string | null
          proxima_llamada?: string | null
          status?: string | null
          telefono?: string | null
          total_llamadas?: number | null
          ultima_llamada?: string | null
        }
        Relationships: []
      }
      v_pipeline_conversion: {
        Row: {
          conversion_rate: number | null
          from_count: number | null
          to_count: number | null
          transition: string | null
        }
        Relationships: []
      }
      v_pipeline_conversion_by_promoter: {
        Row: {
          conversion_end_to_end: number | null
          promotor: string | null
          reached_aprobado: number | null
          reached_observaciones: number | null
          reached_papeleria: number | null
          reached_revision: number | null
          reached_vobo: number | null
          total_prospectos: number | null
        }
        Relationships: []
      }
      v_plan_vs_actual: {
        Row: {
          achievement_pct: number | null
          actual_value: number | null
          kpi_key: string | null
          month: string | null
          scenario: Database["public"]["Enums"]["xending_scenario_type"] | null
          semaphore: string | null
          target_value: number | null
        }
        Relationships: []
      }
      v_promoter_activity: {
        Row: {
          aprobados: number | null
          en_revision: number | null
          llamadas_pendientes: number | null
          papeleria_subida: number | null
          promotor: string | null
          sin_contactar: number | null
          sin_papeleria: number | null
          total_contactos: number | null
          total_llamadas: number | null
          total_prospectos: number | null
        }
        Relationships: []
      }
      v_promoter_payout_by_partner: {
        Row: {
          gross_revenue_usd: number | null
          month: string | null
          partner: Database["public"]["Enums"]["xending_partner_type"] | null
          payout_amount: number | null
          payout_currency: string | null
          promoter_id: string | null
          promoter_name: string | null
          rule_applied: string | null
          status: string | null
        }
        Relationships: []
      }
      v_promoter_payout_consolidated: {
        Row: {
          month: string | null
          partner_breakdown: Json | null
          payout_currency: string | null
          promoter_id: string | null
          promoter_name: string | null
          total_gross_revenue_usd: number | null
          total_payout_amount: number | null
        }
        Relationships: []
      }
      v_promoter_performance: {
        Row: {
          latest_month: string | null
          latest_month_revenue_usd: number | null
          monthly_salary_mxn: number | null
          name: string | null
          promoter_id: string | null
          revenue_to_cost_ratio: number | null
          status: Database["public"]["Enums"]["xending_promoter_status"] | null
          type: Database["public"]["Enums"]["xending_promoter_type"] | null
        }
        Relationships: []
      }
      v_promoter_scorecard: {
        Row: {
          followup_compliance: number | null
          llamadas_exitosas: number | null
          net_margin: number | null
          operation_count: number | null
          payout_total: number | null
          pipeline_conversion_rate: number | null
          promoter_id: string | null
          promoter_name: string | null
          prospectos_asignados: number | null
          prospectos_estancados: number | null
          report_month: string | null
          reuniones_programadas: number | null
          reuniones_realizadas: number | null
          revenue_target_usd: number | null
          revenue_total: number | null
          tasa_contacto: number | null
          total_llamadas: number | null
          volume_total_usd: number | null
        }
        Relationships: []
      }
      v_promoter_strikes_summary: {
        Row: {
          active_strikes: number | null
          promoter_id: string | null
          promoter_name: string | null
          reverted_strikes: number | null
          semaforo: string | null
          total_strikes: number | null
          year: number | null
        }
        Relationships: [
          {
            foreignKeyName: "xending_promoter_strikes_promoter_id_fkey"
            columns: ["promoter_id"]
            isOneToOne: false
            referencedRelation: "v_promoter_payout_by_partner"
            referencedColumns: ["promoter_id"]
          },
          {
            foreignKeyName: "xending_promoter_strikes_promoter_id_fkey"
            columns: ["promoter_id"]
            isOneToOne: false
            referencedRelation: "v_promoter_payout_consolidated"
            referencedColumns: ["promoter_id"]
          },
          {
            foreignKeyName: "xending_promoter_strikes_promoter_id_fkey"
            columns: ["promoter_id"]
            isOneToOne: false
            referencedRelation: "v_promoter_performance"
            referencedColumns: ["promoter_id"]
          },
          {
            foreignKeyName: "xending_promoter_strikes_promoter_id_fkey"
            columns: ["promoter_id"]
            isOneToOne: false
            referencedRelation: "v_promoter_scorecard"
            referencedColumns: ["promoter_id"]
          },
          {
            foreignKeyName: "xending_promoter_strikes_promoter_id_fkey"
            columns: ["promoter_id"]
            isOneToOne: false
            referencedRelation: "v_revenue_by_promoter_monthly"
            referencedColumns: ["promoter_id"]
          },
          {
            foreignKeyName: "xending_promoter_strikes_promoter_id_fkey"
            columns: ["promoter_id"]
            isOneToOne: false
            referencedRelation: "xending_promoters"
            referencedColumns: ["id"]
          },
        ]
      }
      v_revenue_by_partner_monthly: {
        Row: {
          partner: Database["public"]["Enums"]["xending_partner_type"] | null
          report_month: string | null
          total_net_revenue_usd: number | null
          total_operations: number | null
          total_volume_usd: number | null
        }
        Relationships: []
      }
      v_revenue_by_promoter_monthly: {
        Row: {
          promoter_id: string | null
          promoter_name: string | null
          report_month: string | null
          total_net_revenue_usd: number | null
          total_operations: number | null
          total_volume_usd: number | null
        }
        Relationships: []
      }
      v_stale_prospects: {
        Row: {
          asignado_a: string | null
          contacto: string | null
          dias_sin_actividad: number | null
          empresa: string | null
          id: string | null
          status: string | null
          ultima_llamada: string | null
          updated_at: string | null
        }
        Insert: {
          asignado_a?: never
          contacto?: string | null
          dias_sin_actividad?: never
          empresa?: string | null
          id?: string | null
          status?: string | null
          ultima_llamada?: string | null
          updated_at?: string | null
        }
        Update: {
          asignado_a?: never
          contacto?: string | null
          dias_sin_actividad?: never
          empresa?: string | null
          id?: string | null
          status?: string | null
          ultima_llamada?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      v_stale_prospects_by_promoter: {
        Row: {
          promedio_dias_sin_actividad: number | null
          promotor: string | null
          prospectos_estancados: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      add_crm_prospect_note: {
        Args: { p_note: string; p_prospect_id: string; p_user_id: string }
        Returns: Json
      }
      ai_check_rate_limit: {
        Args: {
          p_max_requests?: number
          p_user_id: string
          p_window_seconds?: number
        }
        Returns: {
          allowed: boolean
          current_count: number
          retry_after_seconds: number
        }[]
      }
      ai_cleanup_old_queue_items: { Args: never; Returns: undefined }
      ai_complete_message: {
        Args: { p_queue_id: string; p_response?: string; p_success?: boolean }
        Returns: undefined
      }
      ai_dequeue_next_message: {
        Args: { p_conversation_id: string; p_user_id: string }
        Returns: {
          conversation_history: Json
          message_content: string
          message_id: string
          metadata: Json
          queue_id: string
          retry_count: number
        }[]
      }
      ai_retry_message: {
        Args: { p_delay_seconds?: number; p_queue_id: string }
        Returns: undefined
      }
      archive_old_comprobantes: { Args: never; Returns: undefined }
      assign_prospect: {
        Args: {
          p_asignado_a: string
          p_asignado_por?: string
          p_prospect_id: string
        }
        Returns: Json
      }
      bulk_assign_prospects: {
        Args: {
          p_asignado_a: string
          p_asignado_por?: string
          p_prospect_ids: string[]
        }
        Returns: Json
      }
      bulk_insert_prospects: {
        Args: { p_prospects_data: Json }
        Returns: string
      }
      calcular_proximo_batch_monex: { Args: never; Returns: string }
      calculate_promoter_payout: {
        Args: {
          p_month: string
          p_partner: Database["public"]["Enums"]["xending_partner_type"]
          p_promoter_id: string
        }
        Returns: Json
      }
      calculate_tiered_revenue: {
        Args: {
          p_gross_amount: number
          p_partner: Database["public"]["Enums"]["xending_partner_type"]
          p_target_date?: string
        }
        Returns: number
      }
      can_pld_write: { Args: { _user_id: string }; Returns: boolean }
      can_view_company_extended: {
        Args: { company_name: string; viewer_id: string }
        Returns: boolean
      }
      can_view_user_extended: {
        Args: { target_id: string; viewer_id: string }
        Returns: boolean
      }
      check_priority_needed: {
        Args: {
          p_prospect_id: string
          p_target_position?: number
          p_target_status: Database["public"]["Enums"]["prospecto_status"]
        }
        Returns: Json
      }
      cleanup_old_queue_items: { Args: never; Returns: undefined }
      complete_message: {
        Args: { p_queue_id: string; p_success?: boolean }
        Returns: undefined
      }
      compute_monthly_kpis: {
        Args: { p_target_month: string }
        Returns: undefined
      }
      create_automatic_note: {
        Args: {
          p_auto_updated_fields: Json
          p_from_status: string
          p_prospect_id: string
          p_to_status: string
          p_user_email: string
        }
        Returns: string
      }
      create_automatic_timeline_note: {
        Args: {
          p_auto_updated_fields?: Json
          p_from_status: string
          p_prospect_id: string
          p_to_status: string
          p_user_email?: string
        }
        Returns: string
      }
      create_process_timeline_entry: {
        Args: {
          p_from_status: string
          p_prospect_id: string
          p_to_status: string
        }
        Returns: string
      }
      delete_prospect: { Args: { p_prospect_id: string }; Returns: string }
      dequeue_next_message: {
        Args: { p_conversation_id: string; p_user_id: string }
        Returns: {
          message_content: string
          metadata: Json
          queue_id: string
          retry_count: number
        }[]
      }
      fix_duplicate_orders: { Args: never; Returns: string }
      fix_order_sequence: { Args: never; Returns: string }
      generate_deal_number: { Args: never; Returns: string }
      generate_payout_report: { Args: { p_month: string }; Returns: Json }
      get_extended_role: { Args: { _user_id: string }; Returns: string }
      get_next_order_in_column: {
        Args: { p_status: Database["public"]["Enums"]["prospecto_status"] }
        Returns: number
      }
      get_pld_role: {
        Args: { _user_id: string }
        Returns: Database["public"]["Enums"]["pld_user_role"]
      }
      get_position_in_column: {
        Args: {
          p_prospect_id: string
          p_status?: Database["public"]["Enums"]["prospecto_status"]
        }
        Returns: number
      }
      get_prospect_position_info: {
        Args: { p_prospect_id: string }
        Returns: Json
      }
      get_user_role: {
        Args: never
        Returns: Database["public"]["Enums"]["xending_org_role"]
      }
      has_pld_access: { Args: { _user_id: string }; Returns: boolean }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["user_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_admin: { Args: { _user_id: string }; Returns: boolean }
      is_pld_administrator: { Args: { _user_id: string }; Returns: boolean }
      is_pld_auditor: { Args: { _user_id: string }; Returns: boolean }
      is_pld_compliance_officer: {
        Args: { _user_id: string }
        Returns: boolean
      }
      log_prospect_movement_silent: {
        Args: {
          p_auto_updated_fields?: Json
          p_from_status: string
          p_prospect_id: string
          p_to_status: string
          p_user_email: string
          p_user_id: string
        }
        Returns: string
      }
      mark_papeleria_subida: {
        Args: { p_prospect_id: string; p_user_id?: string }
        Returns: Json
      }
      move_prospect_to_column: {
        Args: { p_new_status: string; p_prospect_id: string }
        Returns: string
      }
      move_prospect_to_column_with_reset: {
        Args: {
          p_new_status: string
          p_prospect_id: string
          p_user_email?: string
          p_user_id?: string
          p_user_name?: string
        }
        Returns: string
      }
      normalize_branch_name: { Args: { input: string }; Returns: string }
      normalize_column_order: { Args: never; Returns: string }
      recompact_column_orders: { Args: { p_status: string }; Returns: string }
      register_activity: {
        Args: {
          p_activity_type: Database["public"]["Enums"]["activity_type"]
          p_creado_por?: string
          p_descripcion?: string
          p_duracion?: number
          p_programado_para?: string
          p_prospect_id: string
          p_resultado?: string
        }
        Returns: Json
      }
      retry_message: {
        Args: { p_delay_seconds?: number; p_queue_id: string }
        Returns: undefined
      }
      set_active_business: { Args: { business_id: string }; Returns: undefined }
      simple_change_order: {
        Args: { p_new_order: number; p_prospect_id: string }
        Returns: string
      }
      simulate_scenario: { Args: { p_scenario_id: string }; Returns: Json }
      smart_change_order: {
        Args: { p_new_order: number; p_prospect_id: string }
        Returns: string
      }
      test_insert_timeline_entry: {
        Args: {
          p_prospect_id: string
          p_step_name?: string
          p_user_name?: string
        }
        Returns: string
      }
      test_reorder: { Args: never; Returns: string }
      transition_crm_prospect: {
        Args: {
          p_new_status: Database["public"]["Enums"]["prospecto_status"]
          p_prospect_id: string
          p_user_id?: string
        }
        Returns: Json
      }
      unaccent: { Args: { "": string }; Returns: string }
      update_prospect_status_simple: {
        Args: {
          p_new_status: Database["public"]["Enums"]["prospecto_status"]
          p_prospect_id: string
          p_user_id?: string
        }
        Returns: Json
      }
      update_prospect_tracking_fields: {
        Args: { p_new_status: string; p_prospect_id: string }
        Returns: Json
      }
      user_is_member_of: { Args: { p_business_id: string }; Returns: boolean }
    }
    Enums: {
      accion_tipo:
        | "PAPELERIA_SUBIDA"
        | "REVISION_ROJO"
        | "REVISION_AMARILLO"
        | "REVISION_VERDE"
        | "OBSERVACIONES"
        | "VOBO_CCA_ON"
        | "VOBO_CCA_OFF"
        | "APROBADO"
        | "NOTA"
      activity_type:
        | "LLAMADA_EXITOSA"
        | "LLAMADA_NO_CONTESTA"
        | "LLAMADA_BUZON"
        | "LLAMADA_NUMERO_EQUIVOCADO"
        | "EMAIL_ENVIADO"
        | "EMAIL_RESPONDIDO"
        | "WHATSAPP_ENVIADO"
        | "WHATSAPP_RESPONDIDO"
        | "REUNION_PROGRAMADA"
        | "REUNION_REALIZADA"
        | "NOTA_INTERNA"
        | "DOCUMENTO_SOLICITADO"
        | "DOCUMENTO_RECIBIDO"
        | "SEGUIMIENTO_PROGRAMADO"
        | "ASIGNACION"
        | "REASIGNACION"
        | "CAMBIO_ESTADO"
      pld_alert_severity: "low" | "medium" | "high" | "critical"
      pld_alert_status: "pendiente" | "revisado" | "reportado" | "descartado"
      pld_alert_type:
        | "relevante"
        | "inusual"
        | "pep"
        | "bloqueado"
        | "structuring"
        | "pais_riesgo"
      pld_audit_action:
        | "create"
        | "update"
        | "delete"
        | "view"
        | "approve"
        | "reject"
        | "generate_report"
        | "login"
        | "logout"
      pld_audit_entity:
        | "operation"
        | "alert"
        | "profile"
        | "risk"
        | "pep"
        | "blocked"
        | "report"
        | "document"
        | "beneficial_owner"
        | "internal_report"
      pld_blocked_source: "OFAC" | "UIF" | "manual"
      pld_committee_alert_status:
        | "asignada"
        | "en_revision"
        | "dictaminada"
        | "archivada"
      pld_committee_dictamen:
        | "sin_elementos"
        | "reportar_uif"
        | "monitoreo"
        | "bloquear_cliente"
        | "solicitar_info"
      pld_control_type:
        | "ownership"
        | "voting_rights"
        | "board_control"
        | "other"
      pld_document_type:
        | "ine"
        | "passport"
        | "fm2_fm3"
        | "comprobante_domicilio"
        | "rfc"
        | "curp"
        | "acta_constitutiva"
        | "poder_notarial"
      pld_frequency: "diario" | "semanal" | "mensual" | "esporadico"
      pld_gafi_list_type: "negra" | "gris"
      pld_internal_report_status:
        | "pendiente"
        | "investigando"
        | "resuelto"
        | "descartado"
      pld_meeting_status: "programada" | "en_curso" | "finalizada" | "cancelada"
      pld_operation_status:
        | "registered"
        | "pending_approval"
        | "approved"
        | "rejected"
      pld_operation_type: "dispersion" | "pago" | "deposito" | "retiro"
      pld_payment_method: "efectivo" | "transferencia" | "cheque" | "tarjeta"
      pld_risk_level: "bajo" | "medio" | "alto" | "prohibido"
      pld_uif_report_status: "generado" | "enviado" | "confirmado"
      pld_uif_report_type: "ROR" | "ROI" | "ROIP" | "R24H"
      pld_user_role: "compliance_officer" | "administrator" | "auditor"
      product_status: "activo" | "suspendido" | "vencido" | "cancelado"
      product_type: "fx" | "credito_corriente" | "credito_dolares"
      prospecto_status:
        | "SIN_PAPELERIA"
        | "PAPELERIA_SUBIDA"
        | "EN_REVISION"
        | "OBSERVACIONES"
        | "VOBO_CCA"
        | "APROBADO_CLIENTE"
        | "VOBO_INTERNO_CCA"
        | "ENVIADO_A_FIRMA"
        | "CCA_FIRMADO"
        | "VOBO_CCA_FINAL"
        | "ENVIO_TYPEFORM_MONEX"
        | "OBSERVACIONES_MONEX"
        | "CLIENTE_APROBADO"
      review_flag: "ROJO" | "AMARILLO" | "VERDE"
      user_role: "admin" | "user"
      xending_org_role:
        | "FINANCE"
        | "GROWTH"
        | "LEGAL"
        | "CTO"
        | "FOUNDER"
        | "VIEWER"
      xending_partner_type:
        | "MONEX"
        | "BITSO"
        | "CONDUIT"
        | "COBRE"
        | "PINGPONG"
        | "XTRANSFER"
        | "OTHER"
      xending_promoter_status: "ACTIVE" | "INACTIVE" | "ONBOARDING"
      xending_promoter_type:
        | "INTERNAL"
        | "EXTERNAL"
        | "TRAINEE"
        | "SENIOR"
        | "PARTNER"
      xending_scenario_type: "CONSERVATIVE" | "BASE" | "AGGRESSIVE"
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
      accion_tipo: [
        "PAPELERIA_SUBIDA",
        "REVISION_ROJO",
        "REVISION_AMARILLO",
        "REVISION_VERDE",
        "OBSERVACIONES",
        "VOBO_CCA_ON",
        "VOBO_CCA_OFF",
        "APROBADO",
        "NOTA",
      ],
      activity_type: [
        "LLAMADA_EXITOSA",
        "LLAMADA_NO_CONTESTA",
        "LLAMADA_BUZON",
        "LLAMADA_NUMERO_EQUIVOCADO",
        "EMAIL_ENVIADO",
        "EMAIL_RESPONDIDO",
        "WHATSAPP_ENVIADO",
        "WHATSAPP_RESPONDIDO",
        "REUNION_PROGRAMADA",
        "REUNION_REALIZADA",
        "NOTA_INTERNA",
        "DOCUMENTO_SOLICITADO",
        "DOCUMENTO_RECIBIDO",
        "SEGUIMIENTO_PROGRAMADO",
        "ASIGNACION",
        "REASIGNACION",
        "CAMBIO_ESTADO",
      ],
      pld_alert_severity: ["low", "medium", "high", "critical"],
      pld_alert_status: ["pendiente", "revisado", "reportado", "descartado"],
      pld_alert_type: [
        "relevante",
        "inusual",
        "pep",
        "bloqueado",
        "structuring",
        "pais_riesgo",
      ],
      pld_audit_action: [
        "create",
        "update",
        "delete",
        "view",
        "approve",
        "reject",
        "generate_report",
        "login",
        "logout",
      ],
      pld_audit_entity: [
        "operation",
        "alert",
        "profile",
        "risk",
        "pep",
        "blocked",
        "report",
        "document",
        "beneficial_owner",
        "internal_report",
      ],
      pld_blocked_source: ["OFAC", "UIF", "manual"],
      pld_committee_alert_status: [
        "asignada",
        "en_revision",
        "dictaminada",
        "archivada",
      ],
      pld_committee_dictamen: [
        "sin_elementos",
        "reportar_uif",
        "monitoreo",
        "bloquear_cliente",
        "solicitar_info",
      ],
      pld_control_type: [
        "ownership",
        "voting_rights",
        "board_control",
        "other",
      ],
      pld_document_type: [
        "ine",
        "passport",
        "fm2_fm3",
        "comprobante_domicilio",
        "rfc",
        "curp",
        "acta_constitutiva",
        "poder_notarial",
      ],
      pld_frequency: ["diario", "semanal", "mensual", "esporadico"],
      pld_gafi_list_type: ["negra", "gris"],
      pld_internal_report_status: [
        "pendiente",
        "investigando",
        "resuelto",
        "descartado",
      ],
      pld_meeting_status: ["programada", "en_curso", "finalizada", "cancelada"],
      pld_operation_status: [
        "registered",
        "pending_approval",
        "approved",
        "rejected",
      ],
      pld_operation_type: ["dispersion", "pago", "deposito", "retiro"],
      pld_payment_method: ["efectivo", "transferencia", "cheque", "tarjeta"],
      pld_risk_level: ["bajo", "medio", "alto", "prohibido"],
      pld_uif_report_status: ["generado", "enviado", "confirmado"],
      pld_uif_report_type: ["ROR", "ROI", "ROIP", "R24H"],
      pld_user_role: ["compliance_officer", "administrator", "auditor"],
      product_status: ["activo", "suspendido", "vencido", "cancelado"],
      product_type: ["fx", "credito_corriente", "credito_dolares"],
      prospecto_status: [
        "SIN_PAPELERIA",
        "PAPELERIA_SUBIDA",
        "EN_REVISION",
        "OBSERVACIONES",
        "VOBO_CCA",
        "APROBADO_CLIENTE",
        "VOBO_INTERNO_CCA",
        "ENVIADO_A_FIRMA",
        "CCA_FIRMADO",
        "VOBO_CCA_FINAL",
        "ENVIO_TYPEFORM_MONEX",
        "OBSERVACIONES_MONEX",
        "CLIENTE_APROBADO",
      ],
      review_flag: ["ROJO", "AMARILLO", "VERDE"],
      user_role: ["admin", "user"],
      xending_org_role: [
        "FINANCE",
        "GROWTH",
        "LEGAL",
        "CTO",
        "FOUNDER",
        "VIEWER",
      ],
      xending_partner_type: [
        "MONEX",
        "BITSO",
        "CONDUIT",
        "COBRE",
        "PINGPONG",
        "XTRANSFER",
        "OTHER",
      ],
      xending_promoter_status: ["ACTIVE", "INACTIVE", "ONBOARDING"],
      xending_promoter_type: [
        "INTERNAL",
        "EXTERNAL",
        "TRAINEE",
        "SENIOR",
        "PARTNER",
      ],
      xending_scenario_type: ["CONSERVATIVE", "BASE", "AGGRESSIVE"],
    },
  },
} as const
