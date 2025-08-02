export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instanciate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "12.2.12 (cd3cf9e)"
  }
  public: {
    Tables: {
      bot_config: {
        Row: {
          capital_cad: number
          created_at: string
          daily_stop_loss: number
          id: string
          is_active: boolean
          max_positions: number
          mode: string
          notification_enabled: boolean
          retraining_frequency: string
          risk_per_trade: number
          symbols: string[]
          updated_at: string
          user_id: string
        }
        Insert: {
          capital_cad?: number
          created_at?: string
          daily_stop_loss?: number
          id?: string
          is_active?: boolean
          max_positions?: number
          mode?: string
          notification_enabled?: boolean
          retraining_frequency?: string
          risk_per_trade?: number
          symbols?: string[]
          updated_at?: string
          user_id: string
        }
        Update: {
          capital_cad?: number
          created_at?: string
          daily_stop_loss?: number
          id?: string
          is_active?: boolean
          max_positions?: number
          mode?: string
          notification_enabled?: boolean
          retraining_frequency?: string
          risk_per_trade?: number
          symbols?: string[]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      daily_pnl: {
        Row: {
          created_at: string
          date: string
          ending_balance: number
          id: string
          losing_trades: number
          max_drawdown: number
          realized_pnl: number
          risk_used: number
          starting_balance: number
          total_pnl: number
          total_trades: number
          unrealized_pnl: number
          user_id: string
          win_rate: number
          winning_trades: number
        }
        Insert: {
          created_at?: string
          date: string
          ending_balance: number
          id?: string
          losing_trades: number
          max_drawdown: number
          realized_pnl: number
          risk_used: number
          starting_balance: number
          total_pnl: number
          total_trades: number
          unrealized_pnl: number
          user_id: string
          win_rate: number
          winning_trades: number
        }
        Update: {
          created_at?: string
          date?: string
          ending_balance?: number
          id?: string
          losing_trades?: number
          max_drawdown?: number
          realized_pnl?: number
          risk_used?: number
          starting_balance?: number
          total_pnl?: number
          total_trades?: number
          unrealized_pnl?: number
          user_id?: string
          win_rate?: number
          winning_trades?: number
        }
        Relationships: []
      }
      executed_trades: {
        Row: {
          created_at: string
          fee: number
          id: string
          kraken_order_id: string | null
          position_id: string | null
          price: number
          quantity: number
          realized_pnl: number | null
          side: string
          symbol: string
          timestamp: string
          trade_type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          fee: number
          id?: string
          kraken_order_id?: string | null
          position_id?: string | null
          price: number
          quantity: number
          realized_pnl?: number | null
          side: string
          symbol: string
          timestamp: string
          trade_type: string
          user_id: string
        }
        Update: {
          created_at?: string
          fee?: number
          id?: string
          kraken_order_id?: string | null
          position_id?: string | null
          price?: number
          quantity?: number
          realized_pnl?: number | null
          side?: string
          symbol?: string
          timestamp?: string
          trade_type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "executed_trades_position_id_fkey"
            columns: ["position_id"]
            isOneToOne: false
            referencedRelation: "trading_positions"
            referencedColumns: ["id"]
          },
        ]
      }
      market_data: {
        Row: {
          close: number
          created_at: string
          high: number
          id: string
          low: number
          open: number
          symbol: string
          timeframe: string
          timestamp: string
          volume: number
        }
        Insert: {
          close: number
          created_at?: string
          high: number
          id?: string
          low: number
          open: number
          symbol: string
          timeframe: string
          timestamp: string
          volume: number
        }
        Update: {
          close?: number
          created_at?: string
          high?: number
          id?: string
          low?: number
          open?: number
          symbol?: string
          timeframe?: string
          timestamp?: string
          volume?: number
        }
        Relationships: []
      }
      market_regimes: {
        Row: {
          confidence: number
          created_at: string
          id: string
          regime: string
          symbol: string
          timestamp: string
          trend_strength: number
          volatility: number
        }
        Insert: {
          confidence: number
          created_at?: string
          id?: string
          regime: string
          symbol: string
          timestamp: string
          trend_strength: number
          volatility: number
        }
        Update: {
          confidence?: number
          created_at?: string
          id?: string
          regime?: string
          symbol?: string
          timestamp?: string
          trend_strength?: number
          volatility?: number
        }
        Relationships: []
      }
      ml_feature_importance: {
        Row: {
          created_at: string
          feature_name: string
          id: string
          importance_score: number
          model_version: string
        }
        Insert: {
          created_at?: string
          feature_name: string
          id?: string
          importance_score: number
          model_version: string
        }
        Update: {
          created_at?: string
          feature_name?: string
          id?: string
          importance_score?: number
          model_version?: string
        }
        Relationships: []
      }
      ml_model_performance: {
        Row: {
          accuracy: number | null
          created_at: string
          f1_score: number | null
          id: string
          model_version: string
          precision_score: number | null
          recall_score: number | null
          symbol: string
          total_trades: number | null
          updated_at: string
          winning_trades: number | null
        }
        Insert: {
          accuracy?: number | null
          created_at?: string
          f1_score?: number | null
          id?: string
          model_version: string
          precision_score?: number | null
          recall_score?: number | null
          symbol: string
          total_trades?: number | null
          updated_at?: string
          winning_trades?: number | null
        }
        Update: {
          accuracy?: number | null
          created_at?: string
          f1_score?: number | null
          id?: string
          model_version?: string
          precision_score?: number | null
          recall_score?: number | null
          symbol?: string
          total_trades?: number | null
          updated_at?: string
          winning_trades?: number | null
        }
        Relationships: []
      }
      ml_models: {
        Row: {
          accuracy: number | null
          created_at: string
          f1_score: number | null
          feature_importance: Json | null
          id: string
          is_active: boolean
          model_params: Json | null
          model_type: string
          precision_score: number | null
          recall_score: number | null
          symbol: string
          trained_at: string
          training_data_size: number | null
          version: number
        }
        Insert: {
          accuracy?: number | null
          created_at?: string
          f1_score?: number | null
          feature_importance?: Json | null
          id?: string
          is_active?: boolean
          model_params?: Json | null
          model_type: string
          precision_score?: number | null
          recall_score?: number | null
          symbol: string
          trained_at?: string
          training_data_size?: number | null
          version: number
        }
        Update: {
          accuracy?: number | null
          created_at?: string
          f1_score?: number | null
          feature_importance?: Json | null
          id?: string
          is_active?: boolean
          model_params?: Json | null
          model_type?: string
          precision_score?: number | null
          recall_score?: number | null
          symbol?: string
          trained_at?: string
          training_data_size?: number | null
          version?: number
        }
        Relationships: []
      }
      ml_trading_signals: {
        Row: {
          confidence: number
          created_at: string
          features: Json
          id: string
          position_size: number
          risk_amount: number
          signal_type: string
          symbol: string
          updated_at: string
        }
        Insert: {
          confidence: number
          created_at?: string
          features: Json
          id?: string
          position_size: number
          risk_amount: number
          signal_type: string
          symbol: string
          updated_at?: string
        }
        Update: {
          confidence?: number
          created_at?: string
          features?: Json
          id?: string
          position_size?: number
          risk_amount?: number
          signal_type?: string
          symbol?: string
          updated_at?: string
        }
        Relationships: []
      }
      notification_logs: {
        Row: {
          created_at: string
          details: Json | null
          id: string
          notification_type: string
          status: string
          user_id: string
        }
        Insert: {
          created_at?: string
          details?: Json | null
          id?: string
          notification_type: string
          status: string
          user_id: string
        }
        Update: {
          created_at?: string
          details?: Json | null
          id?: string
          notification_type?: string
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      notification_settings: {
        Row: {
          created_at: string
          daily_reports: boolean | null
          email_address: string | null
          email_enabled: boolean | null
          id: string
          performance_summary: boolean | null
          risk_alerts: boolean | null
          telegram_chat_id: string | null
          telegram_enabled: boolean | null
          trade_alerts: boolean | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          daily_reports?: boolean | null
          email_address?: string | null
          email_enabled?: boolean | null
          id?: string
          performance_summary?: boolean | null
          risk_alerts?: boolean | null
          telegram_chat_id?: string | null
          telegram_enabled?: boolean | null
          trade_alerts?: boolean | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          daily_reports?: boolean | null
          email_address?: string | null
          email_enabled?: boolean | null
          id?: string
          performance_summary?: boolean | null
          risk_alerts?: boolean | null
          telegram_chat_id?: string | null
          telegram_enabled?: boolean | null
          trade_alerts?: boolean | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      position_sizing_calculations: {
        Row: {
          calculation_method: string
          confidence_level: number
          created_at: string
          id: string
          inputs: Json
          max_size: number
          recommended_size: number
          risk_score: number
          symbol: string
          user_id: string
        }
        Insert: {
          calculation_method: string
          confidence_level?: number
          created_at?: string
          id?: string
          inputs: Json
          max_size: number
          recommended_size: number
          risk_score: number
          symbol: string
          user_id: string
        }
        Update: {
          calculation_method?: string
          confidence_level?: number
          created_at?: string
          id?: string
          inputs?: Json
          max_size?: number
          recommended_size?: number
          risk_score?: number
          symbol?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string | null
          id: string
          portfolio_settings: Json | null
          trading_preferences: Json | null
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          portfolio_settings?: Json | null
          trading_preferences?: Json | null
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          portfolio_settings?: Json | null
          trading_preferences?: Json | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      risk_events: {
        Row: {
          actions_taken: string[] | null
          created_at: string
          description: string
          event_type: string
          id: string
          resolved_at: string | null
          severity: string
          triggered_by: Json | null
          user_id: string
        }
        Insert: {
          actions_taken?: string[] | null
          created_at?: string
          description: string
          event_type: string
          id?: string
          resolved_at?: string | null
          severity: string
          triggered_by?: Json | null
          user_id: string
        }
        Update: {
          actions_taken?: string[] | null
          created_at?: string
          description?: string
          event_type?: string
          id?: string
          resolved_at?: string | null
          severity?: string
          triggered_by?: Json | null
          user_id?: string
        }
        Relationships: []
      }
      risk_limits_monitoring: {
        Row: {
          current_value: number
          id: string
          last_updated: string
          limit_type: string
          limit_value: number
          status: string
          user_id: string
          utilization_percentage: number
        }
        Insert: {
          current_value: number
          id?: string
          last_updated?: string
          limit_type: string
          limit_value: number
          status?: string
          user_id: string
          utilization_percentage: number
        }
        Update: {
          current_value?: number
          id?: string
          last_updated?: string
          limit_type?: string
          limit_value?: number
          status?: string
          user_id?: string
          utilization_percentage?: number
        }
        Relationships: []
      }
      risk_settings: {
        Row: {
          circuit_breaker_enabled: boolean
          circuit_breaker_threshold: number
          created_at: string
          id: string
          max_correlation_exposure: number
          max_daily_loss: number
          max_portfolio_risk: number
          max_position_size: number
          max_symbol_exposure: number
          position_sizing_method: string
          updated_at: string
          user_id: string
        }
        Insert: {
          circuit_breaker_enabled?: boolean
          circuit_breaker_threshold?: number
          created_at?: string
          id?: string
          max_correlation_exposure?: number
          max_daily_loss?: number
          max_portfolio_risk?: number
          max_position_size?: number
          max_symbol_exposure?: number
          position_sizing_method?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          circuit_breaker_enabled?: boolean
          circuit_breaker_threshold?: number
          created_at?: string
          id?: string
          max_correlation_exposure?: number
          max_daily_loss?: number
          max_portfolio_risk?: number
          max_position_size?: number
          max_symbol_exposure?: number
          position_sizing_method?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      strategy_signals: {
        Row: {
          confidence: number
          created_at: string
          id: string
          indicators: Json | null
          ml_score: number | null
          price: number
          signal_type: string
          strategy_type: string
          symbol: string
          timestamp: string
        }
        Insert: {
          confidence: number
          created_at?: string
          id?: string
          indicators?: Json | null
          ml_score?: number | null
          price: number
          signal_type: string
          strategy_type: string
          symbol: string
          timestamp: string
        }
        Update: {
          confidence?: number
          created_at?: string
          id?: string
          indicators?: Json | null
          ml_score?: number | null
          price?: number
          signal_type?: string
          strategy_type?: string
          symbol?: string
          timestamp?: string
        }
        Relationships: []
      }
      trading_positions: {
        Row: {
          closed_at: string | null
          created_at: string
          current_price: number | null
          entry_price: number
          id: string
          opened_at: string
          quantity: number
          risk_amount: number
          side: string
          status: string
          stop_loss: number | null
          strategy_used: string
          symbol: string
          take_profit: number | null
          unrealized_pnl: number | null
          user_id: string
        }
        Insert: {
          closed_at?: string | null
          created_at?: string
          current_price?: number | null
          entry_price: number
          id?: string
          opened_at?: string
          quantity: number
          risk_amount: number
          side: string
          status?: string
          stop_loss?: number | null
          strategy_used: string
          symbol: string
          take_profit?: number | null
          unrealized_pnl?: number | null
          user_id: string
        }
        Update: {
          closed_at?: string | null
          created_at?: string
          current_price?: number | null
          entry_price?: number
          id?: string
          opened_at?: string
          quantity?: number
          risk_amount?: number
          side?: string
          status?: string
          stop_loss?: number | null
          strategy_used?: string
          symbol?: string
          take_profit?: number | null
          unrealized_pnl?: number | null
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_notification_settings: {
        Args: { p_user_id: string }
        Returns: {
          telegram_enabled: boolean
          email_enabled: boolean
          daily_reports: boolean
          trade_alerts: boolean
          risk_alerts: boolean
          performance_summary: boolean
          email_address: string
          telegram_chat_id: string
        }[]
      }
      upsert_notification_settings: {
        Args: {
          p_user_id: string
          p_telegram_enabled?: boolean
          p_email_enabled?: boolean
          p_daily_reports?: boolean
          p_trade_alerts?: boolean
          p_risk_alerts?: boolean
          p_performance_summary?: boolean
          p_email_address?: string
          p_telegram_chat_id?: string
        }
        Returns: undefined
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
  public: {
    Enums: {},
  },
} as const
