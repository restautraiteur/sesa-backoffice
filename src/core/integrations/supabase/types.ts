export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18";
  };
  public: {
    Tables: {
      day_products: {
        Row: {
          close_time: string | null;
          created_at: string;
          day_id: string;
          id: string;
          is_active: boolean;
          open_time: string | null;
          price: number;
          product_id: string;
          stock_initial: number;
          stock_reserved: number;
        };
        Insert: {
          close_time?: string | null;
          created_at?: string;
          day_id: string;
          id?: string;
          is_active?: boolean;
          open_time?: string | null;
          price?: number;
          product_id: string;
          stock_initial?: number;
          stock_reserved?: number;
        };
        Update: {
          close_time?: string | null;
          created_at?: string;
          day_id?: string;
          id?: string;
          is_active?: boolean;
          open_time?: string | null;
          price?: number;
          product_id?: string;
          stock_initial?: number;
          stock_reserved?: number;
        };
        Relationships: [
          {
            foreignKeyName: "day_products_day_id_fkey";
            columns: ["day_id"];
            isOneToOne: false;
            referencedRelation: "days";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "day_products_day_id_fkey";
            columns: ["day_id"];
            isOneToOne: false;
            referencedRelation: "menu_view";
            referencedColumns: ["day_id"];
          },
          {
            foreignKeyName: "day_products_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "juice_catalog_view";
            referencedColumns: ["product_id"];
          },
          {
            foreignKeyName: "day_products_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "menu_view";
            referencedColumns: ["product_id"];
          },
          {
            foreignKeyName: "day_products_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
        ];
      };
      days: {
        Row: {
          close_time: string;
          created_at: string;
          date: string;
          id: string;
          is_open: boolean;
          open_time: string;
          week_id: string;
        };
        Insert: {
          close_time?: string;
          created_at?: string;
          date: string;
          id?: string;
          is_open?: boolean;
          open_time?: string;
          week_id: string;
        };
        Update: {
          close_time?: string;
          created_at?: string;
          date?: string;
          id?: string;
          is_open?: boolean;
          open_time?: string;
          week_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "days_week_id_fkey";
            columns: ["week_id"];
            isOneToOne: false;
            referencedRelation: "menu_view";
            referencedColumns: ["week_id"];
          },
          {
            foreignKeyName: "days_week_id_fkey";
            columns: ["week_id"];
            isOneToOne: false;
            referencedRelation: "weeks";
            referencedColumns: ["id"];
          },
        ];
      };
      ingredient_formats: {
        Row: {
          created_at: string;
          id: string;
          ingredient_id: string;
          is_default: boolean;
          label: string;
          price: number;
          size: number;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          ingredient_id: string;
          is_default?: boolean;
          label: string;
          price?: number;
          size: number;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          ingredient_id?: string;
          is_default?: boolean;
          label?: string;
          price?: number;
          size?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "ingredient_formats_ingredient_id_fkey";
            columns: ["ingredient_id"];
            isOneToOne: false;
            referencedRelation: "ingredients";
            referencedColumns: ["id"];
          },
        ];
      };
      ingredients: {
        Row: {
          created_at: string;
          id: string;
          name: string;
          price_per_unit: number;
          unit: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          name: string;
          price_per_unit?: number;
          unit?: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          name?: string;
          price_per_unit?: number;
          unit?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      order_items: {
        Row: {
          amount: number;
          category: string;
          day_date: string;
          day_product_id: string | null;
          id: string;
          order_id: string;
          product_name: string;
          quantity: number;
          size: string | null;
          unit_price: number;
          variant_id: string | null;
        };
        Insert: {
          amount: number;
          category: string;
          day_date: string;
          day_product_id?: string | null;
          id?: string;
          order_id: string;
          product_name: string;
          quantity: number;
          size?: string | null;
          unit_price: number;
          variant_id?: string | null;
        };
        Update: {
          amount?: number;
          category?: string;
          day_date?: string;
          day_product_id?: string | null;
          id?: string;
          order_id?: string;
          product_name?: string;
          quantity?: number;
          size?: string | null;
          unit_price?: number;
          variant_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "order_items_day_product_id_fkey";
            columns: ["day_product_id"];
            isOneToOne: false;
            referencedRelation: "day_products";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "order_items_day_product_id_fkey";
            columns: ["day_product_id"];
            isOneToOne: false;
            referencedRelation: "menu_view";
            referencedColumns: ["day_product_id"];
          },
          {
            foreignKeyName: "order_items_order_id_fkey";
            columns: ["order_id"];
            isOneToOne: false;
            referencedRelation: "orders";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "order_items_variant_id_fkey";
            columns: ["variant_id"];
            isOneToOne: false;
            referencedRelation: "juice_catalog_view";
            referencedColumns: ["variant_id"];
          },
          {
            foreignKeyName: "order_items_variant_id_fkey";
            columns: ["variant_id"];
            isOneToOne: false;
            referencedRelation: "product_variants";
            referencedColumns: ["id"];
          },
        ];
      };
      orders: {
        Row: {
          address: string;
          address_extra: string | null;
          created_at: string;
          deposit_required: number;
          first_name: string;
          id: string;
          instructions: string | null;
          landmark: string | null;
          last_name: string;
          order_type: string;
          paid_amount: number;
          paydunya_token: string | null;
          payment_method: string | null;
          payment_reference: string | null;
          payment_status: string;
          phone: string;
          reference: string;
          status: string;
          subscription_discount: number;
          subscription_id: string | null;
          total: number;
        };
        Insert: {
          address: string;
          address_extra?: string | null;
          created_at?: string;
          deposit_required?: number;
          first_name: string;
          id?: string;
          instructions?: string | null;
          landmark?: string | null;
          last_name: string;
          order_type?: string;
          paid_amount?: number;
          paydunya_token?: string | null;
          payment_method?: string | null;
          payment_reference?: string | null;
          payment_status?: string;
          phone: string;
          reference: string;
          status?: string;
          subscription_discount?: number;
          subscription_id?: string | null;
          total?: number;
        };
        Update: {
          address?: string;
          address_extra?: string | null;
          created_at?: string;
          deposit_required?: number;
          first_name?: string;
          id?: string;
          instructions?: string | null;
          landmark?: string | null;
          last_name?: string;
          order_type?: string;
          paid_amount?: number;
          paydunya_token?: string | null;
          payment_method?: string | null;
          payment_reference?: string | null;
          payment_status?: string;
          phone?: string;
          reference?: string;
          status?: string;
          subscription_discount?: number;
          subscription_id?: string | null;
          total?: number;
        };
        Relationships: [
          {
            foreignKeyName: "orders_subscription_id_fkey";
            columns: ["subscription_id"];
            isOneToOne: false;
            referencedRelation: "subscriptions";
            referencedColumns: ["id"];
          },
        ];
      };
      product_variants: {
        Row: {
          created_at: string;
          id: string;
          is_active: boolean;
          price: number;
          product_id: string;
          size: string;
          stock: number;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          is_active?: boolean;
          price?: number;
          product_id: string;
          size: string;
          stock?: number;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          is_active?: boolean;
          price?: number;
          product_id?: string;
          size?: string;
          stock?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "product_variants_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "juice_catalog_view";
            referencedColumns: ["product_id"];
          },
          {
            foreignKeyName: "product_variants_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "menu_view";
            referencedColumns: ["product_id"];
          },
          {
            foreignKeyName: "product_variants_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
        ];
      };
      production_log_items: {
        Row: {
          cost: number;
          created_at: string;
          format_count: number;
          format_label: string;
          id: string;
          ingredient_id: string;
          log_id: string;
          quantity: number;
        };
        Insert: {
          cost?: number;
          created_at?: string;
          format_count: number;
          format_label: string;
          id?: string;
          ingredient_id: string;
          log_id: string;
          quantity: number;
        };
        Update: {
          cost?: number;
          created_at?: string;
          format_count?: number;
          format_label?: string;
          id?: string;
          ingredient_id?: string;
          log_id?: string;
          quantity?: number;
        };
        Relationships: [
          {
            foreignKeyName: "production_log_items_ingredient_id_fkey";
            columns: ["ingredient_id"];
            isOneToOne: false;
            referencedRelation: "ingredients";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "production_log_items_log_id_fkey";
            columns: ["log_id"];
            isOneToOne: false;
            referencedRelation: "production_logs";
            referencedColumns: ["id"];
          },
        ];
      };
      production_logs: {
        Row: {
          closed_at: string | null;
          cooked_on: string;
          created_at: string;
          created_by: string | null;
          day_product_id: string | null;
          excluded: boolean;
          id: string;
          is_reference: boolean;
          notes: string | null;
          plates_obtained: number;
          plates_sold: number | null;
          product_id: string;
          revenue: number | null;
          sold_out: boolean | null;
          updated_at: string;
        };
        Insert: {
          closed_at?: string | null;
          cooked_on?: string;
          created_at?: string;
          created_by?: string | null;
          day_product_id?: string | null;
          excluded?: boolean;
          id?: string;
          is_reference?: boolean;
          notes?: string | null;
          plates_obtained: number;
          plates_sold?: number | null;
          product_id: string;
          revenue?: number | null;
          sold_out?: boolean | null;
          updated_at?: string;
        };
        Update: {
          closed_at?: string | null;
          cooked_on?: string;
          created_at?: string;
          created_by?: string | null;
          day_product_id?: string | null;
          excluded?: boolean;
          id?: string;
          is_reference?: boolean;
          notes?: string | null;
          plates_obtained?: number;
          plates_sold?: number | null;
          product_id?: string;
          revenue?: number | null;
          sold_out?: boolean | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "production_logs_day_product_id_fkey";
            columns: ["day_product_id"];
            isOneToOne: false;
            referencedRelation: "day_products";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "production_logs_day_product_id_fkey";
            columns: ["day_product_id"];
            isOneToOne: false;
            referencedRelation: "menu_view";
            referencedColumns: ["day_product_id"];
          },
          {
            foreignKeyName: "production_logs_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "juice_catalog_view";
            referencedColumns: ["product_id"];
          },
          {
            foreignKeyName: "production_logs_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "menu_view";
            referencedColumns: ["product_id"];
          },
          {
            foreignKeyName: "production_logs_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
        ];
      };
      products: {
        Row: {
          active: boolean;
          base_price: number;
          category: string;
          created_at: string;
          description: string | null;
          id: string;
          name: string;
          photo_url: string | null;
        };
        Insert: {
          active?: boolean;
          base_price?: number;
          category?: string;
          created_at?: string;
          description?: string | null;
          id?: string;
          name: string;
          photo_url?: string | null;
        };
        Update: {
          active?: boolean;
          base_price?: number;
          category?: string;
          created_at?: string;
          description?: string | null;
          id?: string;
          name?: string;
          photo_url?: string | null;
        };
        Relationships: [];
      };
      purchases: {
        Row: {
          created_at: string;
          id: string;
          ingredient_id: string | null;
          label: string;
          notes: string | null;
          purchase_date: string;
          quantity: number;
          total_cost: number;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          ingredient_id?: string | null;
          label: string;
          notes?: string | null;
          purchase_date?: string;
          quantity?: number;
          total_cost?: number;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          ingredient_id?: string | null;
          label?: string;
          notes?: string | null;
          purchase_date?: string;
          quantity?: number;
          total_cost?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "purchases_ingredient_id_fkey";
            columns: ["ingredient_id"];
            isOneToOne: false;
            referencedRelation: "ingredients";
            referencedColumns: ["id"];
          },
        ];
      };
      push_subscriptions: {
        Row: {
          auth: string;
          created_at: string;
          endpoint: string;
          id: string;
          p256dh: string;
          user_agent: string | null;
          user_id: string;
        };
        Insert: {
          auth: string;
          created_at?: string;
          endpoint: string;
          id?: string;
          p256dh: string;
          user_agent?: string | null;
          user_id: string;
        };
        Update: {
          auth?: string;
          created_at?: string;
          endpoint?: string;
          id?: string;
          p256dh?: string;
          user_agent?: string | null;
          user_id?: string;
        };
        Relationships: [];
      };
      recipes: {
        Row: {
          created_at: string;
          id: string;
          ingredient_id: string;
          product_id: string;
          quantity: number;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          ingredient_id: string;
          product_id: string;
          quantity?: number;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          ingredient_id?: string;
          product_id?: string;
          quantity?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "recipes_ingredient_id_fkey";
            columns: ["ingredient_id"];
            isOneToOne: false;
            referencedRelation: "ingredients";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "recipes_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "juice_catalog_view";
            referencedColumns: ["product_id"];
          },
          {
            foreignKeyName: "recipes_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "menu_view";
            referencedColumns: ["product_id"];
          },
          {
            foreignKeyName: "recipes_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
        ];
      };
      subscription_meals: {
        Row: {
          created_at: string;
          id: string;
          meal_date: string;
          order_id: string | null;
          status: string;
          subscription_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          meal_date: string;
          order_id?: string | null;
          status?: string;
          subscription_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          meal_date?: string;
          order_id?: string | null;
          status?: string;
          subscription_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "subscription_meals_order_id_fkey";
            columns: ["order_id"];
            isOneToOne: false;
            referencedRelation: "orders";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "subscription_meals_subscription_id_fkey";
            columns: ["subscription_id"];
            isOneToOne: false;
            referencedRelation: "subscriptions";
            referencedColumns: ["id"];
          },
        ];
      };
      subscription_payments: {
        Row: {
          amount: number;
          created_at: string;
          id: string;
          method: string;
          note: string | null;
          paydunya_token: string | null;
          status: string;
          subscription_id: string;
        };
        Insert: {
          amount: number;
          created_at?: string;
          id?: string;
          method: string;
          note?: string | null;
          paydunya_token?: string | null;
          status?: string;
          subscription_id: string;
        };
        Update: {
          amount?: number;
          created_at?: string;
          id?: string;
          method?: string;
          note?: string | null;
          paydunya_token?: string | null;
          status?: string;
          subscription_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "subscription_payments_subscription_id_fkey";
            columns: ["subscription_id"];
            isOneToOne: false;
            referencedRelation: "subscriptions";
            referencedColumns: ["id"];
          },
        ];
      };
      subscription_plans: {
        Row: {
          active: boolean;
          created_at: string;
          delivery_included: boolean;
          id: string;
          meals_count: number;
          name: string;
          price: number;
          sort_order: number;
          updated_at: string;
        };
        Insert: {
          active?: boolean;
          created_at?: string;
          delivery_included?: boolean;
          id?: string;
          meals_count: number;
          name: string;
          price?: number;
          sort_order?: number;
          updated_at?: string;
        };
        Update: {
          active?: boolean;
          created_at?: string;
          delivery_included?: boolean;
          id?: string;
          meals_count?: number;
          name?: string;
          price?: number;
          sort_order?: number;
          updated_at?: string;
        };
        Relationships: [];
      };
      subscriptions: {
        Row: {
          address: string | null;
          amount_paid: number;
          created_at: string;
          customer_name: string;
          end_date: string;
          id: string;
          meals_count: number;
          notes: string | null;
          payment_choice: string;
          payment_mode: string;
          payment_status: string;
          phone: string;
          pin: string;
          pin_failures: number;
          plan_id: string | null;
          plan_name: string;
          price: number;
          start_date: string;
          status: string;
          updated_at: string;
        };
        Insert: {
          address?: string | null;
          amount_paid?: number;
          created_at?: string;
          customer_name: string;
          end_date: string;
          id?: string;
          meals_count: number;
          notes?: string | null;
          payment_choice?: string;
          payment_mode?: string;
          payment_status?: string;
          phone: string;
          pin: string;
          pin_failures?: number;
          plan_id?: string | null;
          plan_name: string;
          price: number;
          start_date: string;
          status?: string;
          updated_at?: string;
        };
        Update: {
          address?: string | null;
          amount_paid?: number;
          created_at?: string;
          customer_name?: string;
          end_date?: string;
          id?: string;
          meals_count?: number;
          notes?: string | null;
          payment_choice?: string;
          payment_mode?: string;
          payment_status?: string;
          phone?: string;
          pin?: string;
          pin_failures?: number;
          plan_id?: string | null;
          plan_name?: string;
          price?: number;
          start_date?: string;
          status?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "subscriptions_plan_id_fkey";
            columns: ["plan_id"];
            isOneToOne: false;
            referencedRelation: "subscription_plans";
            referencedColumns: ["id"];
          },
        ];
      };
      user_roles: {
        Row: {
          created_at: string;
          id: string;
          role: Database["public"]["Enums"]["app_role"];
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          role: Database["public"]["Enums"]["app_role"];
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          role?: Database["public"]["Enums"]["app_role"];
          user_id?: string;
        };
        Relationships: [];
      };
      weeks: {
        Row: {
          created_at: string;
          end_date: string;
          id: string;
          published_at: string | null;
          start_date: string;
          status: string;
        };
        Insert: {
          created_at?: string;
          end_date: string;
          id?: string;
          published_at?: string | null;
          start_date: string;
          status?: string;
        };
        Update: {
          created_at?: string;
          end_date?: string;
          id?: string;
          published_at?: string | null;
          start_date?: string;
          status?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      juice_catalog_view: {
        Row: {
          description: string | null;
          name: string | null;
          photo_url: string | null;
          price: number | null;
          product_id: string | null;
          size: string | null;
          state: string | null;
          stock: number | null;
          variant_id: string | null;
        };
        Relationships: [];
      };
      menu_view: {
        Row: {
          category: string | null;
          close_time: string | null;
          day_date: string | null;
          day_id: string | null;
          day_open: boolean | null;
          day_product_id: string | null;
          description: string | null;
          end_date: string | null;
          is_active: boolean | null;
          name: string | null;
          open_time: string | null;
          photo_url: string | null;
          price: number | null;
          product_id: string | null;
          start_date: string | null;
          state: string | null;
          stock_initial: number | null;
          stock_left: number | null;
          stock_reserved: number | null;
          week_id: string | null;
        };
        Relationships: [];
      };
    };
    Functions: {
      admin_exists: { Args: never; Returns: boolean };
      check_subscription: {
        Args: { p_days: string[]; p_phone: string; p_pin: string };
        Returns: Json;
      };
      claim_admin: { Args: never; Returns: boolean };
      create_subscription: {
        Args: { p_customer: Json; p_plan: string; p_start: string };
        Returns: Json;
      };
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"];
          _user_id: string;
        };
        Returns: boolean;
      };
      is_admin: { Args: never; Returns: boolean };
      lookup_subscriptions: { Args: { p_phone: string }; Returns: Json };
      place_order: { Args: { p_customer: Json; p_items: Json }; Returns: Json };
      subscription_by_pin: {
        Args: { p_phone: string; p_pin: string };
        Returns: string;
      };
      subscription_dates: {
        Args: { p_count: number; p_start: string };
        Returns: string[];
      };
      subscription_estimated_end: { Args: { p_sub: string }; Returns: string };
      subscription_refusal: {
        Args: { p_day: string; p_sub: string; p_used?: number };
        Returns: string;
      };
      subscription_remaining: { Args: { p_sub: string }; Returns: number };
    };
    Enums: {
      app_role: "admin";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema["CompositeTypes"] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin"],
    },
  },
} as const;
