import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { 
  Brain, 
  Activity, 
  Target, 
  Shield, 
  Zap, 
  TrendingUp,
  Clock,
  Bot,
  AlertTriangle,
  CheckCircle
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface AutonomousSettings {
  enabled: boolean;
  aggressiveness: number; // 0-100
  riskTolerance: number; // 0-100 
  tradingHours: {
    start: string;
    end: string;
  };
  maxPositionsPerDay: number;
  stopLossPercent: number;
  takeProfitPercent: number;
  marketRegimeAdaptation: boolean;
  emergencyStopEnabled: boolean;
  maxDrawdownPercent: number;
}

interface AgentState {
  isRunning: boolean;
  lastDecision: string;
  lastAction: string;
  performanceToday: {
    trades: number;
    winRate: number;
    pnl: number;
  };
  currentTask: string;
  nextRebalance: string;
}

export const AutonomousAgent = () => {
  const { toast } = useToast();
  const [settings, setSettings] = useState<AutonomousSettings>({
    enabled: false,
    aggressiveness: 50,
    riskTolerance: 30,
    tradingHours: {
      start: '09:30',
      end: '16:00'
    },
    maxPositionsPerDay: 5,
    stopLossPercent: 2.0,
    takeProfitPercent: 3.0,
    marketRegimeAdaptation: true,
    emergencyStopEnabled: true,
    maxDrawdownPercent: 5.0
  });

  const [agentState, setAgentState] = useState<AgentState>({
    isRunning: false,
    lastDecision: 'Analyzing market conditions...',
    lastAction: 'Initialized',
    performanceToday: {
      trades: 0,
      winRate: 0,
      pnl: 0
    },
    currentTask: 'Idle',
    nextRebalance: '15:30'
  });

  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (settings.enabled) {
      const interval = setInterval(() => {
        executeAutonomousCycle();
      }, 30000); // Run every 30 seconds

      return () => clearInterval(interval);
    }
  }, [settings.enabled]);

  const executeAutonomousCycle = async () => {
    try {
      const user = await supabase.auth.getUser();
      if (!user.data.user) return;

      // 1. Market Analysis
      setAgentState(prev => ({ ...prev, currentTask: 'Analyzing markets' }));
      const marketAnalysis = await supabase.functions.invoke('autonomous-agent', {
        body: {
          action: 'analyze_markets',
          user_id: user.data.user.id,
          settings
        }
      });

      // 2. Risk Assessment
      setAgentState(prev => ({ ...prev, currentTask: 'Assessing risk' }));
      const riskAssessment = await supabase.functions.invoke('autonomous-agent', {
        body: {
          action: 'assess_risk',
          user_id: user.data.user.id,
          settings
        }
      });

      // 3. Decision Making
      setAgentState(prev => ({ ...prev, currentTask: 'Making decisions' }));
      const decision = await supabase.functions.invoke('autonomous-agent', {
        body: {
          action: 'make_decision',
          user_id: user.data.user.id,
          market_analysis: marketAnalysis.data,
          risk_assessment: riskAssessment.data,
          settings
        }
      });

      // 4. Execute Actions
      if (decision.data?.action && decision.data.action !== 'hold') {
        setAgentState(prev => ({ ...prev, currentTask: 'Executing trades' }));
        await supabase.functions.invoke('autonomous-agent', {
          body: {
            action: 'execute_action',
            user_id: user.data.user.id,
            decision: decision.data,
            settings
          }
        });
      }

      // Update agent state
      setAgentState(prev => ({
        ...prev,
        lastDecision: decision.data?.reasoning || 'Market analysis complete',
        lastAction: decision.data?.action || 'hold',
        currentTask: 'Monitoring'
      }));

    } catch (error) {
      console.error('Autonomous cycle error:', error);
      setAgentState(prev => ({
        ...prev,
        currentTask: 'Error - Check logs',
        lastDecision: 'System error occurred'
      }));
    }
  };

  const handleToggleAgent = async () => {
    setIsLoading(true);
    try {
      const newEnabled = !settings.enabled;
      setSettings(prev => ({ ...prev, enabled: newEnabled }));
      
      if (newEnabled) {
        // Initialize agent
        await supabase.functions.invoke('autonomous-agent', {
          body: {
            action: 'initialize',
            settings: { ...settings, enabled: newEnabled }
          }
        });

        setAgentState(prev => ({
          ...prev,
          isRunning: true,
          currentTask: 'Initializing...'
        }));

        toast({
          title: "Autonomous Agent Activated",
          description: "AI agent is now making independent trading decisions"
        });
      } else {
        setAgentState(prev => ({
          ...prev,
          isRunning: false,
          currentTask: 'Stopped'
        }));

        toast({
          title: "Autonomous Agent Stopped",
          description: "Manual control restored",
          variant: "destructive"
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to toggle autonomous agent",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const updateSetting = (key: keyof AutonomousSettings, value: any) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  };

  return (
    <div className="space-y-6">
      {/* Agent Status */}
      <Card className="border-primary/20">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bot className="h-5 w-5 text-primary" />
            Autonomous Trading Agent
            <Badge variant={settings.enabled ? "default" : "secondary"}>
              {settings.enabled ? "ACTIVE" : "INACTIVE"}
            </Badge>
          </CardTitle>
          <CardDescription>
            AI agent that makes independent trading decisions 24/7
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-sm font-medium">Current Task</Label>
              <div className="flex items-center gap-2">
                <Activity className="h-4 w-4 text-primary animate-pulse" />
                <span className="text-sm">{agentState.currentTask}</span>
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-medium">Last Decision</Label>
              <p className="text-sm text-muted-foreground">{agentState.lastDecision}</p>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-primary">
                {agentState.performanceToday.trades}
              </div>
              <div className="text-xs text-muted-foreground">Trades Today</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-success">
                {agentState.performanceToday.winRate.toFixed(1)}%
              </div>
              <div className="text-xs text-muted-foreground">Win Rate</div>
            </div>
            <div className="text-center">
              <div className={`text-2xl font-bold ${agentState.performanceToday.pnl >= 0 ? 'text-success' : 'text-danger'}`}>
                ${agentState.performanceToday.pnl.toFixed(2)}
              </div>
              <div className="text-xs text-muted-foreground">P&L Today</div>
            </div>
          </div>

          <div className="flex items-center justify-between pt-4 border-t">
            <div>
              <Label htmlFor="agent-toggle">Enable Autonomous Trading</Label>
              <p className="text-sm text-muted-foreground">
                Agent will make trading decisions independently
              </p>
            </div>
            <Switch
              id="agent-toggle"
              checked={settings.enabled}
              onCheckedChange={handleToggleAgent}
              disabled={isLoading}
            />
          </div>
        </CardContent>
      </Card>

      {/* Agent Configuration */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Brain className="h-5 w-5" />
            Agent Configuration
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Trading Aggressiveness */}
          <div className="space-y-2">
            <Label>Trading Aggressiveness</Label>
            <div className="flex items-center space-x-4">
              <span className="text-sm text-muted-foreground">Conservative</span>
              <Slider
                value={[settings.aggressiveness]}
                onValueChange={(value) => updateSetting('aggressiveness', value[0])}
                max={100}
                min={0}
                step={5}
                className="flex-1"
              />
              <span className="text-sm text-muted-foreground">Aggressive</span>
              <span className="text-sm font-medium w-12">{settings.aggressiveness}%</span>
            </div>
          </div>

          {/* Risk Tolerance */}
          <div className="space-y-2">
            <Label>Risk Tolerance</Label>
            <div className="flex items-center space-x-4">
              <Shield className="h-4 w-4 text-muted-foreground" />
              <Slider
                value={[settings.riskTolerance]}
                onValueChange={(value) => updateSetting('riskTolerance', value[0])}
                max={100}
                min={10}
                step={5}
                className="flex-1"
              />
              <span className="text-sm font-medium w-12">{settings.riskTolerance}%</span>
            </div>
          </div>

          {/* Trading Hours */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Trading Start Time</Label>
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <input
                  type="time"
                  value={settings.tradingHours.start}
                  onChange={(e) => updateSetting('tradingHours', {
                    ...settings.tradingHours,
                    start: e.target.value
                  })}
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Trading End Time</Label>
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <input
                  type="time"
                  value={settings.tradingHours.end}
                  onChange={(e) => updateSetting('tradingHours', {
                    ...settings.tradingHours,
                    end: e.target.value
                  })}
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
                />
              </div>
            </div>
          </div>

          {/* Advanced Settings */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Max Positions Per Day</Label>
              <Select 
                value={settings.maxPositionsPerDay.toString()} 
                onValueChange={(value) => updateSetting('maxPositionsPerDay', parseInt(value))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="3">3 positions</SelectItem>
                  <SelectItem value="5">5 positions</SelectItem>
                  <SelectItem value="8">8 positions</SelectItem>
                  <SelectItem value="10">10 positions</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Max Drawdown (%)</Label>
              <Select 
                value={settings.maxDrawdownPercent.toString()} 
                onValueChange={(value) => updateSetting('maxDrawdownPercent', parseFloat(value))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="2.0">2%</SelectItem>
                  <SelectItem value="3.0">3%</SelectItem>
                  <SelectItem value="5.0">5%</SelectItem>
                  <SelectItem value="7.0">7%</SelectItem>
                  <SelectItem value="10.0">10%</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Feature Toggles */}
          <div className="space-y-4 pt-4 border-t">
            <div className="flex items-center justify-between">
              <div>
                <Label>Market Regime Adaptation</Label>
                <p className="text-sm text-muted-foreground">
                  Automatically adjust strategy based on market conditions
                </p>
              </div>
              <Switch
                checked={settings.marketRegimeAdaptation}
                onCheckedChange={(checked) => updateSetting('marketRegimeAdaptation', checked)}
              />
            </div>

            <div className="flex items-center justify-between">
              <div>
                <Label>Emergency Stop Protection</Label>
                <p className="text-sm text-muted-foreground">
                  Automatically stop trading on excessive losses
                </p>
              </div>
              <Switch
                checked={settings.emergencyStopEnabled}
                onCheckedChange={(checked) => updateSetting('emergencyStopEnabled', checked)}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Decision Matrix */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Target className="h-5 w-5" />
            Decision Matrix
          </CardTitle>
          <CardDescription>
            Real-time insights into agent decision-making process
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 rounded-lg border">
              <div className="flex items-center gap-2 mb-2">
                <TrendingUp className="h-4 w-4 text-green-500" />
                <span className="text-sm font-medium">Market Sentiment</span>
              </div>
              <Progress value={75} className="h-2" />
              <p className="text-xs text-muted-foreground mt-1">Bullish (75%)</p>
            </div>
            
            <div className="p-4 rounded-lg border">
              <div className="flex items-center gap-2 mb-2">
                <Shield className="h-4 w-4 text-yellow-500" />
                <span className="text-sm font-medium">Risk Level</span>
              </div>
              <Progress value={45} className="h-2" />
              <p className="text-xs text-muted-foreground mt-1">Moderate (45%)</p>
            </div>
            
            <div className="p-4 rounded-lg border">
              <div className="flex items-center gap-2 mb-2">
                <Zap className="h-4 w-4 text-blue-500" />
                <span className="text-sm font-medium">Execution Speed</span>
              </div>
              <Progress value={90} className="h-2" />
              <p className="text-xs text-muted-foreground mt-1">Fast (90%)</p>
            </div>
          </div>

          <div className="mt-4 p-4 rounded-lg bg-muted/50">
            <h4 className="text-sm font-medium mb-2">Next Scheduled Actions</h4>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span>Portfolio Rebalance</span>
                <span className="text-muted-foreground">{agentState.nextRebalance}</span>
              </div>
              <div className="flex justify-between">
                <span>Model Retrain</span>
                <span className="text-muted-foreground">Daily at 02:00</span>
              </div>
              <div className="flex justify-between">
                <span>Risk Review</span>
                <span className="text-muted-foreground">Every 4 hours</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};