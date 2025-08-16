import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface BotStatus {
  isActive: boolean;
  mode: 'paper' | 'live';
  balance: number;
  totalPnL: number;
  dailyPnL: number;
  winRate: number;
  activeTrades: number;
  riskUsed: number;
  maxPositions: number;
  riskPerTrade: number;
  dailyStopLoss: number;
}

export interface MarketRegime {
  regime: 'trend' | 'range' | 'high_volatility';
  confidence: number;
  trend_strength: number;
  volatility: number;
}

export interface TradingSignal {
  symbol: string;
  signal_type: 'buy' | 'sell' | 'hold';
  confidence: number;
  price: number;
  strategy_type: 'trend_following' | 'mean_reversion';
  ml_score: number;
  timestamp: string;
}

export interface TradingPosition {
  id: string;
  symbol: string;
  side: string;
  quantity: number;
  entry_price: number;
  current_price: number;
  unrealized_pnl: number;
  status: string;
}

export interface BotConfig {
  id: string;
  user_id: string;
  is_active: boolean;
  mode: string;
  risk_per_trade: number;
  daily_stop_loss: number;
  max_positions: number;
  capital_cad: number;
  paper_trading_balance: number;
}

interface BotStateContextType {
  botStatus: BotStatus;
  currentRegime: MarketRegime | null;
  latestSignal: TradingSignal | null;
  positions: TradingPosition[];
  config: BotConfig | null;
  isLoading: boolean;
  isAnalyzing: boolean;
  isTraining: boolean;
  updateBotConfig: (updates: Partial<BotConfig>) => Promise<void>;
  toggleBot: () => Promise<void>;
  reloadData: () => Promise<void>;
  setIsAnalyzing: (analyzing: boolean) => void;
  setIsTraining: (training: boolean) => void;
}

const BotStateContext = createContext<BotStateContextType | undefined>(undefined);

export const useBotState = () => {
  const context = useContext(BotStateContext);
  if (!context) {
    throw new Error('useBotState must be used within a BotStateProvider');
  }
  return context;
};

// Safe number formatting utility
export const safeToFixed = (value: number | null | undefined, decimals: number = 2): string => {
  if (value === null || value === undefined || isNaN(value)) {
    return '0.00';
  }
  return value.toFixed(decimals);
};

interface BotStateProviderProps {
  children: ReactNode;
}

export const BotStateProvider: React.FC<BotStateProviderProps> = ({ children }) => {
  const [botStatus, setBotStatus] = useState<BotStatus>({
    isActive: false,
    mode: 'paper',
    balance: 10000,
    totalPnL: 0,
    dailyPnL: 0,
    winRate: 0,
    activeTrades: 0,
    riskUsed: 0,
    maxPositions: 4,
    riskPerTrade: 0.5,
    dailyStopLoss: 2.0,
  });
  
  const [currentRegime, setCurrentRegime] = useState<MarketRegime | null>(null);
  const [latestSignal, setLatestSignal] = useState<TradingSignal | null>(null);
  const [positions, setPositions] = useState<TradingPosition[]>([]);
  const [config, setConfig] = useState<BotConfig | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isTraining, setIsTraining] = useState(false);
  
  // Use a try-catch around useToast to handle potential issues
  let toastFn;
  try {
    const { toast } = useToast();
    toastFn = toast;
  } catch (error) {
    console.warn('Toast hook not available in BotStateProvider:', error);
    toastFn = () => {}; // Fallback no-op function
  }

  const loadBotData = async () => {
    try {
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError || !user) {
        console.log('No authenticated user, skipping data load');
        setIsLoading(false);
        return;
      }

      // Load bot config with safe pattern
      const { data: configData, error: configError } = await supabase
        .from('bot_config')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (configError) {
        console.error('Error loading bot config:', configError);
      } else if (configData) {
        setConfig(configData);
        setBotStatus(prev => ({
          ...prev,
          isActive: configData.is_active || false,
          mode: (configData.mode as 'paper' | 'live') || 'paper',
          balance: configData.mode === 'paper' 
            ? (configData.paper_trading_balance || 10000)
            : (configData.capital_cad || 100),
          maxPositions: configData.max_positions || 4,
          riskPerTrade: configData.risk_per_trade || 0.5,
          dailyStopLoss: configData.daily_stop_loss || 2.0,
        }));
      }

      // Load daily P&L with safe pattern
      const { data: dailyPnlData } = await supabase
        .from('daily_pnl')
        .select('*')
        .eq('user_id', user.id)
        .eq('date', new Date().toISOString().split('T')[0])
        .maybeSingle();

      if (dailyPnlData) {
        const winRate = dailyPnlData.total_trades > 0 
          ? (dailyPnlData.winning_trades / dailyPnlData.total_trades) * 100 
          : 0;
        
        setBotStatus(prev => ({
          ...prev,
          totalPnL: dailyPnlData.total_pnl || 0,
          dailyPnL: dailyPnlData.realized_pnl || 0,
          winRate,
          riskUsed: dailyPnlData.risk_used || 0,
        }));
      }

      // Load active positions
      const { data: positionsData } = await supabase
        .from('trading_positions')
        .select('*')
        .eq('user_id', user.id)
        .eq('status', 'open');

      if (positionsData) {
        setPositions(positionsData);
        setBotStatus(prev => ({
          ...prev,
          activeTrades: positionsData.length,
        }));
      }

      // Load latest market regime
      const { data: regimeData } = await supabase
        .from('market_regimes')
        .select('*')
        .order('timestamp', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (regimeData) {
        setCurrentRegime({
          regime: regimeData.regime as 'trend' | 'range' | 'high_volatility',
          confidence: regimeData.confidence || 0,
          trend_strength: regimeData.trend_strength || 0,
          volatility: regimeData.volatility || 0,
        });
      }

      // Load latest signal
      const { data: signalData } = await supabase
        .from('strategy_signals')
        .select('*')
        .order('timestamp', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (signalData) {
        setLatestSignal({
          symbol: signalData.symbol,
          signal_type: signalData.signal_type as 'buy' | 'sell' | 'hold',
          confidence: signalData.confidence || 0,
          price: signalData.price || 0,
          strategy_type: signalData.strategy_type as 'trend_following' | 'mean_reversion',
          ml_score: signalData.ml_score || 0,
          timestamp: signalData.timestamp,
        });
      }

    } catch (error) {
      console.error('Error loading bot data:', error);
      if (toastFn) {
        toastFn({
          title: "Error Loading Data",
          description: "Failed to load bot data. Please refresh the page.",
          variant: "destructive",
        });
      }
    } finally {
      setIsLoading(false);
    }
  };

  const updateBotConfig = async (updates: Partial<BotConfig>) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || !config) return;

      const { error } = await supabase
        .from('bot_config')
        .update(updates)
        .eq('id', config.id);

      if (error) throw error;

      setConfig(prev => prev ? { ...prev, ...updates } : null);
      
      if (toastFn) {
        toastFn({
          title: "Settings Updated",
          description: "Bot configuration has been updated successfully.",
        });
      }
    } catch (error) {
      console.error('Error updating bot config:', error);
      if (toastFn) {
        toastFn({
          title: "Update Failed",
          description: "Failed to update bot configuration.",
          variant: "destructive",
        });
      }
    }
  };

  const toggleBot = async () => {
    if (!config) return;
    
    const newActiveState = !config.is_active;
    await updateBotConfig({ is_active: newActiveState });
  };

  const reloadData = () => loadBotData();

  useEffect(() => {
    // Delay the initial load to ensure all providers are ready
    const timer = setTimeout(() => {
      loadBotData();
    }, 100);
    
    // Set up real-time subscriptions
    const channel = supabase
      .channel('bot-state-updates')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'bot_config'
      }, () => loadBotData())
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'trading_positions'
      }, () => loadBotData())
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'daily_pnl'
      }, () => loadBotData())
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'market_regimes'
      }, () => loadBotData())
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'strategy_signals'
      }, () => loadBotData())
      .subscribe();

    // Periodic data refresh
    const interval = setInterval(loadBotData, 30000);
    
    return () => {
      clearTimeout(timer);
      clearInterval(interval);
      supabase.removeChannel(channel);
    };
  }, []);

  const value: BotStateContextType = {
    botStatus,
    currentRegime,
    latestSignal,
    positions,
    config,
    isLoading,
    isAnalyzing,
    isTraining,
    updateBotConfig,
    toggleBot,
    reloadData,
    setIsAnalyzing,
    setIsTraining,
  };

  return (
    <BotStateContext.Provider value={value}>
      {children}
    </BotStateContext.Provider>
  );
};