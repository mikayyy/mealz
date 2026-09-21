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
      grocery_items: {
        Row: {
          category: string
          checked: boolean
          created_at: string
          deleted: boolean
          id: string
          name: string
          quantity: number | null
          source: string
          source_key: string | null
          unit: string | null
          updated_at: string
          user_modified: boolean
          weekly_plan_id: string
        }
        Insert: {
          category?: string
          checked?: boolean
          created_at?: string
          deleted?: boolean
          id?: string
          name: string
          quantity?: number | null
          source?: string
          source_key?: string | null
          unit?: string | null
          updated_at?: string
          user_modified?: boolean
          weekly_plan_id: string
        }
        Update: {
          category?: string
          checked?: boolean
          created_at?: string
          deleted?: boolean
          id?: string
          name?: string
          quantity?: number | null
          source?: string
          source_key?: string | null
          unit?: string | null
          updated_at?: string
          user_modified?: boolean
          weekly_plan_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "grocery_items_weekly_plan_id_fkey"
            columns: ["weekly_plan_id"]
            isOneToOne: false
            referencedRelation: "weekly_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      household_members: {
        Row: {
          created_at: string
          household_id: string
          role: string
          user_id: string
        }
        Insert: {
          created_at?: string
          household_id: string
          role?: string
          user_id: string
        }
        Update: {
          created_at?: string
          household_id?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "household_members_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      households: {
        Row: {
          created_at: string
          created_by: string
          id: string
          join_code_hash: string | null
          join_code_hint: string | null
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          join_code_hash?: string | null
          join_code_hint?: string | null
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          join_code_hash?: string | null
          join_code_hint?: string | null
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      ingredients: {
        Row: {
          category: string | null
          created_at: string
          id: string
          meal_id: string
          name: string
          optional: boolean
          quantity: number | null
          unit: string | null
        }
        Insert: {
          category?: string | null
          created_at?: string
          id?: string
          meal_id: string
          name: string
          optional?: boolean
          quantity?: number | null
          unit?: string | null
        }
        Update: {
          category?: string | null
          created_at?: string
          id?: string
          meal_id?: string
          name?: string
          optional?: boolean
          quantity?: number | null
          unit?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ingredients_meal_id_fkey"
            columns: ["meal_id"]
            isOneToOne: false
            referencedRelation: "meals"
            referencedColumns: ["id"]
          },
        ]
      }
      meals: {
        Row: {
          created_at: string
          day: string
          description: string | null
          difficulty: string | null
          emoji: string | null
          id: string
          kid_note: string | null
          meal_key: string | null
          servings: number | null
          sort_order: number | null
          tags: string[] | null
          title: string
          total_minutes: number | null
          weekly_plan_id: string
        }
        Insert: {
          created_at?: string
          day: string
          description?: string | null
          difficulty?: string | null
          emoji?: string | null
          id?: string
          kid_note?: string | null
          meal_key?: string | null
          servings?: number | null
          sort_order?: number | null
          tags?: string[] | null
          title: string
          total_minutes?: number | null
          weekly_plan_id: string
        }
        Update: {
          created_at?: string
          day?: string
          description?: string | null
          difficulty?: string | null
          emoji?: string | null
          id?: string
          kid_note?: string | null
          meal_key?: string | null
          servings?: number | null
          sort_order?: number | null
          tags?: string[] | null
          title?: string
          total_minutes?: number | null
          weekly_plan_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "meals_weekly_plan_id_fkey"
            columns: ["weekly_plan_id"]
            isOneToOne: false
            referencedRelation: "weekly_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      mealz_rate_limits: {
        Row: {
          bucket_key: string
          hits: number
          window_start: string
        }
        Insert: {
          bucket_key: string
          hits: number
          window_start: string
        }
        Update: {
          bucket_key?: string
          hits?: number
          window_start?: string
        }
        Relationships: []
      }
      mealz_trusted_devices: {
        Row: {
          created_at: string
          device_token_hash: string
          email: string
          id: string
          label: string
          last_used_at: string | null
          pin_hash: string
          pin_salt: string
          revoked_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          device_token_hash: string
          email: string
          id?: string
          label: string
          last_used_at?: string | null
          pin_hash: string
          pin_salt: string
          revoked_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          device_token_hash?: string
          email?: string
          id?: string
          label?: string
          last_used_at?: string | null
          pin_hash?: string
          pin_salt?: string
          revoked_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          adults: number
          children: number
          created_at: string
          diet_tags: string[]
          equipment: string[]
          household_id: string
          household_size: number
          id: string
          owner_user_id: string | null
          profile_key: string
          stores: string[]
          updated_at: string
        }
        Insert: {
          adults?: number
          children?: number
          created_at?: string
          diet_tags?: string[]
          equipment?: string[]
          household_id: string
          household_size?: number
          id?: string
          owner_user_id?: string | null
          profile_key?: string
          stores?: string[]
          updated_at?: string
        }
        Update: {
          adults?: number
          children?: number
          created_at?: string
          diet_tags?: string[]
          equipment?: string[]
          household_id?: string
          household_size?: number
          id?: string
          owner_user_id?: string | null
          profile_key?: string
          stores?: string[]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      recipe_steps: {
        Row: {
          id: string
          instruction: string
          meal_id: string
          step_number: number
        }
        Insert: {
          id?: string
          instruction: string
          meal_id: string
          step_number: number
        }
        Update: {
          id?: string
          instruction?: string
          meal_id?: string
          step_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "recipe_steps_meal_id_fkey"
            columns: ["meal_id"]
            isOneToOne: false
            referencedRelation: "meals"
            referencedColumns: ["id"]
          },
        ]
      }
      weekly_plans: {
        Row: {
          cooking_days: string[] | null
          created_at: string
          equipment: string[] | null
          household_id: string
          household_size: number
          id: string
          notes: string | null
          owner_user_id: string | null
          status: string
          updated_at: string
          use_up: string | null
          week_start: string
        }
        Insert: {
          cooking_days?: string[] | null
          created_at?: string
          equipment?: string[] | null
          household_id: string
          household_size?: number
          id?: string
          notes?: string | null
          owner_user_id?: string | null
          status?: string
          updated_at?: string
          use_up?: string | null
          week_start: string
        }
        Update: {
          cooking_days?: string[] | null
          created_at?: string
          equipment?: string[] | null
          household_id?: string
          household_size?: number
          id?: string
          notes?: string | null
          owner_user_id?: string | null
          status?: string
          updated_at?: string
          use_up?: string | null
          week_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "weekly_plans_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      mealz_manage_household: {
        Args: {
          p_action: string
          p_hash?: string
          p_hint?: string
          p_name?: string
          p_user_id: string
        }
        Returns: Json
      }
      mealz_take_rate_limit: {
        Args: { p_key: string; p_limit: number; p_window_seconds: number }
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
