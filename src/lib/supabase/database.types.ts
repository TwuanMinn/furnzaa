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
      activity_log_chain: {
        Row: {
          id: number
          last_hash: string
          last_seq: number
        }
        Insert: {
          id?: number
          last_hash?: string
          last_seq?: number
        }
        Update: {
          id?: number
          last_hash?: string
          last_seq?: number
        }
        Relationships: []
      }
      activity_logs: {
        Row: {
          action: string
          actor_email: string | null
          actor_id: string | null
          after_data: Json | null
          batch_id: string | null
          before_data: Json | null
          chain_seq: number
          created_at: string
          id: string
          ip_address: string | null
          module: string
          prev_hash: string
          row_hash: string
          severity: string
          summary: string
          summary_tsv: unknown
          target_id: string | null
          target_type: string | null
          user_agent: string | null
        }
        Insert: {
          action: string
          actor_email?: string | null
          actor_id?: string | null
          after_data?: Json | null
          batch_id?: string | null
          before_data?: Json | null
          chain_seq?: number
          created_at?: string
          id?: string
          ip_address?: string | null
          module: string
          prev_hash?: string
          row_hash?: string
          severity?: string
          summary: string
          summary_tsv?: unknown
          target_id?: string | null
          target_type?: string | null
          user_agent?: string | null
        }
        Update: {
          action?: string
          actor_email?: string | null
          actor_id?: string | null
          after_data?: Json | null
          batch_id?: string | null
          before_data?: Json | null
          chain_seq?: number
          created_at?: string
          id?: string
          ip_address?: string | null
          module?: string
          prev_hash?: string
          row_hash?: string
          severity?: string
          summary?: string
          summary_tsv?: unknown
          target_id?: string | null
          target_type?: string | null
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "activity_logs_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      activity_logs_2025_06: {
        Row: {
          action: string
          actor_email: string | null
          actor_id: string | null
          after_data: Json | null
          batch_id: string | null
          before_data: Json | null
          chain_seq: number
          created_at: string
          id: string
          ip_address: string | null
          module: string
          prev_hash: string
          row_hash: string
          severity: string
          summary: string
          summary_tsv: unknown
          target_id: string | null
          target_type: string | null
          user_agent: string | null
        }
        Insert: {
          action: string
          actor_email?: string | null
          actor_id?: string | null
          after_data?: Json | null
          batch_id?: string | null
          before_data?: Json | null
          chain_seq?: number
          created_at?: string
          id?: string
          ip_address?: string | null
          module: string
          prev_hash?: string
          row_hash?: string
          severity?: string
          summary: string
          summary_tsv?: unknown
          target_id?: string | null
          target_type?: string | null
          user_agent?: string | null
        }
        Update: {
          action?: string
          actor_email?: string | null
          actor_id?: string | null
          after_data?: Json | null
          batch_id?: string | null
          before_data?: Json | null
          chain_seq?: number
          created_at?: string
          id?: string
          ip_address?: string | null
          module?: string
          prev_hash?: string
          row_hash?: string
          severity?: string
          summary?: string
          summary_tsv?: unknown
          target_id?: string | null
          target_type?: string | null
          user_agent?: string | null
        }
        Relationships: []
      }
      activity_logs_2025_07: {
        Row: {
          action: string
          actor_email: string | null
          actor_id: string | null
          after_data: Json | null
          batch_id: string | null
          before_data: Json | null
          chain_seq: number
          created_at: string
          id: string
          ip_address: string | null
          module: string
          prev_hash: string
          row_hash: string
          severity: string
          summary: string
          summary_tsv: unknown
          target_id: string | null
          target_type: string | null
          user_agent: string | null
        }
        Insert: {
          action: string
          actor_email?: string | null
          actor_id?: string | null
          after_data?: Json | null
          batch_id?: string | null
          before_data?: Json | null
          chain_seq?: number
          created_at?: string
          id?: string
          ip_address?: string | null
          module: string
          prev_hash?: string
          row_hash?: string
          severity?: string
          summary: string
          summary_tsv?: unknown
          target_id?: string | null
          target_type?: string | null
          user_agent?: string | null
        }
        Update: {
          action?: string
          actor_email?: string | null
          actor_id?: string | null
          after_data?: Json | null
          batch_id?: string | null
          before_data?: Json | null
          chain_seq?: number
          created_at?: string
          id?: string
          ip_address?: string | null
          module?: string
          prev_hash?: string
          row_hash?: string
          severity?: string
          summary?: string
          summary_tsv?: unknown
          target_id?: string | null
          target_type?: string | null
          user_agent?: string | null
        }
        Relationships: []
      }
      activity_logs_2025_08: {
        Row: {
          action: string
          actor_email: string | null
          actor_id: string | null
          after_data: Json | null
          batch_id: string | null
          before_data: Json | null
          chain_seq: number
          created_at: string
          id: string
          ip_address: string | null
          module: string
          prev_hash: string
          row_hash: string
          severity: string
          summary: string
          summary_tsv: unknown
          target_id: string | null
          target_type: string | null
          user_agent: string | null
        }
        Insert: {
          action: string
          actor_email?: string | null
          actor_id?: string | null
          after_data?: Json | null
          batch_id?: string | null
          before_data?: Json | null
          chain_seq?: number
          created_at?: string
          id?: string
          ip_address?: string | null
          module: string
          prev_hash?: string
          row_hash?: string
          severity?: string
          summary: string
          summary_tsv?: unknown
          target_id?: string | null
          target_type?: string | null
          user_agent?: string | null
        }
        Update: {
          action?: string
          actor_email?: string | null
          actor_id?: string | null
          after_data?: Json | null
          batch_id?: string | null
          before_data?: Json | null
          chain_seq?: number
          created_at?: string
          id?: string
          ip_address?: string | null
          module?: string
          prev_hash?: string
          row_hash?: string
          severity?: string
          summary?: string
          summary_tsv?: unknown
          target_id?: string | null
          target_type?: string | null
          user_agent?: string | null
        }
        Relationships: []
      }
      activity_logs_2025_09: {
        Row: {
          action: string
          actor_email: string | null
          actor_id: string | null
          after_data: Json | null
          batch_id: string | null
          before_data: Json | null
          chain_seq: number
          created_at: string
          id: string
          ip_address: string | null
          module: string
          prev_hash: string
          row_hash: string
          severity: string
          summary: string
          summary_tsv: unknown
          target_id: string | null
          target_type: string | null
          user_agent: string | null
        }
        Insert: {
          action: string
          actor_email?: string | null
          actor_id?: string | null
          after_data?: Json | null
          batch_id?: string | null
          before_data?: Json | null
          chain_seq?: number
          created_at?: string
          id?: string
          ip_address?: string | null
          module: string
          prev_hash?: string
          row_hash?: string
          severity?: string
          summary: string
          summary_tsv?: unknown
          target_id?: string | null
          target_type?: string | null
          user_agent?: string | null
        }
        Update: {
          action?: string
          actor_email?: string | null
          actor_id?: string | null
          after_data?: Json | null
          batch_id?: string | null
          before_data?: Json | null
          chain_seq?: number
          created_at?: string
          id?: string
          ip_address?: string | null
          module?: string
          prev_hash?: string
          row_hash?: string
          severity?: string
          summary?: string
          summary_tsv?: unknown
          target_id?: string | null
          target_type?: string | null
          user_agent?: string | null
        }
        Relationships: []
      }
      activity_logs_2025_10: {
        Row: {
          action: string
          actor_email: string | null
          actor_id: string | null
          after_data: Json | null
          batch_id: string | null
          before_data: Json | null
          chain_seq: number
          created_at: string
          id: string
          ip_address: string | null
          module: string
          prev_hash: string
          row_hash: string
          severity: string
          summary: string
          summary_tsv: unknown
          target_id: string | null
          target_type: string | null
          user_agent: string | null
        }
        Insert: {
          action: string
          actor_email?: string | null
          actor_id?: string | null
          after_data?: Json | null
          batch_id?: string | null
          before_data?: Json | null
          chain_seq?: number
          created_at?: string
          id?: string
          ip_address?: string | null
          module: string
          prev_hash?: string
          row_hash?: string
          severity?: string
          summary: string
          summary_tsv?: unknown
          target_id?: string | null
          target_type?: string | null
          user_agent?: string | null
        }
        Update: {
          action?: string
          actor_email?: string | null
          actor_id?: string | null
          after_data?: Json | null
          batch_id?: string | null
          before_data?: Json | null
          chain_seq?: number
          created_at?: string
          id?: string
          ip_address?: string | null
          module?: string
          prev_hash?: string
          row_hash?: string
          severity?: string
          summary?: string
          summary_tsv?: unknown
          target_id?: string | null
          target_type?: string | null
          user_agent?: string | null
        }
        Relationships: []
      }
      activity_logs_2025_11: {
        Row: {
          action: string
          actor_email: string | null
          actor_id: string | null
          after_data: Json | null
          batch_id: string | null
          before_data: Json | null
          chain_seq: number
          created_at: string
          id: string
          ip_address: string | null
          module: string
          prev_hash: string
          row_hash: string
          severity: string
          summary: string
          summary_tsv: unknown
          target_id: string | null
          target_type: string | null
          user_agent: string | null
        }
        Insert: {
          action: string
          actor_email?: string | null
          actor_id?: string | null
          after_data?: Json | null
          batch_id?: string | null
          before_data?: Json | null
          chain_seq?: number
          created_at?: string
          id?: string
          ip_address?: string | null
          module: string
          prev_hash?: string
          row_hash?: string
          severity?: string
          summary: string
          summary_tsv?: unknown
          target_id?: string | null
          target_type?: string | null
          user_agent?: string | null
        }
        Update: {
          action?: string
          actor_email?: string | null
          actor_id?: string | null
          after_data?: Json | null
          batch_id?: string | null
          before_data?: Json | null
          chain_seq?: number
          created_at?: string
          id?: string
          ip_address?: string | null
          module?: string
          prev_hash?: string
          row_hash?: string
          severity?: string
          summary?: string
          summary_tsv?: unknown
          target_id?: string | null
          target_type?: string | null
          user_agent?: string | null
        }
        Relationships: []
      }
      activity_logs_2025_12: {
        Row: {
          action: string
          actor_email: string | null
          actor_id: string | null
          after_data: Json | null
          batch_id: string | null
          before_data: Json | null
          chain_seq: number
          created_at: string
          id: string
          ip_address: string | null
          module: string
          prev_hash: string
          row_hash: string
          severity: string
          summary: string
          summary_tsv: unknown
          target_id: string | null
          target_type: string | null
          user_agent: string | null
        }
        Insert: {
          action: string
          actor_email?: string | null
          actor_id?: string | null
          after_data?: Json | null
          batch_id?: string | null
          before_data?: Json | null
          chain_seq?: number
          created_at?: string
          id?: string
          ip_address?: string | null
          module: string
          prev_hash?: string
          row_hash?: string
          severity?: string
          summary: string
          summary_tsv?: unknown
          target_id?: string | null
          target_type?: string | null
          user_agent?: string | null
        }
        Update: {
          action?: string
          actor_email?: string | null
          actor_id?: string | null
          after_data?: Json | null
          batch_id?: string | null
          before_data?: Json | null
          chain_seq?: number
          created_at?: string
          id?: string
          ip_address?: string | null
          module?: string
          prev_hash?: string
          row_hash?: string
          severity?: string
          summary?: string
          summary_tsv?: unknown
          target_id?: string | null
          target_type?: string | null
          user_agent?: string | null
        }
        Relationships: []
      }
      activity_logs_2026_01: {
        Row: {
          action: string
          actor_email: string | null
          actor_id: string | null
          after_data: Json | null
          batch_id: string | null
          before_data: Json | null
          chain_seq: number
          created_at: string
          id: string
          ip_address: string | null
          module: string
          prev_hash: string
          row_hash: string
          severity: string
          summary: string
          summary_tsv: unknown
          target_id: string | null
          target_type: string | null
          user_agent: string | null
        }
        Insert: {
          action: string
          actor_email?: string | null
          actor_id?: string | null
          after_data?: Json | null
          batch_id?: string | null
          before_data?: Json | null
          chain_seq?: number
          created_at?: string
          id?: string
          ip_address?: string | null
          module: string
          prev_hash?: string
          row_hash?: string
          severity?: string
          summary: string
          summary_tsv?: unknown
          target_id?: string | null
          target_type?: string | null
          user_agent?: string | null
        }
        Update: {
          action?: string
          actor_email?: string | null
          actor_id?: string | null
          after_data?: Json | null
          batch_id?: string | null
          before_data?: Json | null
          chain_seq?: number
          created_at?: string
          id?: string
          ip_address?: string | null
          module?: string
          prev_hash?: string
          row_hash?: string
          severity?: string
          summary?: string
          summary_tsv?: unknown
          target_id?: string | null
          target_type?: string | null
          user_agent?: string | null
        }
        Relationships: []
      }
      activity_logs_2026_02: {
        Row: {
          action: string
          actor_email: string | null
          actor_id: string | null
          after_data: Json | null
          batch_id: string | null
          before_data: Json | null
          chain_seq: number
          created_at: string
          id: string
          ip_address: string | null
          module: string
          prev_hash: string
          row_hash: string
          severity: string
          summary: string
          summary_tsv: unknown
          target_id: string | null
          target_type: string | null
          user_agent: string | null
        }
        Insert: {
          action: string
          actor_email?: string | null
          actor_id?: string | null
          after_data?: Json | null
          batch_id?: string | null
          before_data?: Json | null
          chain_seq?: number
          created_at?: string
          id?: string
          ip_address?: string | null
          module: string
          prev_hash?: string
          row_hash?: string
          severity?: string
          summary: string
          summary_tsv?: unknown
          target_id?: string | null
          target_type?: string | null
          user_agent?: string | null
        }
        Update: {
          action?: string
          actor_email?: string | null
          actor_id?: string | null
          after_data?: Json | null
          batch_id?: string | null
          before_data?: Json | null
          chain_seq?: number
          created_at?: string
          id?: string
          ip_address?: string | null
          module?: string
          prev_hash?: string
          row_hash?: string
          severity?: string
          summary?: string
          summary_tsv?: unknown
          target_id?: string | null
          target_type?: string | null
          user_agent?: string | null
        }
        Relationships: []
      }
      activity_logs_2026_03: {
        Row: {
          action: string
          actor_email: string | null
          actor_id: string | null
          after_data: Json | null
          batch_id: string | null
          before_data: Json | null
          chain_seq: number
          created_at: string
          id: string
          ip_address: string | null
          module: string
          prev_hash: string
          row_hash: string
          severity: string
          summary: string
          summary_tsv: unknown
          target_id: string | null
          target_type: string | null
          user_agent: string | null
        }
        Insert: {
          action: string
          actor_email?: string | null
          actor_id?: string | null
          after_data?: Json | null
          batch_id?: string | null
          before_data?: Json | null
          chain_seq?: number
          created_at?: string
          id?: string
          ip_address?: string | null
          module: string
          prev_hash?: string
          row_hash?: string
          severity?: string
          summary: string
          summary_tsv?: unknown
          target_id?: string | null
          target_type?: string | null
          user_agent?: string | null
        }
        Update: {
          action?: string
          actor_email?: string | null
          actor_id?: string | null
          after_data?: Json | null
          batch_id?: string | null
          before_data?: Json | null
          chain_seq?: number
          created_at?: string
          id?: string
          ip_address?: string | null
          module?: string
          prev_hash?: string
          row_hash?: string
          severity?: string
          summary?: string
          summary_tsv?: unknown
          target_id?: string | null
          target_type?: string | null
          user_agent?: string | null
        }
        Relationships: []
      }
      activity_logs_2026_04: {
        Row: {
          action: string
          actor_email: string | null
          actor_id: string | null
          after_data: Json | null
          batch_id: string | null
          before_data: Json | null
          chain_seq: number
          created_at: string
          id: string
          ip_address: string | null
          module: string
          prev_hash: string
          row_hash: string
          severity: string
          summary: string
          summary_tsv: unknown
          target_id: string | null
          target_type: string | null
          user_agent: string | null
        }
        Insert: {
          action: string
          actor_email?: string | null
          actor_id?: string | null
          after_data?: Json | null
          batch_id?: string | null
          before_data?: Json | null
          chain_seq?: number
          created_at?: string
          id?: string
          ip_address?: string | null
          module: string
          prev_hash?: string
          row_hash?: string
          severity?: string
          summary: string
          summary_tsv?: unknown
          target_id?: string | null
          target_type?: string | null
          user_agent?: string | null
        }
        Update: {
          action?: string
          actor_email?: string | null
          actor_id?: string | null
          after_data?: Json | null
          batch_id?: string | null
          before_data?: Json | null
          chain_seq?: number
          created_at?: string
          id?: string
          ip_address?: string | null
          module?: string
          prev_hash?: string
          row_hash?: string
          severity?: string
          summary?: string
          summary_tsv?: unknown
          target_id?: string | null
          target_type?: string | null
          user_agent?: string | null
        }
        Relationships: []
      }
      activity_logs_2026_05: {
        Row: {
          action: string
          actor_email: string | null
          actor_id: string | null
          after_data: Json | null
          batch_id: string | null
          before_data: Json | null
          chain_seq: number
          created_at: string
          id: string
          ip_address: string | null
          module: string
          prev_hash: string
          row_hash: string
          severity: string
          summary: string
          summary_tsv: unknown
          target_id: string | null
          target_type: string | null
          user_agent: string | null
        }
        Insert: {
          action: string
          actor_email?: string | null
          actor_id?: string | null
          after_data?: Json | null
          batch_id?: string | null
          before_data?: Json | null
          chain_seq?: number
          created_at?: string
          id?: string
          ip_address?: string | null
          module: string
          prev_hash?: string
          row_hash?: string
          severity?: string
          summary: string
          summary_tsv?: unknown
          target_id?: string | null
          target_type?: string | null
          user_agent?: string | null
        }
        Update: {
          action?: string
          actor_email?: string | null
          actor_id?: string | null
          after_data?: Json | null
          batch_id?: string | null
          before_data?: Json | null
          chain_seq?: number
          created_at?: string
          id?: string
          ip_address?: string | null
          module?: string
          prev_hash?: string
          row_hash?: string
          severity?: string
          summary?: string
          summary_tsv?: unknown
          target_id?: string | null
          target_type?: string | null
          user_agent?: string | null
        }
        Relationships: []
      }
      activity_logs_2026_06: {
        Row: {
          action: string
          actor_email: string | null
          actor_id: string | null
          after_data: Json | null
          batch_id: string | null
          before_data: Json | null
          chain_seq: number
          created_at: string
          id: string
          ip_address: string | null
          module: string
          prev_hash: string
          row_hash: string
          severity: string
          summary: string
          summary_tsv: unknown
          target_id: string | null
          target_type: string | null
          user_agent: string | null
        }
        Insert: {
          action: string
          actor_email?: string | null
          actor_id?: string | null
          after_data?: Json | null
          batch_id?: string | null
          before_data?: Json | null
          chain_seq?: number
          created_at?: string
          id?: string
          ip_address?: string | null
          module: string
          prev_hash?: string
          row_hash?: string
          severity?: string
          summary: string
          summary_tsv?: unknown
          target_id?: string | null
          target_type?: string | null
          user_agent?: string | null
        }
        Update: {
          action?: string
          actor_email?: string | null
          actor_id?: string | null
          after_data?: Json | null
          batch_id?: string | null
          before_data?: Json | null
          chain_seq?: number
          created_at?: string
          id?: string
          ip_address?: string | null
          module?: string
          prev_hash?: string
          row_hash?: string
          severity?: string
          summary?: string
          summary_tsv?: unknown
          target_id?: string | null
          target_type?: string | null
          user_agent?: string | null
        }
        Relationships: []
      }
      activity_logs_2026_07: {
        Row: {
          action: string
          actor_email: string | null
          actor_id: string | null
          after_data: Json | null
          batch_id: string | null
          before_data: Json | null
          chain_seq: number
          created_at: string
          id: string
          ip_address: string | null
          module: string
          prev_hash: string
          row_hash: string
          severity: string
          summary: string
          summary_tsv: unknown
          target_id: string | null
          target_type: string | null
          user_agent: string | null
        }
        Insert: {
          action: string
          actor_email?: string | null
          actor_id?: string | null
          after_data?: Json | null
          batch_id?: string | null
          before_data?: Json | null
          chain_seq?: number
          created_at?: string
          id?: string
          ip_address?: string | null
          module: string
          prev_hash?: string
          row_hash?: string
          severity?: string
          summary: string
          summary_tsv?: unknown
          target_id?: string | null
          target_type?: string | null
          user_agent?: string | null
        }
        Update: {
          action?: string
          actor_email?: string | null
          actor_id?: string | null
          after_data?: Json | null
          batch_id?: string | null
          before_data?: Json | null
          chain_seq?: number
          created_at?: string
          id?: string
          ip_address?: string | null
          module?: string
          prev_hash?: string
          row_hash?: string
          severity?: string
          summary?: string
          summary_tsv?: unknown
          target_id?: string | null
          target_type?: string | null
          user_agent?: string | null
        }
        Relationships: []
      }
      attendance_records: {
        Row: {
          absences: number
          created_at: string
          created_by: string | null
          days_worked: number
          employee_id: string
          hours_worked: number
          id: string
          leave_days_paid: number
          leave_days_unpaid: number
          notes: string | null
          overtime_hours: number
          period_month: string
          source: string
          updated_at: string
        }
        Insert: {
          absences?: number
          created_at?: string
          created_by?: string | null
          days_worked?: number
          employee_id: string
          hours_worked?: number
          id?: string
          leave_days_paid?: number
          leave_days_unpaid?: number
          notes?: string | null
          overtime_hours?: number
          period_month: string
          source?: string
          updated_at?: string
        }
        Update: {
          absences?: number
          created_at?: string
          created_by?: string | null
          days_worked?: number
          employee_id?: string
          hours_worked?: number
          id?: string
          leave_days_paid?: number
          leave_days_unpaid?: number
          notes?: string | null
          overtime_hours?: number
          period_month?: string
          source?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_records_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_records_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      automation_executions: {
        Row: {
          created_at: string
          customer_id: string
          dedupe_key: string
          id: string
          result: Json
          rule_id: string
        }
        Insert: {
          created_at?: string
          customer_id: string
          dedupe_key: string
          id?: string
          result?: Json
          rule_id: string
        }
        Update: {
          created_at?: string
          customer_id?: string
          dedupe_key?: string
          id?: string
          result?: Json
          rule_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "automation_executions_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automation_executions_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "mv_top_customers"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "automation_executions_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "automation_rules"
            referencedColumns: ["id"]
          },
        ]
      }
      automation_rules: {
        Row: {
          action_config: Json
          action_type: string
          condition: Json
          created_at: string
          created_by: string | null
          deleted_at: string | null
          event_type: string
          id: string
          is_active: boolean
          is_enabled: boolean
          last_run_at: string | null
          name: string
          updated_at: string
        }
        Insert: {
          action_config?: Json
          action_type: string
          condition?: Json
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          event_type: string
          id?: string
          is_active?: boolean
          is_enabled?: boolean
          last_run_at?: string | null
          name: string
          updated_at?: string
        }
        Update: {
          action_config?: Json
          action_type?: string
          condition?: Json
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          event_type?: string
          id?: string
          is_active?: boolean
          is_enabled?: boolean
          last_run_at?: string | null
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "automation_rules_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      bill_of_materials: {
        Row: {
          component_product_id: string
          created_at: string
          finished_product_id: string
          id: string
          quantity_per_unit: number
        }
        Insert: {
          component_product_id: string
          created_at?: string
          finished_product_id: string
          id?: string
          quantity_per_unit: number
        }
        Update: {
          component_product_id?: string
          created_at?: string
          finished_product_id?: string
          id?: string
          quantity_per_unit?: number
        }
        Relationships: [
          {
            foreignKeyName: "bill_of_materials_component_product_id_fkey"
            columns: ["component_product_id"]
            isOneToOne: false
            referencedRelation: "mv_product_profitability"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "bill_of_materials_component_product_id_fkey"
            columns: ["component_product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bill_of_materials_finished_product_id_fkey"
            columns: ["finished_product_id"]
            isOneToOne: false
            referencedRelation: "mv_product_profitability"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "bill_of_materials_finished_product_id_fkey"
            columns: ["finished_product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_events: {
        Row: {
          campaign_id: string
          created_at: string
          customer_id: string | null
          event_type: string
          id: string
          metadata: Json
          recipient_id: string | null
        }
        Insert: {
          campaign_id: string
          created_at?: string
          customer_id?: string | null
          event_type: string
          id?: string
          metadata?: Json
          recipient_id?: string | null
        }
        Update: {
          campaign_id?: string
          created_at?: string
          customer_id?: string | null
          event_type?: string
          id?: string
          metadata?: Json
          recipient_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "campaign_events_v6_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "marketing_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_events_v6_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_events_v6_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "mv_top_customers"
            referencedColumns: ["customer_id"]
          },
        ]
      }
      campaign_events_2025_06: {
        Row: {
          campaign_id: string
          created_at: string
          customer_id: string | null
          event_type: string
          id: string
          metadata: Json
          recipient_id: string | null
        }
        Insert: {
          campaign_id: string
          created_at?: string
          customer_id?: string | null
          event_type: string
          id?: string
          metadata?: Json
          recipient_id?: string | null
        }
        Update: {
          campaign_id?: string
          created_at?: string
          customer_id?: string | null
          event_type?: string
          id?: string
          metadata?: Json
          recipient_id?: string | null
        }
        Relationships: []
      }
      campaign_events_2025_07: {
        Row: {
          campaign_id: string
          created_at: string
          customer_id: string | null
          event_type: string
          id: string
          metadata: Json
          recipient_id: string | null
        }
        Insert: {
          campaign_id: string
          created_at?: string
          customer_id?: string | null
          event_type: string
          id?: string
          metadata?: Json
          recipient_id?: string | null
        }
        Update: {
          campaign_id?: string
          created_at?: string
          customer_id?: string | null
          event_type?: string
          id?: string
          metadata?: Json
          recipient_id?: string | null
        }
        Relationships: []
      }
      campaign_events_2025_08: {
        Row: {
          campaign_id: string
          created_at: string
          customer_id: string | null
          event_type: string
          id: string
          metadata: Json
          recipient_id: string | null
        }
        Insert: {
          campaign_id: string
          created_at?: string
          customer_id?: string | null
          event_type: string
          id?: string
          metadata?: Json
          recipient_id?: string | null
        }
        Update: {
          campaign_id?: string
          created_at?: string
          customer_id?: string | null
          event_type?: string
          id?: string
          metadata?: Json
          recipient_id?: string | null
        }
        Relationships: []
      }
      campaign_events_2025_09: {
        Row: {
          campaign_id: string
          created_at: string
          customer_id: string | null
          event_type: string
          id: string
          metadata: Json
          recipient_id: string | null
        }
        Insert: {
          campaign_id: string
          created_at?: string
          customer_id?: string | null
          event_type: string
          id?: string
          metadata?: Json
          recipient_id?: string | null
        }
        Update: {
          campaign_id?: string
          created_at?: string
          customer_id?: string | null
          event_type?: string
          id?: string
          metadata?: Json
          recipient_id?: string | null
        }
        Relationships: []
      }
      campaign_events_2025_10: {
        Row: {
          campaign_id: string
          created_at: string
          customer_id: string | null
          event_type: string
          id: string
          metadata: Json
          recipient_id: string | null
        }
        Insert: {
          campaign_id: string
          created_at?: string
          customer_id?: string | null
          event_type: string
          id?: string
          metadata?: Json
          recipient_id?: string | null
        }
        Update: {
          campaign_id?: string
          created_at?: string
          customer_id?: string | null
          event_type?: string
          id?: string
          metadata?: Json
          recipient_id?: string | null
        }
        Relationships: []
      }
      campaign_events_2025_11: {
        Row: {
          campaign_id: string
          created_at: string
          customer_id: string | null
          event_type: string
          id: string
          metadata: Json
          recipient_id: string | null
        }
        Insert: {
          campaign_id: string
          created_at?: string
          customer_id?: string | null
          event_type: string
          id?: string
          metadata?: Json
          recipient_id?: string | null
        }
        Update: {
          campaign_id?: string
          created_at?: string
          customer_id?: string | null
          event_type?: string
          id?: string
          metadata?: Json
          recipient_id?: string | null
        }
        Relationships: []
      }
      campaign_events_2025_12: {
        Row: {
          campaign_id: string
          created_at: string
          customer_id: string | null
          event_type: string
          id: string
          metadata: Json
          recipient_id: string | null
        }
        Insert: {
          campaign_id: string
          created_at?: string
          customer_id?: string | null
          event_type: string
          id?: string
          metadata?: Json
          recipient_id?: string | null
        }
        Update: {
          campaign_id?: string
          created_at?: string
          customer_id?: string | null
          event_type?: string
          id?: string
          metadata?: Json
          recipient_id?: string | null
        }
        Relationships: []
      }
      campaign_events_2026_01: {
        Row: {
          campaign_id: string
          created_at: string
          customer_id: string | null
          event_type: string
          id: string
          metadata: Json
          recipient_id: string | null
        }
        Insert: {
          campaign_id: string
          created_at?: string
          customer_id?: string | null
          event_type: string
          id?: string
          metadata?: Json
          recipient_id?: string | null
        }
        Update: {
          campaign_id?: string
          created_at?: string
          customer_id?: string | null
          event_type?: string
          id?: string
          metadata?: Json
          recipient_id?: string | null
        }
        Relationships: []
      }
      campaign_events_2026_02: {
        Row: {
          campaign_id: string
          created_at: string
          customer_id: string | null
          event_type: string
          id: string
          metadata: Json
          recipient_id: string | null
        }
        Insert: {
          campaign_id: string
          created_at?: string
          customer_id?: string | null
          event_type: string
          id?: string
          metadata?: Json
          recipient_id?: string | null
        }
        Update: {
          campaign_id?: string
          created_at?: string
          customer_id?: string | null
          event_type?: string
          id?: string
          metadata?: Json
          recipient_id?: string | null
        }
        Relationships: []
      }
      campaign_events_2026_03: {
        Row: {
          campaign_id: string
          created_at: string
          customer_id: string | null
          event_type: string
          id: string
          metadata: Json
          recipient_id: string | null
        }
        Insert: {
          campaign_id: string
          created_at?: string
          customer_id?: string | null
          event_type: string
          id?: string
          metadata?: Json
          recipient_id?: string | null
        }
        Update: {
          campaign_id?: string
          created_at?: string
          customer_id?: string | null
          event_type?: string
          id?: string
          metadata?: Json
          recipient_id?: string | null
        }
        Relationships: []
      }
      campaign_events_2026_04: {
        Row: {
          campaign_id: string
          created_at: string
          customer_id: string | null
          event_type: string
          id: string
          metadata: Json
          recipient_id: string | null
        }
        Insert: {
          campaign_id: string
          created_at?: string
          customer_id?: string | null
          event_type: string
          id?: string
          metadata?: Json
          recipient_id?: string | null
        }
        Update: {
          campaign_id?: string
          created_at?: string
          customer_id?: string | null
          event_type?: string
          id?: string
          metadata?: Json
          recipient_id?: string | null
        }
        Relationships: []
      }
      campaign_events_2026_05: {
        Row: {
          campaign_id: string
          created_at: string
          customer_id: string | null
          event_type: string
          id: string
          metadata: Json
          recipient_id: string | null
        }
        Insert: {
          campaign_id: string
          created_at?: string
          customer_id?: string | null
          event_type: string
          id?: string
          metadata?: Json
          recipient_id?: string | null
        }
        Update: {
          campaign_id?: string
          created_at?: string
          customer_id?: string | null
          event_type?: string
          id?: string
          metadata?: Json
          recipient_id?: string | null
        }
        Relationships: []
      }
      campaign_events_2026_06: {
        Row: {
          campaign_id: string
          created_at: string
          customer_id: string | null
          event_type: string
          id: string
          metadata: Json
          recipient_id: string | null
        }
        Insert: {
          campaign_id: string
          created_at?: string
          customer_id?: string | null
          event_type: string
          id?: string
          metadata?: Json
          recipient_id?: string | null
        }
        Update: {
          campaign_id?: string
          created_at?: string
          customer_id?: string | null
          event_type?: string
          id?: string
          metadata?: Json
          recipient_id?: string | null
        }
        Relationships: []
      }
      campaign_events_2026_07: {
        Row: {
          campaign_id: string
          created_at: string
          customer_id: string | null
          event_type: string
          id: string
          metadata: Json
          recipient_id: string | null
        }
        Insert: {
          campaign_id: string
          created_at?: string
          customer_id?: string | null
          event_type: string
          id?: string
          metadata?: Json
          recipient_id?: string | null
        }
        Update: {
          campaign_id?: string
          created_at?: string
          customer_id?: string | null
          event_type?: string
          id?: string
          metadata?: Json
          recipient_id?: string | null
        }
        Relationships: []
      }
      campaign_recipients: {
        Row: {
          campaign_id: string
          created_at: string
          customer_id: string
          error: string | null
          id: string
          merge_data: Json | null
          sent_at: string | null
          status: string
        }
        Insert: {
          campaign_id: string
          created_at?: string
          customer_id: string
          error?: string | null
          id?: string
          merge_data?: Json | null
          sent_at?: string | null
          status?: string
        }
        Update: {
          campaign_id?: string
          created_at?: string
          customer_id?: string
          error?: string | null
          id?: string
          merge_data?: Json | null
          sent_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaign_recipients_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "marketing_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_recipients_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_recipients_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "mv_top_customers"
            referencedColumns: ["customer_id"]
          },
        ]
      }
      campaign_stats: {
        Row: {
          bounced: number
          campaign_id: string
          clicked: number
          converted: number
          delivered: number
          opened: number
          redemptions: number
          refreshed_at: string
          revenue_cents: number
          sent: number
          unsubscribed: number
        }
        Insert: {
          bounced?: number
          campaign_id: string
          clicked?: number
          converted?: number
          delivered?: number
          opened?: number
          redemptions?: number
          refreshed_at?: string
          revenue_cents?: number
          sent?: number
          unsubscribed?: number
        }
        Update: {
          bounced?: number
          campaign_id?: string
          clicked?: number
          converted?: number
          delivered?: number
          opened?: number
          redemptions?: number
          refreshed_at?: string
          revenue_cents?: number
          sent?: number
          unsubscribed?: number
        }
        Relationships: [
          {
            foreignKeyName: "campaign_stats_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: true
            referencedRelation: "marketing_campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      cost_calculations: {
        Row: {
          created_at: string
          deleted_at: string | null
          electricity_cost: number
          electricity_rate: number
          filament_cost_per_kg: number
          filament_used_grams: number
          filament_with_waste_g: number
          id: string
          is_active: boolean
          labor_cost: number
          margin_percent: number
          material: string
          material_cost: number
          name: string
          other_costs: number
          print_time_hours: number
          printer_watts: number
          profit: number
          roi_percent: number
          selling_price: number
          target_margin_percent: number
          total_cost: number
          user_id: string
          waste_percent: number
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          electricity_cost?: number
          electricity_rate?: number
          filament_cost_per_kg?: number
          filament_used_grams?: number
          filament_with_waste_g?: number
          id?: string
          is_active?: boolean
          labor_cost?: number
          margin_percent?: number
          material?: string
          material_cost?: number
          name?: string
          other_costs?: number
          print_time_hours?: number
          printer_watts?: number
          profit?: number
          roi_percent?: number
          selling_price?: number
          target_margin_percent?: number
          total_cost?: number
          user_id: string
          waste_percent?: number
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          electricity_cost?: number
          electricity_rate?: number
          filament_cost_per_kg?: number
          filament_used_grams?: number
          filament_with_waste_g?: number
          id?: string
          is_active?: boolean
          labor_cost?: number
          margin_percent?: number
          material?: string
          material_cost?: number
          name?: string
          other_costs?: number
          print_time_hours?: number
          printer_watts?: number
          profit?: number
          roi_percent?: number
          selling_price?: number
          target_margin_percent?: number
          total_cost?: number
          user_id?: string
          waste_percent?: number
        }
        Relationships: [
          {
            foreignKeyName: "cost_calculations_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_feedback: {
        Row: {
          aging_notified_at: string | null
          assigned_to: string | null
          category: string
          code: string
          comments: string
          comments_tsv: unknown
          created_at: string
          customer_id: string | null
          deleted_at: string | null
          fallback_name: string | null
          fallback_phone: string | null
          id: string
          is_active: boolean
          order_id: string | null
          rating: number
          resolution_note: string | null
          resolved_at: string | null
          resolved_by: string | null
          severity: string
          source_channel: string
          status: string
          submitted_by: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          aging_notified_at?: string | null
          assigned_to?: string | null
          category?: string
          code?: string
          comments: string
          comments_tsv?: unknown
          created_at?: string
          customer_id?: string | null
          deleted_at?: string | null
          fallback_name?: string | null
          fallback_phone?: string | null
          id?: string
          is_active?: boolean
          order_id?: string | null
          rating: number
          resolution_note?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: string
          source_channel?: string
          status?: string
          submitted_by?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          aging_notified_at?: string | null
          assigned_to?: string | null
          category?: string
          code?: string
          comments?: string
          comments_tsv?: unknown
          created_at?: string
          customer_id?: string | null
          deleted_at?: string | null
          fallback_name?: string | null
          fallback_phone?: string | null
          id?: string
          is_active?: boolean
          order_id?: string | null
          rating?: number
          resolution_note?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: string
          source_channel?: string
          status?: string
          submitted_by?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customer_feedback_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_feedback_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_feedback_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "mv_top_customers"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "customer_feedback_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_feedback_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_feedback_submitted_by_fkey"
            columns: ["submitted_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_feedback_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_rank_history: {
        Row: {
          changed_by: string | null
          created_at: string
          customer_id: string
          id: string
          new_tier_id: string
          previous_tier_id: string | null
          qualifying_snapshot: Json
          reason: string
        }
        Insert: {
          changed_by?: string | null
          created_at?: string
          customer_id: string
          id?: string
          new_tier_id: string
          previous_tier_id?: string | null
          qualifying_snapshot?: Json
          reason?: string
        }
        Update: {
          changed_by?: string | null
          created_at?: string
          customer_id?: string
          id?: string
          new_tier_id?: string
          previous_tier_id?: string | null
          qualifying_snapshot?: Json
          reason?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_rank_history_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_rank_history_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_rank_history_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "mv_top_customers"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "customer_rank_history_new_tier_id_fkey"
            columns: ["new_tier_id"]
            isOneToOne: false
            referencedRelation: "customer_tiers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_rank_history_previous_tier_id_fkey"
            columns: ["previous_tier_id"]
            isOneToOne: false
            referencedRelation: "customer_tiers"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_segments: {
        Row: {
          created_at: string
          created_by: string | null
          deleted_at: string | null
          description: string | null
          filter: Json
          id: string
          is_active: boolean
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          filter?: Json
          id?: string
          is_active?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          filter?: Json
          id?: string
          is_active?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_segments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_tiers: {
        Row: {
          annual_spend_threshold_cents: number | null
          badge_color: string
          created_at: string
          group_name: string
          id: string
          is_active: boolean
          key: string
          lifetime_spend_threshold_cents: number
          min_customer_score: number | null
          min_order_count: number | null
          name: string
          rank: number
          updated_at: string
        }
        Insert: {
          annual_spend_threshold_cents?: number | null
          badge_color?: string
          created_at?: string
          group_name: string
          id?: string
          is_active?: boolean
          key: string
          lifetime_spend_threshold_cents?: number
          min_customer_score?: number | null
          min_order_count?: number | null
          name: string
          rank: number
          updated_at?: string
        }
        Update: {
          annual_spend_threshold_cents?: number | null
          badge_color?: string
          created_at?: string
          group_name?: string
          id?: string
          is_active?: boolean
          key?: string
          lifetime_spend_threshold_cents?: number
          min_customer_score?: number | null
          min_order_count?: number | null
          name?: string
          rank?: number
          updated_at?: string
        }
        Relationships: []
      }
      customers: {
        Row: {
          annual_spend_cents: number
          avg_rating: number | null
          birthday: string | null
          created_at: string
          current_tier_id: string | null
          customer_score: number
          deleted_at: string | null
          email: string | null
          feedback_count: number
          id: string
          is_active: boolean
          last_purchase_date: string | null
          lifetime_spend_cents: number
          name: string
          notes: string | null
          order_count: number
          phone: string | null
          region: string | null
          updated_at: string
        }
        Insert: {
          annual_spend_cents?: number
          avg_rating?: number | null
          birthday?: string | null
          created_at?: string
          current_tier_id?: string | null
          customer_score?: number
          deleted_at?: string | null
          email?: string | null
          feedback_count?: number
          id?: string
          is_active?: boolean
          last_purchase_date?: string | null
          lifetime_spend_cents?: number
          name: string
          notes?: string | null
          order_count?: number
          phone?: string | null
          region?: string | null
          updated_at?: string
        }
        Update: {
          annual_spend_cents?: number
          avg_rating?: number | null
          birthday?: string | null
          created_at?: string
          current_tier_id?: string | null
          customer_score?: number
          deleted_at?: string | null
          email?: string | null
          feedback_count?: number
          id?: string
          is_active?: boolean
          last_purchase_date?: string | null
          lifetime_spend_cents?: number
          name?: string
          notes?: string | null
          order_count?: number
          phone?: string | null
          region?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customers_current_tier_id_fkey"
            columns: ["current_tier_id"]
            isOneToOne: false
            referencedRelation: "customer_tiers"
            referencedColumns: ["id"]
          },
        ]
      }
      departments: {
        Row: {
          color: string
          created_at: string
          deleted_at: string | null
          id: string
          is_active: boolean
          name: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          color?: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          is_active?: boolean
          name: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          color?: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          is_active?: boolean
          name?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      employees: {
        Row: {
          bank_account: string | null
          bank_name: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          department_id: string | null
          email: string | null
          employee_code: string
          employment_type: string
          full_name: string
          hire_date: string | null
          id: string
          is_active: boolean
          notes: string | null
          phone: string | null
          position: string
          status: string
          updated_at: string
          updated_by: string | null
          user_id: string | null
        }
        Insert: {
          bank_account?: string | null
          bank_name?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          department_id?: string | null
          email?: string | null
          employee_code: string
          employment_type?: string
          full_name: string
          hire_date?: string | null
          id?: string
          is_active?: boolean
          notes?: string | null
          phone?: string | null
          position?: string
          status?: string
          updated_at?: string
          updated_by?: string | null
          user_id?: string | null
        }
        Update: {
          bank_account?: string | null
          bank_name?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          department_id?: string | null
          email?: string | null
          employee_code?: string
          employment_type?: string
          full_name?: string
          hire_date?: string | null
          id?: string
          is_active?: boolean
          notes?: string | null
          phone?: string | null
          position?: string
          status?: string
          updated_at?: string
          updated_by?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "employees_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employees_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employees_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employees_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      employer_contribution_profiles: {
        Row: {
          created_at: string
          deleted_at: string | null
          id: string
          is_active: boolean
          name: string
          rate_percent: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          is_active?: boolean
          name: string
          rate_percent?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          is_active?: boolean
          name?: string
          rate_percent?: number
          updated_at?: string
        }
        Relationships: []
      }
      feedback_attachments: {
        Row: {
          created_at: string
          created_by: string | null
          feedback_id: string
          file_name: string
          id: string
          mime_type: string
          size_bytes: number
          storage_path: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          feedback_id: string
          file_name: string
          id?: string
          mime_type: string
          size_bytes?: number
          storage_path: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          feedback_id?: string
          file_name?: string
          id?: string
          mime_type?: string
          size_bytes?: number
          storage_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "feedback_attachments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feedback_attachments_feedback_id_fkey"
            columns: ["feedback_id"]
            isOneToOne: false
            referencedRelation: "customer_feedback"
            referencedColumns: ["id"]
          },
        ]
      }
      feedback_comments: {
        Row: {
          author_id: string | null
          body: string
          created_at: string
          feedback_id: string
          id: string
        }
        Insert: {
          author_id?: string | null
          body: string
          created_at?: string
          feedback_id: string
          id?: string
        }
        Update: {
          author_id?: string | null
          body?: string
          created_at?: string
          feedback_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "feedback_comments_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feedback_comments_feedback_id_fkey"
            columns: ["feedback_id"]
            isOneToOne: false
            referencedRelation: "customer_feedback"
            referencedColumns: ["id"]
          },
        ]
      }
      feedback_status_history: {
        Row: {
          changed_by: string | null
          comment: string | null
          created_at: string
          feedback_id: string
          from_status: string | null
          id: string
          to_status: string
        }
        Insert: {
          changed_by?: string | null
          comment?: string | null
          created_at?: string
          feedback_id: string
          from_status?: string | null
          id?: string
          to_status: string
        }
        Update: {
          changed_by?: string | null
          comment?: string | null
          created_at?: string
          feedback_id?: string
          from_status?: string | null
          id?: string
          to_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "feedback_status_history_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feedback_status_history_feedback_id_fkey"
            columns: ["feedback_id"]
            isOneToOne: false
            referencedRelation: "customer_feedback"
            referencedColumns: ["id"]
          },
        ]
      }
      group_invite_links: {
        Row: {
          created_at: string
          created_by: string | null
          expires_at: string | null
          group_id: string
          id: string
          link_type: string
          max_uses: number | null
          password_hash: string | null
          revoked_at: string | null
          token_hash: string
          use_count: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          group_id: string
          id?: string
          link_type: string
          max_uses?: number | null
          password_hash?: string | null
          revoked_at?: string | null
          token_hash: string
          use_count?: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          group_id?: string
          id?: string
          link_type?: string
          max_uses?: number | null
          password_hash?: string | null
          revoked_at?: string | null
          token_hash?: string
          use_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "group_invite_links_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_invite_links_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "message_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      group_members: {
        Row: {
          group_id: string
          id: string
          joined_at: string
          last_read_at: string | null
          role: string
          user_id: string
        }
        Insert: {
          group_id: string
          id?: string
          joined_at?: string
          last_read_at?: string | null
          role?: string
          user_id: string
        }
        Update: {
          group_id?: string
          id?: string
          joined_at?: string
          last_read_at?: string | null
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "group_members_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "message_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_movements: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          movement_type: string
          new_stock: number
          notes: string | null
          previous_stock: number
          product_id: string
          quantity: number
          reference_id: string | null
          reference_type: string | null
          variant_id: string | null
          warehouse_id: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          movement_type: string
          new_stock: number
          notes?: string | null
          previous_stock: number
          product_id: string
          quantity: number
          reference_id?: string | null
          reference_type?: string | null
          variant_id?: string | null
          warehouse_id?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          movement_type?: string
          new_stock?: number
          notes?: string | null
          previous_stock?: number
          product_id?: string
          quantity?: number
          reference_id?: string | null
          reference_type?: string | null
          variant_id?: string | null
          warehouse_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_movements_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_movements_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "mv_product_profitability"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "inventory_movements_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_movements_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_movements_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      investment_cash_flows: {
        Row: {
          amount_cents: number
          created_at: string
          created_by: string | null
          deleted_at: string | null
          entry_date: string
          flow_type: string
          id: string
          investment_id: string
          is_active: boolean
          notes: string | null
          period_month: string
          reference_id: string | null
          reference_type: string | null
          source: string
        }
        Insert: {
          amount_cents: number
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          entry_date?: string
          flow_type: string
          id?: string
          investment_id: string
          is_active?: boolean
          notes?: string | null
          period_month: string
          reference_id?: string | null
          reference_type?: string | null
          source?: string
        }
        Update: {
          amount_cents?: number
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          entry_date?: string
          flow_type?: string
          id?: string
          investment_id?: string
          is_active?: boolean
          notes?: string | null
          period_month?: string
          reference_id?: string | null
          reference_type?: string | null
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "investment_cash_flows_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "investment_cash_flows_investment_id_fkey"
            columns: ["investment_id"]
            isOneToOne: false
            referencedRelation: "investments"
            referencedColumns: ["id"]
          },
        ]
      }
      investment_categories: {
        Row: {
          color: string
          created_at: string
          deleted_at: string | null
          id: string
          is_active: boolean
          name: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          color?: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          is_active?: boolean
          name: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          color?: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          is_active?: boolean
          name?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      investment_monthly_rollup: {
        Row: {
          capital_cents: number
          cost_cents: number
          id: string
          investment_id: string
          period_month: string
          revenue_cents: number
          updated_at: string
        }
        Insert: {
          capital_cents?: number
          cost_cents?: number
          id?: string
          investment_id: string
          period_month: string
          revenue_cents?: number
          updated_at?: string
        }
        Update: {
          capital_cents?: number
          cost_cents?: number
          id?: string
          investment_id?: string
          period_month?: string
          revenue_cents?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "investment_monthly_rollup_investment_id_fkey"
            columns: ["investment_id"]
            isOneToOne: false
            referencedRelation: "investments"
            referencedColumns: ["id"]
          },
        ]
      }
      investment_projects: {
        Row: {
          color: string
          created_at: string
          deleted_at: string | null
          id: string
          is_active: boolean
          name: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          color?: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          is_active?: boolean
          name: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          color?: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          is_active?: boolean
          name?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      investments: {
        Row: {
          assigned_to: string | null
          attribution_product_ids: string[] | null
          break_even_at: string | null
          break_even_notified_at: string | null
          break_even_status: string
          category_id: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          description: string | null
          expected_payback_months: number | null
          id: string
          is_active: boolean
          last_activity_at: string | null
          name: string
          notes: string | null
          project_id: string | null
          recovered_cents: number
          recovery_pct: number
          remaining_cents: number
          roi_pct: number
          start_date: string
          status: string
          total_capital_cents: number
          total_cost_cents: number
          total_revenue_cents: number
          underperforming_notified_at: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          assigned_to?: string | null
          attribution_product_ids?: string[] | null
          break_even_at?: string | null
          break_even_notified_at?: string | null
          break_even_status?: string
          category_id?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          expected_payback_months?: number | null
          id?: string
          is_active?: boolean
          last_activity_at?: string | null
          name: string
          notes?: string | null
          project_id?: string | null
          recovered_cents?: number
          recovery_pct?: number
          remaining_cents?: number
          roi_pct?: number
          start_date?: string
          status?: string
          total_capital_cents?: number
          total_cost_cents?: number
          total_revenue_cents?: number
          underperforming_notified_at?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          assigned_to?: string | null
          attribution_product_ids?: string[] | null
          break_even_at?: string | null
          break_even_notified_at?: string | null
          break_even_status?: string
          category_id?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          expected_payback_months?: number | null
          id?: string
          is_active?: boolean
          last_activity_at?: string | null
          name?: string
          notes?: string | null
          project_id?: string | null
          recovered_cents?: number
          recovery_pct?: number
          remaining_cents?: number
          roi_pct?: number
          start_date?: string
          status?: string
          total_capital_cents?: number
          total_cost_cents?: number
          total_revenue_cents?: number
          underperforming_notified_at?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "investments_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "investments_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "investment_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "investments_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "mv_roi_category"
            referencedColumns: ["category_id"]
          },
          {
            foreignKeyName: "investments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "investments_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "investment_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "investments_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "mv_roi_project"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "investments_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      login_attempts: {
        Row: {
          attempted_at: string
          email: string
          id: number
          ip_address: string | null
          success: boolean
        }
        Insert: {
          attempted_at?: string
          email: string
          id?: never
          ip_address?: string | null
          success: boolean
        }
        Update: {
          attempted_at?: string
          email?: string
          id?: never
          ip_address?: string | null
          success?: boolean
        }
        Relationships: []
      }
      marketing_campaigns: {
        Row: {
          audience_type: string
          audience_value: Json
          channel: string
          completed_at: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          enqueue_cursor: string | null
          failed_count: number
          id: string
          is_active: boolean
          name: string
          schedule_at: string | null
          sent_count: number
          started_at: string | null
          status: string
          subject: string | null
          template: string
          total_recipients: number
          updated_at: string
          voucher_id: string | null
        }
        Insert: {
          audience_type?: string
          audience_value?: Json
          channel: string
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          enqueue_cursor?: string | null
          failed_count?: number
          id?: string
          is_active?: boolean
          name: string
          schedule_at?: string | null
          sent_count?: number
          started_at?: string | null
          status?: string
          subject?: string | null
          template?: string
          total_recipients?: number
          updated_at?: string
          voucher_id?: string | null
        }
        Update: {
          audience_type?: string
          audience_value?: Json
          channel?: string
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          enqueue_cursor?: string | null
          failed_count?: number
          id?: string
          is_active?: boolean
          name?: string
          schedule_at?: string | null
          sent_count?: number
          started_at?: string | null
          status?: string
          subject?: string | null
          template?: string
          total_recipients?: number
          updated_at?: string
          voucher_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "marketing_campaigns_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketing_campaigns_voucher_id_fkey"
            columns: ["voucher_id"]
            isOneToOne: false
            referencedRelation: "vouchers"
            referencedColumns: ["id"]
          },
        ]
      }
      message_attachments: {
        Row: {
          created_at: string
          file_name: string
          file_url: string
          id: string
          kind: string
          message_id: string
          mime_type: string
          size_bytes: number
          storage_path: string
        }
        Insert: {
          created_at?: string
          file_name: string
          file_url: string
          id?: string
          kind?: string
          message_id: string
          mime_type: string
          size_bytes?: number
          storage_path?: string
        }
        Update: {
          created_at?: string
          file_name?: string
          file_url?: string
          id?: string
          kind?: string
          message_id?: string
          mime_type?: string
          size_bytes?: number
          storage_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_attachments_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
      }
      message_groups: {
        Row: {
          created_at: string
          created_by: string | null
          deleted_at: string | null
          description: string | null
          id: string
          is_active: boolean
          name: string | null
          type: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string | null
          type?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string | null
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_groups_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      message_pins: {
        Row: {
          created_at: string
          group_id: string
          id: string
          message_id: string
          pinned_by: string | null
        }
        Insert: {
          created_at?: string
          group_id: string
          id?: string
          message_id: string
          pinned_by?: string | null
        }
        Update: {
          created_at?: string
          group_id?: string
          id?: string
          message_id?: string
          pinned_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "message_pins_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "message_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_pins_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: true
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_pins_pinned_by_fkey"
            columns: ["pinned_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      message_reactions: {
        Row: {
          created_at: string
          emoji: string
          id: string
          message_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          emoji: string
          id?: string
          message_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          emoji?: string
          id?: string
          message_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_reactions_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_reactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      message_stars: {
        Row: {
          created_at: string
          id: string
          message_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          message_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          message_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_stars_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_stars_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          body: string
          body_tsv: unknown
          created_at: string
          deleted: boolean
          deleted_at: string | null
          edited: boolean
          edited_at: string | null
          forwarded: boolean
          forwarded_from_message_id: string | null
          group_id: string
          id: string
          reply_to_message_id: string | null
          sender_id: string | null
        }
        Insert: {
          body?: string
          body_tsv?: unknown
          created_at?: string
          deleted?: boolean
          deleted_at?: string | null
          edited?: boolean
          edited_at?: string | null
          forwarded?: boolean
          forwarded_from_message_id?: string | null
          group_id: string
          id?: string
          reply_to_message_id?: string | null
          sender_id?: string | null
        }
        Update: {
          body?: string
          body_tsv?: unknown
          created_at?: string
          deleted?: boolean
          deleted_at?: string | null
          edited?: boolean
          edited_at?: string | null
          forwarded?: boolean
          forwarded_from_message_id?: string | null
          group_id?: string
          id?: string
          reply_to_message_id?: string | null
          sender_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "messages_forwarded_from_message_id_fkey"
            columns: ["forwarded_from_message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "message_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_reply_to_message_id_fkey"
            columns: ["reply_to_message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_reads: {
        Row: {
          created_at: string
          id: string
          notification_id: string
          read_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          notification_id: string
          read_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          notification_id?: string
          read_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_reads_notification_id_fkey"
            columns: ["notification_id"]
            isOneToOne: false
            referencedRelation: "notifications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_reads_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          audience_type: string
          audience_value: Json | null
          body: string
          category: string | null
          created_at: string
          id: string
          link_url: string | null
          sender_id: string | null
          title: string
          type: string
        }
        Insert: {
          audience_type?: string
          audience_value?: Json | null
          body?: string
          category?: string | null
          created_at?: string
          id?: string
          link_url?: string | null
          sender_id?: string | null
          title: string
          type?: string
        }
        Update: {
          audience_type?: string
          audience_value?: Json | null
          body?: string
          category?: string | null
          created_at?: string
          id?: string
          link_url?: string | null
          sender_id?: string | null
          title?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      order_code_counters: {
        Row: {
          prefix_year: string
          value: number
        }
        Insert: {
          prefix_year: string
          value?: number
        }
        Update: {
          prefix_year?: string
          value?: number
        }
        Relationships: []
      }
      order_items: {
        Row: {
          id: string
          line_total_cents: number
          name: string
          order_id: string
          product_id: string | null
          quantity: number
          sort_order: number
          unit_price_cents: number
          variant_id: string | null
        }
        Insert: {
          id?: string
          line_total_cents?: number
          name: string
          order_id: string
          product_id?: string | null
          quantity?: number
          sort_order?: number
          unit_price_cents?: number
          variant_id?: string | null
        }
        Update: {
          id?: string
          line_total_cents?: number
          name?: string
          order_id?: string
          product_id?: string | null
          quantity?: number
          sort_order?: number
          unit_price_cents?: number
          variant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "mv_product_profitability"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      order_status_history: {
        Row: {
          changed_by: string | null
          comment: string | null
          created_at: string
          from_status: string | null
          id: string
          order_id: string
          to_status: string
        }
        Insert: {
          changed_by?: string | null
          comment?: string | null
          created_at?: string
          from_status?: string | null
          id?: string
          order_id: string
          to_status: string
        }
        Update: {
          changed_by?: string | null
          comment?: string | null
          created_at?: string
          from_status?: string | null
          id?: string
          order_id?: string
          to_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_status_history_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_status_history_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          actual_print_minutes: number | null
          assigned_staff_id: string | null
          buying_date: string
          created_at: string
          created_by: string | null
          crm_applied_at: string | null
          currency: string
          custom_fields: Json
          customer_id: string
          deleted_at: string | null
          delivery_date: string | null
          discount_cents: number
          email: string | null
          estimated_print_minutes: number | null
          filament_used_grams: number | null
          id: string
          infill_percent: number | null
          is_active: boolean
          layer_height_mm: number | null
          material_color: string | null
          material_cost_cents: number
          material_type: string | null
          model_files: Json
          notes: string | null
          nozzle_size_mm: number | null
          order_code: string
          payment_method: string | null
          payment_status: string
          phone: string | null
          post_processing: string | null
          print_deadline_notified_at: string | null
          print_started_at: string | null
          print_state: string
          printer_id: string | null
          priority: string
          receipt_url: string | null
          return_movements_at: string | null
          sale_movements_at: string | null
          shipping_address: string | null
          status: string
          subtotal_cents: number
          tax_cents: number
          total_cents: number
          updated_at: string
          updated_by: string | null
          voucher_id: string | null
        }
        Insert: {
          actual_print_minutes?: number | null
          assigned_staff_id?: string | null
          buying_date: string
          created_at?: string
          created_by?: string | null
          crm_applied_at?: string | null
          currency?: string
          custom_fields?: Json
          customer_id: string
          deleted_at?: string | null
          delivery_date?: string | null
          discount_cents?: number
          email?: string | null
          estimated_print_minutes?: number | null
          filament_used_grams?: number | null
          id?: string
          infill_percent?: number | null
          is_active?: boolean
          layer_height_mm?: number | null
          material_color?: string | null
          material_cost_cents?: number
          material_type?: string | null
          model_files?: Json
          notes?: string | null
          nozzle_size_mm?: number | null
          order_code: string
          payment_method?: string | null
          payment_status?: string
          phone?: string | null
          post_processing?: string | null
          print_deadline_notified_at?: string | null
          print_started_at?: string | null
          print_state?: string
          printer_id?: string | null
          priority?: string
          receipt_url?: string | null
          return_movements_at?: string | null
          sale_movements_at?: string | null
          shipping_address?: string | null
          status?: string
          subtotal_cents?: number
          tax_cents?: number
          total_cents?: number
          updated_at?: string
          updated_by?: string | null
          voucher_id?: string | null
        }
        Update: {
          actual_print_minutes?: number | null
          assigned_staff_id?: string | null
          buying_date?: string
          created_at?: string
          created_by?: string | null
          crm_applied_at?: string | null
          currency?: string
          custom_fields?: Json
          customer_id?: string
          deleted_at?: string | null
          delivery_date?: string | null
          discount_cents?: number
          email?: string | null
          estimated_print_minutes?: number | null
          filament_used_grams?: number | null
          id?: string
          infill_percent?: number | null
          is_active?: boolean
          layer_height_mm?: number | null
          material_color?: string | null
          material_cost_cents?: number
          material_type?: string | null
          model_files?: Json
          notes?: string | null
          nozzle_size_mm?: number | null
          order_code?: string
          payment_method?: string | null
          payment_status?: string
          phone?: string | null
          post_processing?: string | null
          print_deadline_notified_at?: string | null
          print_started_at?: string | null
          print_state?: string
          printer_id?: string | null
          priority?: string
          receipt_url?: string | null
          return_movements_at?: string | null
          sale_movements_at?: string | null
          shipping_address?: string | null
          status?: string
          subtotal_cents?: number
          tax_cents?: number
          total_cents?: number
          updated_at?: string
          updated_by?: string | null
          voucher_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "orders_assigned_staff_id_fkey"
            columns: ["assigned_staff_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "mv_top_customers"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "orders_printer_id_fkey"
            columns: ["printer_id"]
            isOneToOne: false
            referencedRelation: "printers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_voucher_id_fkey"
            columns: ["voucher_id"]
            isOneToOne: false
            referencedRelation: "vouchers"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_settings: {
        Row: {
          address_line: string | null
          barcode_format: string
          company_name: string
          contact_email: string | null
          contact_phone: string | null
          created_at: string
          currency: string
          custom_order_fields: Json
          customer_score_rules: Json
          default_tax_rate: number
          default_warehouse_id: string | null
          feedback_config: Json
          id: string
          lockout_minutes: number
          log_purge_archive: boolean
          log_retention_days: number
          login_attempt_limit: number
          logo_url: string | null
          low_stock_alerts_enabled: boolean
          marketing_config: Json
          material_types: Json
          messaging_config: Json
          order_code_format: string
          order_code_prefix: string
          order_priorities: Json
          order_statuses: Json
          password_policy: Json
          roi_config: Json | null
          schedule_config: Json
          session_timeout_min: number
          sku_format: string
          sku_prefix: string
          trending_config: Json
          two_factor_required: boolean
          updated_at: string
          voucher_defaults: Json
        }
        Insert: {
          address_line?: string | null
          barcode_format?: string
          company_name?: string
          contact_email?: string | null
          contact_phone?: string | null
          created_at?: string
          currency?: string
          custom_order_fields?: Json
          customer_score_rules?: Json
          default_tax_rate?: number
          default_warehouse_id?: string | null
          feedback_config?: Json
          id?: string
          lockout_minutes?: number
          log_purge_archive?: boolean
          log_retention_days?: number
          login_attempt_limit?: number
          logo_url?: string | null
          low_stock_alerts_enabled?: boolean
          marketing_config?: Json
          material_types?: Json
          messaging_config?: Json
          order_code_format?: string
          order_code_prefix?: string
          order_priorities?: Json
          order_statuses?: Json
          password_policy?: Json
          roi_config?: Json | null
          schedule_config?: Json
          session_timeout_min?: number
          sku_format?: string
          sku_prefix?: string
          trending_config?: Json
          two_factor_required?: boolean
          updated_at?: string
          voucher_defaults?: Json
        }
        Update: {
          address_line?: string | null
          barcode_format?: string
          company_name?: string
          contact_email?: string | null
          contact_phone?: string | null
          created_at?: string
          currency?: string
          custom_order_fields?: Json
          customer_score_rules?: Json
          default_tax_rate?: number
          default_warehouse_id?: string | null
          feedback_config?: Json
          id?: string
          lockout_minutes?: number
          log_purge_archive?: boolean
          log_retention_days?: number
          login_attempt_limit?: number
          logo_url?: string | null
          low_stock_alerts_enabled?: boolean
          marketing_config?: Json
          material_types?: Json
          messaging_config?: Json
          order_code_format?: string
          order_code_prefix?: string
          order_priorities?: Json
          order_statuses?: Json
          password_policy?: Json
          roi_config?: Json | null
          schedule_config?: Json
          session_timeout_min?: number
          sku_format?: string
          sku_prefix?: string
          trending_config?: Json
          two_factor_required?: boolean
          updated_at?: string
          voucher_defaults?: Json
        }
        Relationships: []
      }
      payroll_items: {
        Row: {
          absences: number
          allowances: Json
          base_salary_cents: number
          bonuses: Json
          commissions: Json
          created_at: string
          days_worked: number
          deductions: Json
          employee_id: string
          employer_cost_cents: number
          employer_profile_snapshot: Json
          gross_cents: number
          hourly_rate_cents: number
          hours_worked: number
          id: string
          leave_days_unpaid: number
          net_cents: number
          notes: string | null
          overtime_hours: number
          overtime_pay_cents: number
          overtime_rate_cents: number
          pay_basis: string
          payroll_run_id: string
          status: string
          tax_profile_snapshot: Json
          total_deductions_cents: number
          total_tax_cents: number
        }
        Insert: {
          absences?: number
          allowances?: Json
          base_salary_cents?: number
          bonuses?: Json
          commissions?: Json
          created_at?: string
          days_worked?: number
          deductions?: Json
          employee_id: string
          employer_cost_cents?: number
          employer_profile_snapshot?: Json
          gross_cents?: number
          hourly_rate_cents?: number
          hours_worked?: number
          id?: string
          leave_days_unpaid?: number
          net_cents?: number
          notes?: string | null
          overtime_hours?: number
          overtime_pay_cents?: number
          overtime_rate_cents?: number
          pay_basis: string
          payroll_run_id: string
          status?: string
          tax_profile_snapshot?: Json
          total_deductions_cents?: number
          total_tax_cents?: number
        }
        Update: {
          absences?: number
          allowances?: Json
          base_salary_cents?: number
          bonuses?: Json
          commissions?: Json
          created_at?: string
          days_worked?: number
          deductions?: Json
          employee_id?: string
          employer_cost_cents?: number
          employer_profile_snapshot?: Json
          gross_cents?: number
          hourly_rate_cents?: number
          hours_worked?: number
          id?: string
          leave_days_unpaid?: number
          net_cents?: number
          notes?: string | null
          overtime_hours?: number
          overtime_pay_cents?: number
          overtime_rate_cents?: number
          pay_basis?: string
          payroll_run_id?: string
          status?: string
          tax_profile_snapshot?: Json
          total_deductions_cents?: number
          total_tax_cents?: number
        }
        Relationships: [
          {
            foreignKeyName: "payroll_items_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_items_payroll_run_id_fkey"
            columns: ["payroll_run_id"]
            isOneToOne: false
            referencedRelation: "payroll_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      payroll_monthly_rollup: {
        Row: {
          avg_net_cents: number
          department_id: string | null
          headcount: number
          id: string
          period_month: string
          total_deductions_cents: number
          total_employer_cost_cents: number
          total_gross_cents: number
          total_net_cents: number
          total_overtime_cost_cents: number
          total_tax_cents: number
          updated_at: string
        }
        Insert: {
          avg_net_cents?: number
          department_id?: string | null
          headcount?: number
          id?: string
          period_month: string
          total_deductions_cents?: number
          total_employer_cost_cents?: number
          total_gross_cents?: number
          total_net_cents?: number
          total_overtime_cost_cents?: number
          total_tax_cents?: number
          updated_at?: string
        }
        Update: {
          avg_net_cents?: number
          department_id?: string | null
          headcount?: number
          id?: string
          period_month?: string
          total_deductions_cents?: number
          total_employer_cost_cents?: number
          total_gross_cents?: number
          total_net_cents?: number
          total_overtime_cost_cents?: number
          total_tax_cents?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payroll_monthly_rollup_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
        ]
      }
      payroll_runs: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          calculated_at: string | null
          calculated_by: string | null
          closed_at: string | null
          created_at: string
          created_by: string | null
          headcount: number
          id: string
          name: string
          notes: string | null
          paid_at: string | null
          paid_by: string | null
          period_month: string
          run_type: string
          status: string
          total_deductions_cents: number
          total_employer_cost_cents: number
          total_gross_cents: number
          total_net_cents: number
          total_overtime_cost_cents: number
          total_tax_cents: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          calculated_at?: string | null
          calculated_by?: string | null
          closed_at?: string | null
          created_at?: string
          created_by?: string | null
          headcount?: number
          id?: string
          name?: string
          notes?: string | null
          paid_at?: string | null
          paid_by?: string | null
          period_month: string
          run_type?: string
          status?: string
          total_deductions_cents?: number
          total_employer_cost_cents?: number
          total_gross_cents?: number
          total_net_cents?: number
          total_overtime_cost_cents?: number
          total_tax_cents?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          calculated_at?: string | null
          calculated_by?: string | null
          closed_at?: string | null
          created_at?: string
          created_by?: string | null
          headcount?: number
          id?: string
          name?: string
          notes?: string | null
          paid_at?: string | null
          paid_by?: string | null
          period_month?: string
          run_type?: string
          status?: string
          total_deductions_cents?: number
          total_employer_cost_cents?: number
          total_gross_cents?: number
          total_net_cents?: number
          total_overtime_cost_cents?: number
          total_tax_cents?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payroll_runs_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_runs_calculated_by_fkey"
            columns: ["calculated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_runs_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_runs_paid_by_fkey"
            columns: ["paid_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_runs_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      payslips: {
        Row: {
          created_by: string | null
          employee_id: string
          generated_at: string
          id: string
          payroll_item_id: string
          pdf_storage_path: string | null
          period_month: string
          status: string
        }
        Insert: {
          created_by?: string | null
          employee_id: string
          generated_at?: string
          id?: string
          payroll_item_id: string
          pdf_storage_path?: string | null
          period_month: string
          status?: string
        }
        Update: {
          created_by?: string | null
          employee_id?: string
          generated_at?: string
          id?: string
          payroll_item_id?: string
          pdf_storage_path?: string | null
          period_month?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "payslips_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payslips_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payslips_payroll_item_id_fkey"
            columns: ["payroll_item_id"]
            isOneToOne: true
            referencedRelation: "payroll_items"
            referencedColumns: ["id"]
          },
        ]
      }
      permissions: {
        Row: {
          created_at: string
          description: string
          id: string
          key: string
          module: string
        }
        Insert: {
          created_at?: string
          description: string
          id?: string
          key: string
          module: string
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          key?: string
          module?: string
        }
        Relationships: []
      }
      pinned_conversations: {
        Row: {
          created_at: string
          group_id: string
          id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          group_id: string
          id?: string
          user_id: string
        }
        Update: {
          created_at?: string
          group_id?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pinned_conversations_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "message_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pinned_conversations_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      poll_options: {
        Row: {
          id: string
          label: string
          poll_id: string
          sort_order: number
        }
        Insert: {
          id?: string
          label: string
          poll_id: string
          sort_order?: number
        }
        Update: {
          id?: string
          label?: string
          poll_id?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "poll_options_poll_id_fkey"
            columns: ["poll_id"]
            isOneToOne: false
            referencedRelation: "polls"
            referencedColumns: ["id"]
          },
        ]
      }
      poll_votes: {
        Row: {
          created_at: string
          id: string
          option_id: string
          poll_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          option_id: string
          poll_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          option_id?: string
          poll_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "poll_votes_option_id_fkey"
            columns: ["option_id"]
            isOneToOne: false
            referencedRelation: "poll_options"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "poll_votes_poll_id_fkey"
            columns: ["poll_id"]
            isOneToOne: false
            referencedRelation: "polls"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "poll_votes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      polls: {
        Row: {
          closed_at: string | null
          closes_at: string | null
          created_at: string
          created_by: string | null
          group_id: string
          id: string
          message_id: string | null
          poll_type: string
          question: string
          status: string
          visibility: string
        }
        Insert: {
          closed_at?: string | null
          closes_at?: string | null
          created_at?: string
          created_by?: string | null
          group_id: string
          id?: string
          message_id?: string | null
          poll_type?: string
          question: string
          status?: string
          visibility?: string
        }
        Update: {
          closed_at?: string | null
          closes_at?: string | null
          created_at?: string
          created_by?: string | null
          group_id?: string
          id?: string
          message_id?: string | null
          poll_type?: string
          question?: string
          status?: string
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "polls_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "polls_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "message_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "polls_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
      }
      print_schedule: {
        Row: {
          actual_minutes: number | null
          archived_at: string | null
          assigned_to: string | null
          completed_at: string | null
          created_at: string
          estimated_minutes: number | null
          id: string
          order_id: string
          overdue_notified_at: string | null
          print_started_at: string | null
          printer_id: string | null
          queue_position: number
          scheduled_at: string
          state: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          actual_minutes?: number | null
          archived_at?: string | null
          assigned_to?: string | null
          completed_at?: string | null
          created_at?: string
          estimated_minutes?: number | null
          id?: string
          order_id: string
          overdue_notified_at?: string | null
          print_started_at?: string | null
          printer_id?: string | null
          queue_position?: number
          scheduled_at?: string
          state: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          actual_minutes?: number | null
          archived_at?: string | null
          assigned_to?: string | null
          completed_at?: string | null
          created_at?: string
          estimated_minutes?: number | null
          id?: string
          order_id?: string
          overdue_notified_at?: string | null
          print_started_at?: string | null
          printer_id?: string | null
          queue_position?: number
          scheduled_at?: string
          state?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "print_schedule_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "print_schedule_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: true
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "print_schedule_printer_id_fkey"
            columns: ["printer_id"]
            isOneToOne: false
            referencedRelation: "printers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "print_schedule_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      printers: {
        Row: {
          badge_color: string
          brand: string
          created_at: string
          deleted_at: string | null
          id: string
          is_active: boolean
          model: string
          updated_at: string
        }
        Insert: {
          badge_color?: string
          brand: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          is_active?: boolean
          model: string
          updated_at?: string
        }
        Update: {
          badge_color?: string
          brand?: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          is_active?: boolean
          model?: string
          updated_at?: string
        }
        Relationships: []
      }
      product_categories: {
        Row: {
          created_at: string
          deleted_at: string | null
          description: string | null
          id: string
          is_active: boolean
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      product_variants: {
        Row: {
          attributes: Json
          barcode: string | null
          cost_price_cents: number | null
          created_at: string
          current_stock: number
          deleted_at: string | null
          id: string
          is_active: boolean
          minimum_stock: number
          product_id: string
          selling_price_cents: number | null
          sku: string
          updated_at: string
        }
        Insert: {
          attributes?: Json
          barcode?: string | null
          cost_price_cents?: number | null
          created_at?: string
          current_stock?: number
          deleted_at?: string | null
          id?: string
          is_active?: boolean
          minimum_stock?: number
          product_id: string
          selling_price_cents?: number | null
          sku: string
          updated_at?: string
        }
        Update: {
          attributes?: Json
          barcode?: string | null
          cost_price_cents?: number | null
          created_at?: string
          current_stock?: number
          deleted_at?: string | null
          id?: string
          is_active?: boolean
          minimum_stock?: number
          product_id?: string
          selling_price_cents?: number | null
          sku?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_variants_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "mv_product_profitability"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "product_variants_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      production_orders: {
        Row: {
          code: string
          completed_at: string | null
          completed_by: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          id: string
          is_active: boolean
          labor_cost_cents: number
          material_cost_cents: number
          notes: string | null
          overhead_cost_cents: number
          packaging_cost_cents: number
          product_id: string
          quantity: number
          started_at: string | null
          status: string
          total_cost_cents: number
          updated_at: string
        }
        Insert: {
          code: string
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          is_active?: boolean
          labor_cost_cents?: number
          material_cost_cents?: number
          notes?: string | null
          overhead_cost_cents?: number
          packaging_cost_cents?: number
          product_id: string
          quantity: number
          started_at?: string | null
          status?: string
          total_cost_cents?: number
          updated_at?: string
        }
        Update: {
          code?: string
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          is_active?: boolean
          labor_cost_cents?: number
          material_cost_cents?: number
          notes?: string | null
          overhead_cost_cents?: number
          packaging_cost_cents?: number
          product_id?: string
          quantity?: number
          started_at?: string | null
          status?: string
          total_cost_cents?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "production_orders_completed_by_fkey"
            columns: ["completed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_orders_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_orders_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "mv_product_profitability"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "production_orders_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          barcode: string | null
          category_id: string | null
          cost_price_cents: number
          created_at: string
          created_by: string | null
          current_stock: number
          deleted_at: string | null
          description: string | null
          id: string
          image_url: string | null
          is_active: boolean
          labor_cost_cents: number
          low_stock: boolean | null
          minimum_stock: number
          name: string
          overhead_cost_cents: number
          packaging_cost_cents: number
          selling_price_cents: number
          sku: string
          status: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          barcode?: string | null
          category_id?: string | null
          cost_price_cents?: number
          created_at?: string
          created_by?: string | null
          current_stock?: number
          deleted_at?: string | null
          description?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          labor_cost_cents?: number
          low_stock?: boolean | null
          minimum_stock?: number
          name: string
          overhead_cost_cents?: number
          packaging_cost_cents?: number
          selling_price_cents?: number
          sku: string
          status?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          barcode?: string | null
          category_id?: string | null
          cost_price_cents?: number
          created_at?: string
          created_by?: string | null
          current_stock?: number
          deleted_at?: string | null
          description?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          labor_cost_cents?: number
          low_stock?: boolean | null
          minimum_stock?: number
          name?: string
          overhead_cost_cents?: number
          packaging_cost_cents?: number
          selling_price_cents?: number
          sku?: string
          status?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "product_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      profit_sharing_records: {
        Row: {
          created_at: string
          created_by: string
          created_by_name: string
          currency: string
          deleted_at: string | null
          id: string
          is_active: boolean
          label: string
          note: string
          partner_count: number
          partners: Json
          total: number
        }
        Insert: {
          created_at?: string
          created_by: string
          created_by_name?: string
          currency?: string
          deleted_at?: string | null
          id?: string
          is_active?: boolean
          label?: string
          note?: string
          partner_count?: number
          partners?: Json
          total?: number
        }
        Update: {
          created_at?: string
          created_by?: string
          created_by_name?: string
          currency?: string
          deleted_at?: string | null
          id?: string
          is_active?: boolean
          label?: string
          note?: string
          partner_count?: number
          partners?: Json
          total?: number
        }
        Relationships: [
          {
            foreignKeyName: "profit_sharing_records_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_order_items: {
        Row: {
          id: string
          line_total_cents: number
          product_id: string
          purchase_order_id: string
          quantity: number
          sort_order: number
          unit_cost_cents: number
          variant_id: string | null
        }
        Insert: {
          id?: string
          line_total_cents?: number
          product_id: string
          purchase_order_id: string
          quantity: number
          sort_order?: number
          unit_cost_cents?: number
          variant_id?: string | null
        }
        Update: {
          id?: string
          line_total_cents?: number
          product_id?: string
          purchase_order_id?: string
          quantity?: number
          sort_order?: number
          unit_cost_cents?: number
          variant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "purchase_order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "mv_product_profitability"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "purchase_order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_order_items_purchase_order_id_fkey"
            columns: ["purchase_order_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_order_items_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_orders: {
        Row: {
          created_at: string
          created_by: string | null
          deleted_at: string | null
          expected_date: string | null
          id: string
          is_active: boolean
          notes: string | null
          order_date: string
          po_number: string
          received_at: string | null
          received_by: string | null
          status: string
          supplier_id: string
          total_cost_cents: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          expected_date?: string | null
          id?: string
          is_active?: boolean
          notes?: string | null
          order_date?: string
          po_number: string
          received_at?: string | null
          received_by?: string | null
          status?: string
          supplier_id: string
          total_cost_cents?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          expected_date?: string | null
          id?: string
          is_active?: boolean
          notes?: string | null
          order_date?: string
          po_number?: string
          received_at?: string | null
          received_by?: string | null
          status?: string
          supplier_id?: string
          total_cost_cents?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_orders_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_received_by_fkey"
            columns: ["received_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      role_permissions: {
        Row: {
          permission_id: string
          role_id: string
        }
        Insert: {
          permission_id: string
          role_id: string
        }
        Update: {
          permission_id?: string
          role_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "role_permissions_permission_id_fkey"
            columns: ["permission_id"]
            isOneToOne: false
            referencedRelation: "permissions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "role_permissions_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
        ]
      }
      roles: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_system: boolean
          key: string
          name: string
          rank: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_system?: boolean
          key: string
          name: string
          rank?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_system?: boolean
          key?: string
          name?: string
          rank?: number
          updated_at?: string
        }
        Relationships: []
      }
      salary_structures: {
        Row: {
          base_salary_cents: number
          created_at: string
          created_by: string | null
          effective_from: string
          employee_id: string
          employer_contribution_profile_id: string | null
          hourly_rate_cents: number
          id: string
          overtime_rate_cents: number
          pay_basis: string
          recurring_allowances: Json
          recurring_deductions: Json
          standard_working_days: number
          tax_profile_id: string | null
        }
        Insert: {
          base_salary_cents?: number
          created_at?: string
          created_by?: string | null
          effective_from: string
          employee_id: string
          employer_contribution_profile_id?: string | null
          hourly_rate_cents?: number
          id?: string
          overtime_rate_cents?: number
          pay_basis?: string
          recurring_allowances?: Json
          recurring_deductions?: Json
          standard_working_days?: number
          tax_profile_id?: string | null
        }
        Update: {
          base_salary_cents?: number
          created_at?: string
          created_by?: string | null
          effective_from?: string
          employee_id?: string
          employer_contribution_profile_id?: string | null
          hourly_rate_cents?: number
          id?: string
          overtime_rate_cents?: number
          pay_basis?: string
          recurring_allowances?: Json
          recurring_deductions?: Json
          standard_working_days?: number
          tax_profile_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "salary_structures_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "salary_structures_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "salary_structures_employer_contribution_profile_id_fkey"
            columns: ["employer_contribution_profile_id"]
            isOneToOne: false
            referencedRelation: "employer_contribution_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "salary_structures_tax_profile_id_fkey"
            columns: ["tax_profile_id"]
            isOneToOne: false
            referencedRelation: "tax_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      scheduled_items: {
        Row: {
          audience: string
          body: string
          cancelled_at: string | null
          created_at: string
          created_by: string | null
          group_id: string
          id: string
          is_active: boolean
          kind: string
          last_run_at: string | null
          next_run_at: string
          poll_id: string | null
          priority: string
          repeat_interval_minutes: number | null
          repeat_rule: string
          runs_count: number
          updated_at: string
        }
        Insert: {
          audience?: string
          body?: string
          cancelled_at?: string | null
          created_at?: string
          created_by?: string | null
          group_id: string
          id?: string
          is_active?: boolean
          kind: string
          last_run_at?: string | null
          next_run_at: string
          poll_id?: string | null
          priority?: string
          repeat_interval_minutes?: number | null
          repeat_rule?: string
          runs_count?: number
          updated_at?: string
        }
        Update: {
          audience?: string
          body?: string
          cancelled_at?: string | null
          created_at?: string
          created_by?: string | null
          group_id?: string
          id?: string
          is_active?: boolean
          kind?: string
          last_run_at?: string | null
          next_run_at?: string
          poll_id?: string | null
          priority?: string
          repeat_interval_minutes?: number | null
          repeat_rule?: string
          runs_count?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "scheduled_items_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scheduled_items_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "message_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scheduled_items_poll_fkey"
            columns: ["poll_id"]
            isOneToOne: false
            referencedRelation: "polls"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_tasks: {
        Row: {
          assigned_to: string
          category: string
          completed_at: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          done: boolean
          due_date: string | null
          id: string
          is_active: boolean
          priority: string
          title: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          assigned_to: string
          category?: string
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          done?: boolean
          due_date?: string | null
          id?: string
          is_active?: boolean
          priority?: string
          title: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          assigned_to?: string
          category?: string
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          done?: boolean
          due_date?: string | null
          id?: string
          is_active?: boolean
          priority?: string
          title?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "staff_tasks_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_tasks_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_tasks_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      suppliers: {
        Row: {
          address: string | null
          company_name: string
          contact_name: string | null
          created_at: string
          deleted_at: string | null
          email: string | null
          id: string
          is_active: boolean
          notes: string | null
          phone: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          company_name: string
          contact_name?: string | null
          created_at?: string
          deleted_at?: string | null
          email?: string | null
          id?: string
          is_active?: boolean
          notes?: string | null
          phone?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          company_name?: string
          contact_name?: string | null
          created_at?: string
          deleted_at?: string | null
          email?: string | null
          id?: string
          is_active?: boolean
          notes?: string | null
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      tax_profiles: {
        Row: {
          created_at: string
          deleted_at: string | null
          fixed_cents: number
          id: string
          is_active: boolean
          kind: string
          name: string
          rate_percent: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          fixed_cents?: number
          id?: string
          is_active?: boolean
          kind?: string
          name: string
          rate_percent?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          fixed_cents?: number
          id?: string
          is_active?: boolean
          kind?: string
          name?: string
          rate_percent?: number
          updated_at?: string
        }
        Relationships: []
      }
      tier_benefits: {
        Row: {
          cashback_percent: number
          discount_percent: number
          exclusive_promotions: boolean
          free_shipping: boolean
          id: string
          priority_support: boolean
          tier_id: string
          updated_at: string
          voucher_amount_cents: number
        }
        Insert: {
          cashback_percent?: number
          discount_percent?: number
          exclusive_promotions?: boolean
          free_shipping?: boolean
          id?: string
          priority_support?: boolean
          tier_id: string
          updated_at?: string
          voucher_amount_cents?: number
        }
        Update: {
          cashback_percent?: number
          discount_percent?: number
          exclusive_promotions?: boolean
          free_shipping?: boolean
          id?: string
          priority_support?: boolean
          tier_id?: string
          updated_at?: string
          voucher_amount_cents?: number
        }
        Relationships: [
          {
            foreignKeyName: "tier_benefits_tier_id_fkey"
            columns: ["tier_id"]
            isOneToOne: true
            referencedRelation: "customer_tiers"
            referencedColumns: ["id"]
          },
        ]
      }
      trending_product_votes: {
        Row: {
          created_at: string
          trending_product_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          trending_product_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          trending_product_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trending_product_votes_trending_product_id_fkey"
            columns: ["trending_product_id"]
            isOneToOne: false
            referencedRelation: "trending_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trending_product_votes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      trending_products: {
        Row: {
          added_by: string | null
          category_id: string | null
          created_at: string
          deleted_at: string | null
          description: string | null
          est_cost_cents: number | null
          est_filament_grams: number | null
          est_print_minutes: number | null
          est_selling_cents: number | null
          id: string
          images: Json
          is_active: boolean
          name: string
          notes: string | null
          popularity_score: number
          promoted_product_id: string | null
          source_platform: string
          source_url: string | null
          suggested_material: string | null
          tags: string[]
          trend_status: string
          updated_at: string
          updated_by: string | null
          votes_count: number
        }
        Insert: {
          added_by?: string | null
          category_id?: string | null
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          est_cost_cents?: number | null
          est_filament_grams?: number | null
          est_print_minutes?: number | null
          est_selling_cents?: number | null
          id?: string
          images?: Json
          is_active?: boolean
          name: string
          notes?: string | null
          popularity_score?: number
          promoted_product_id?: string | null
          source_platform?: string
          source_url?: string | null
          suggested_material?: string | null
          tags?: string[]
          trend_status?: string
          updated_at?: string
          updated_by?: string | null
          votes_count?: number
        }
        Update: {
          added_by?: string | null
          category_id?: string | null
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          est_cost_cents?: number | null
          est_filament_grams?: number | null
          est_print_minutes?: number | null
          est_selling_cents?: number | null
          id?: string
          images?: Json
          is_active?: boolean
          name?: string
          notes?: string | null
          popularity_score?: number
          promoted_product_id?: string | null
          source_platform?: string
          source_url?: string | null
          suggested_material?: string | null
          tags?: string[]
          trend_status?: string
          updated_at?: string
          updated_by?: string | null
          votes_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "trending_products_added_by_fkey"
            columns: ["added_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trending_products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "product_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trending_products_promoted_product_id_fkey"
            columns: ["promoted_product_id"]
            isOneToOne: false
            referencedRelation: "mv_product_profitability"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "trending_products_promoted_product_id_fkey"
            columns: ["promoted_product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trending_products_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      user_activity_daily: {
        Row: {
          actions: number
          day: string
          logins: number
          user_id: string
        }
        Insert: {
          actions?: number
          day: string
          logins?: number
          user_id: string
        }
        Update: {
          actions?: number
          day?: string
          logins?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_activity_daily_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      user_pins: {
        Row: {
          created_at: string
          id: string
          pinned_by: string
          pinned_user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          pinned_by: string
          pinned_user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          pinned_by?: string
          pinned_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_pins_pinned_by_fkey"
            columns: ["pinned_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_pins_pinned_user_id_fkey"
            columns: ["pinned_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      user_preferences: {
        Row: {
          created_at: string
          date_format: string
          default_landing_page: string
          language: string
          notification_prefs: Json
          profit_sharing_config: Json | null
          sidebar_collapsed: boolean
          sidebar_default_state: string
          theme: string
          time_format: string
          timezone: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          date_format?: string
          default_landing_page?: string
          language?: string
          notification_prefs?: Json
          profit_sharing_config?: Json | null
          sidebar_collapsed?: boolean
          sidebar_default_state?: string
          theme?: string
          time_format?: string
          timezone?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          date_format?: string
          default_landing_page?: string
          language?: string
          notification_prefs?: Json
          profit_sharing_config?: Json | null
          sidebar_collapsed?: boolean
          sidebar_default_state?: string
          theme?: string
          time_format?: string
          timezone?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_preferences_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          avatar_url: string | null
          ban_reason: string | null
          banned_at: string | null
          banned_by: string | null
          birthday: string | null
          created_at: string
          deleted_at: string | null
          department: string | null
          email: string
          full_name: string
          gender: string | null
          id: string
          is_active: boolean
          last_login_at: string | null
          must_reset_password: boolean
          phone: string | null
          role_id: string
          status: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          ban_reason?: string | null
          banned_at?: string | null
          banned_by?: string | null
          birthday?: string | null
          created_at?: string
          deleted_at?: string | null
          department?: string | null
          email: string
          full_name?: string
          gender?: string | null
          id: string
          is_active?: boolean
          last_login_at?: string | null
          must_reset_password?: boolean
          phone?: string | null
          role_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          ban_reason?: string | null
          banned_at?: string | null
          banned_by?: string | null
          birthday?: string | null
          created_at?: string
          deleted_at?: string | null
          department?: string | null
          email?: string
          full_name?: string
          gender?: string | null
          id?: string
          is_active?: boolean
          last_login_at?: string | null
          must_reset_password?: boolean
          phone?: string | null
          role_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "users_banned_by_fkey"
            columns: ["banned_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "users_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
        ]
      }
      voucher_redemptions: {
        Row: {
          amount_discounted_cents: number
          created_at: string
          customer_id: string
          id: string
          order_id: string | null
          voucher_id: string
        }
        Insert: {
          amount_discounted_cents?: number
          created_at?: string
          customer_id: string
          id?: string
          order_id?: string | null
          voucher_id: string
        }
        Update: {
          amount_discounted_cents?: number
          created_at?: string
          customer_id?: string
          id?: string
          order_id?: string | null
          voucher_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "voucher_redemptions_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "voucher_redemptions_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "mv_top_customers"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "voucher_redemptions_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "voucher_redemptions_voucher_id_fkey"
            columns: ["voucher_id"]
            isOneToOne: false
            referencedRelation: "vouchers"
            referencedColumns: ["id"]
          },
        ]
      }
      vouchers: {
        Row: {
          assigned_customer_id: string | null
          code: string
          created_at: string
          created_by: string | null
          dedupe_key: string | null
          end_date: string | null
          id: string
          is_active: boolean
          source: string
          start_date: string
          type: string
          updated_at: string
          usage_limit: number | null
          used_count: number
          value_cents: number | null
          value_percent: number | null
        }
        Insert: {
          assigned_customer_id?: string | null
          code: string
          created_at?: string
          created_by?: string | null
          dedupe_key?: string | null
          end_date?: string | null
          id?: string
          is_active?: boolean
          source?: string
          start_date?: string
          type: string
          updated_at?: string
          usage_limit?: number | null
          used_count?: number
          value_cents?: number | null
          value_percent?: number | null
        }
        Update: {
          assigned_customer_id?: string | null
          code?: string
          created_at?: string
          created_by?: string | null
          dedupe_key?: string | null
          end_date?: string | null
          id?: string
          is_active?: boolean
          source?: string
          start_date?: string
          type?: string
          updated_at?: string
          usage_limit?: number | null
          used_count?: number
          value_cents?: number | null
          value_percent?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "vouchers_assigned_customer_id_fkey"
            columns: ["assigned_customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vouchers_assigned_customer_id_fkey"
            columns: ["assigned_customer_id"]
            isOneToOne: false
            referencedRelation: "mv_top_customers"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "vouchers_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      warehouse_inventory: {
        Row: {
          id: string
          product_id: string
          quantity: number
          updated_at: string
          variant_id: string | null
          warehouse_id: string
        }
        Insert: {
          id?: string
          product_id: string
          quantity?: number
          updated_at?: string
          variant_id?: string | null
          warehouse_id: string
        }
        Update: {
          id?: string
          product_id?: string
          quantity?: number
          updated_at?: string
          variant_id?: string | null
          warehouse_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "warehouse_inventory_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "mv_product_profitability"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "warehouse_inventory_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "warehouse_inventory_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "warehouse_inventory_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      warehouses: {
        Row: {
          address: string | null
          code: string
          created_at: string
          deleted_at: string | null
          id: string
          is_active: boolean
          is_default: boolean
          name: string
          updated_at: string
        }
        Insert: {
          address?: string | null
          code: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          is_active?: boolean
          is_default?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          address?: string | null
          code?: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          is_active?: boolean
          is_default?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      mv_feedback_daily: {
        Row: {
          category: string | null
          day: string | null
          feedback_count: number | null
          rating: number | null
          resolved_count: number | null
          severity: string | null
          source_channel: string | null
        }
        Relationships: []
      }
      mv_feedback_products: {
        Row: {
          avg_rating: number | null
          negative_count: number | null
          product_id: string | null
          product_name: string | null
          sku: string | null
        }
        Relationships: [
          {
            foreignKeyName: "order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "mv_product_profitability"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      mv_feedback_repeat_negative: {
        Row: {
          customer_id: string | null
          last_negative_at: string | null
          name: string | null
          negative_count: number | null
        }
        Relationships: [
          {
            foreignKeyName: "customer_feedback_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_feedback_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "mv_top_customers"
            referencedColumns: ["customer_id"]
          },
        ]
      }
      mv_feedback_staff: {
        Row: {
          full_name: string | null
          median_resolution_hours: number | null
          resolved_by: string | null
          resolved_count: number | null
        }
        Relationships: [
          {
            foreignKeyName: "customer_feedback_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      mv_feedback_summary: {
        Row: {
          avg_rating: number | null
          avg_rating_last_month: number | null
          avg_rating_this_month: number | null
          avg_resolution_hours: number | null
          detractors: number | null
          id: number | null
          open_high: number | null
          open_in_progress: number | null
          open_low: number | null
          open_medium: number | null
          open_new: number | null
          passives: number | null
          promoters: number | null
          refreshed_at: string | null
          resolved_count: number | null
          total_feedback: number | null
        }
        Relationships: []
      }
      mv_inventory_value: {
        Row: {
          low_stock_products: number | null
          products_in_stock: number | null
          singleton_id: number | null
          value_cost_cents: number | null
          value_retail_cents: number | null
        }
        Relationships: []
      }
      mv_material_stats: {
        Row: {
          filament_grams: number | null
          material_cost_cents: number | null
          material_type: string | null
          orders_count: number | null
          revenue_cents: number | null
        }
        Relationships: []
      }
      mv_orders_daily: {
        Row: {
          assigned_staff_id: string | null
          day: string | null
          material_cost_cents: number | null
          orders_count: number | null
          paid_orders_count: number | null
          print_minutes: number | null
          priority: string | null
          revenue_cents: number | null
          status: string | null
        }
        Relationships: [
          {
            foreignKeyName: "orders_assigned_staff_id_fkey"
            columns: ["assigned_staff_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      mv_printer_daily: {
        Row: {
          badge_color: string | null
          brand: string | null
          day: string | null
          model: string | null
          orders_count: number | null
          print_minutes: number | null
          printer_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "orders_printer_id_fkey"
            columns: ["printer_id"]
            isOneToOne: false
            referencedRelation: "printers"
            referencedColumns: ["id"]
          },
        ]
      }
      mv_printer_stats: {
        Row: {
          badge_color: string | null
          brand: string | null
          filament_grams: number | null
          material_cost_cents: number | null
          model: string | null
          orders_count: number | null
          print_minutes: number | null
          printer_id: string | null
          revenue_cents: number | null
        }
        Relationships: [
          {
            foreignKeyName: "orders_printer_id_fkey"
            columns: ["printer_id"]
            isOneToOne: false
            referencedRelation: "printers"
            referencedColumns: ["id"]
          },
        ]
      }
      mv_product_profitability: {
        Row: {
          category_name: string | null
          cogs_cents: number | null
          gross_profit_cents: number | null
          last_sold_at: string | null
          margin_percent: number | null
          name: string | null
          product_id: string | null
          production_cost_cents: number | null
          profit_per_unit_cents: number | null
          revenue_cents: number | null
          selling_price_cents: number | null
          sku: string | null
          status: string | null
          units_sold: number | null
        }
        Relationships: []
      }
      mv_revenue_daily: {
        Row: {
          cogs_cents: number | null
          day: string | null
          discount_cents: number | null
          filament_grams: number | null
          gross_profit_cents: number | null
          orders_count: number | null
          print_material_cost_cents: number | null
          print_minutes: number | null
          revenue_cents: number | null
          total_cost_cents: number | null
        }
        Relationships: []
      }
      mv_roi_category: {
        Row: {
          category_color: string | null
          category_id: string | null
          category_name: string | null
          investment_count: number | null
          recovered_cents: number | null
          recovery_pct: number | null
          remaining_cents: number | null
          roi_pct: number | null
          total_capital_cents: number | null
        }
        Relationships: []
      }
      mv_roi_portfolio: {
        Row: {
          id: number | null
          in_progress_count: number | null
          investment_count: number | null
          recovered_cents: number | null
          recovered_count: number | null
          recovery_pct: number | null
          refreshed_at: string | null
          remaining_cents: number | null
          roi_pct: number | null
          total_capital_cents: number | null
          total_cost_cents: number | null
          total_revenue_cents: number | null
          underperforming_count: number | null
        }
        Relationships: []
      }
      mv_roi_project: {
        Row: {
          investment_count: number | null
          project_color: string | null
          project_id: string | null
          project_name: string | null
          recovered_cents: number | null
          recovery_pct: number | null
          remaining_cents: number | null
          roi_pct: number | null
          total_capital_cents: number | null
        }
        Relationships: []
      }
      mv_summary_stats: {
        Row: {
          active_customers_90d: number | null
          id: number | null
          refreshed_at: string | null
          total_customers: number | null
        }
        Relationships: []
      }
      mv_top_customers: {
        Row: {
          customer_id: string | null
          last_purchase_date: string | null
          lifetime_spend_cents: number | null
          name: string | null
          order_count: number | null
          tier_color: string | null
          tier_name: string | null
        }
        Relationships: []
      }
      v_investment_monthly: {
        Row: {
          capital_cents: number | null
          cost_cents: number | null
          cumulative_invested_cents: number | null
          cumulative_profit_cents: number | null
          id: string | null
          investment_id: string | null
          period_month: string | null
          profit_cents: number | null
          recovery_to_date_pct: number | null
          remaining_recovery_cents: number | null
          revenue_cents: number | null
          roi_to_date_pct: number | null
        }
        Relationships: [
          {
            foreignKeyName: "investment_monthly_rollup_investment_id_fkey"
            columns: ["investment_id"]
            isOneToOne: false
            referencedRelation: "investments"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      apply_inventory_movement: {
        Args: {
          p_allow_negative?: boolean
          p_movement_type: string
          p_notes?: string
          p_product_id: string
          p_quantity: number
          p_reference_id?: string
          p_reference_type?: string
          p_variant_id?: string
          p_warehouse_id?: string
        }
        Returns: string
      }
      apply_investment_cash_flow: {
        Args: {
          p_amount_cents: number
          p_entry_date?: string
          p_flow_type: string
          p_investment_id: string
          p_notes?: string
          p_reference_id?: string
          p_reference_type?: string
          p_source?: string
        }
        Returns: string
      }
      apply_order_stock_movements: {
        Args: { p_direction: string; p_order_id: string }
        Returns: number
      }
      apply_order_to_crm: {
        Args: { p_order_id: string }
        Returns: {
          applied: boolean
          customer_id: string
          new_tier_id: string
          previous_tier_id: string
          tier_changed: boolean
        }[]
      }
      approve_payroll_run: { Args: { p_run_id: string }; Returns: undefined }
      assert_any_permission: { Args: { p_keys: string[] }; Returns: undefined }
      best_tier_for: {
        Args: {
          p_annual_cents: number
          p_lifetime_cents: number
          p_order_count: number
          p_score: number
        }
        Returns: string
      }
      calculate_payroll_run: { Args: { p_run_id: string }; Returns: number }
      cast_poll_vote: {
        Args: { p_option_ids: string[]; p_poll_id: string }
        Returns: undefined
      }
      claim_due_print_notifications: {
        Args: { p_limit?: number }
        Returns: {
          assigned_staff_id: string
          estimated_print_minutes: number
          order_code: string
          order_id: string
        }[]
      }
      claim_due_scheduled_items: {
        Args: { p_limit?: number }
        Returns: {
          audience: string
          body: string
          cancelled_at: string | null
          created_at: string
          created_by: string | null
          group_id: string
          id: string
          is_active: boolean
          kind: string
          last_run_at: string | null
          next_run_at: string
          poll_id: string | null
          priority: string
          repeat_interval_minutes: number | null
          repeat_rule: string
          runs_count: number
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "scheduled_items"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      claim_invite_link: {
        Args: { p_link_id: string; p_user_id: string }
        Returns: {
          group_id: string
          joined: boolean
          reason: string
        }[]
      }
      complete_production_order: { Args: { p_id: string }; Returns: number }
      current_role_key: { Args: never; Returns: string }
      custom_access_token_hook: { Args: { event: Json }; Returns: Json }
      customers_with_birthday_today: {
        Args: { p_limit?: number }
        Returns: {
          id: string
          name: string
        }[]
      }
      delete_investment_cash_flow: { Args: { p_id: string }; Returns: boolean }
      enqueue_campaign_recipients: {
        Args: { p_batch?: number; p_campaign_id: string }
        Returns: number
      }
      ensure_activity_log_partitions: {
        Args: { p_months_ahead?: number; p_months_back?: number }
        Returns: number
      }
      ensure_campaign_event_partitions: {
        Args: { p_months_ahead?: number; p_months_back?: number }
        Returns: number
      }
      estimated_count: { Args: { p_table: string }; Returns: number }
      evaluate_customer_tier: {
        Args: { p_customer_id: string }
        Returns: {
          changed: boolean
          history_id: string
          new_tier_id: string
          previous_tier_id: string
        }[]
      }
      has_permission: { Args: { p_key: string }; Returns: boolean }
      is_admin: { Args: never; Returns: boolean }
      is_group_member: { Args: { p_group: string }; Returns: boolean }
      mark_all_notifications_read: { Args: never; Returns: number }
      my_conversations: {
        Args: never
        Returns: {
          created_at: string
          group_id: string
          last_at: string
          last_body: string
          last_deleted: boolean
          last_read_at: string
          last_sender_name: string
          member_count: number
          name: string
          other_avatar_url: string
          other_name: string
          other_user_id: string
          type: string
          unread_count: number
        }[]
      }
      next_document_number: { Args: { p_prefix: string }; Returns: string }
      next_order_code: { Args: { p_prefix?: string }; Returns: string }
      poll_results: {
        Args: { p_poll_id: string }
        Returns: {
          option_id: string
          voter_names: string[]
          votes: number
        }[]
      }
      purge_activity_logs: {
        Args: { p_actor?: string; p_before: string; p_dry_run?: boolean }
        Returns: number
      }
      receive_purchase_order: { Args: { p_po_id: string }; Returns: number }
      reconcile_customer_aggregates: {
        Args: { p_limit?: number }
        Returns: number
      }
      reconcile_investment_aggregates: {
        Args: { p_limit?: number }
        Returns: number
      }
      reconcile_user_activity: { Args: { p_days?: number }; Returns: number }
      redeem_voucher: {
        Args: {
          p_code: string
          p_customer_id: string
          p_order_id: string
          p_order_total_cents: number
        }
        Returns: {
          discount_cents: number
          redemption_id: string
          voucher_id: string
        }[]
      }
      refresh_analytics_views: { Args: never; Returns: undefined }
      refresh_campaign_stats: {
        Args: { p_campaign_id: string }
        Returns: undefined
      }
      run_roi_auto_attribution: { Args: { p_limit?: number }; Returns: number }
      unread_notification_count: { Args: never; Returns: number }
      verify_activity_log_chain: {
        Args: { p_limit?: number }
        Returns: {
          checked: number
          first_bad_seq: number
          mismatches: number
        }[]
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

