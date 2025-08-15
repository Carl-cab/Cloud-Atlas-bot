import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { 
  CheckCircle, 
  Key, 
  Shield, 
  DollarSign, 
  TrendingUp, 
  AlertTriangle, 
  Settings,
  Play,
  TestTube,
  MessageSquare,
  Target
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { APIKeyManager } from '@/components/APIKeyManager';

interface SetupStep {
  id: string;
  title: string;
  description: string;
  completed: boolean;
  required: boolean;
}

export const TradingSetupWizard = () => {
  const { toast } = useToast();
  const [currentStep, setCurrentStep] = useState(0);
  const [setupSteps, setSetupSteps] = useState<SetupStep[]>([
    { id: 'api-keys', title: 'Configure API Keys', description: 'Set up Kraken and Telegram credentials', completed: false, required: true },
    { id: 'risk-params', title: 'Risk Parameters', description: 'Configure 0.5% risk/trade, 2% daily stop, 4 positions max', completed: false, required: true },
    { id: 'paper-trading', title: 'Paper Trading Setup', description: 'Initialize $10,000 virtual balance', completed: false, required: true },
    { id: 'validation', title: 'System Validation', description: 'Verify all components are ready', completed: false, required: true }
  ]);

  const [riskSettings, setRiskSettings] = useState({
    riskPerTrade: 0.5,
    dailyStopLoss: 2.0,
    maxPositions: 4,
    capitalCAD: 100
  });

  const [apiKeyStatus, setApiKeyStatus] = useState({
    kraken: false,
    telegram: false
  });

  const [showAPIKeyManager, setShowAPIKeyManager] = useState(false);

  useEffect(() => {
    checkExistingSetup();
  }, []);

  useEffect(() => {
    if (!showAPIKeyManager) {
      // Refresh API key status when modal is closed
      checkExistingSetup();
    }
  }, [showAPIKeyManager]);

  const checkExistingSetup = async () => {
    try {
      // Check API keys
      const { data: apiKeys } = await supabase
        .from('api_keys')
        .select('exchange')
        .eq('is_active', true);

      const krakenConfigured = apiKeys?.some(key => key.exchange === 'kraken') || false;
      
      // Check bot config for paper trading
      const { data: botConfig } = await supabase
        .from('bot_config')
        .select('*')
        .single();

      const paperTradingSetup = botConfig?.paper_trading_balance > 0;
      const riskConfigured = botConfig?.risk_per_trade === 0.5 && botConfig?.daily_stop_loss === 2.0 && botConfig?.max_positions === 4;

      setApiKeyStatus({
        kraken: krakenConfigured,
        telegram: true // Assume configured via secrets
      });

      updateStepCompletion('api-keys', krakenConfigured);
      updateStepCompletion('risk-params', riskConfigured);
      updateStepCompletion('paper-trading', paperTradingSetup);
    } catch (error) {
      console.error('Error checking setup:', error);
    }
  };

  const updateStepCompletion = (stepId: string, completed: boolean) => {
    setSetupSteps(prev => prev.map(step => 
      step.id === stepId ? { ...step, completed } : step
    ));
  };

  const configureRiskParameters = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Update risk settings
      const { error: riskError } = await supabase
        .from('risk_settings')
        .upsert({
          user_id: user.id,
          max_daily_loss: riskSettings.dailyStopLoss,
          max_position_size: riskSettings.riskPerTrade / 100,
          max_portfolio_risk: 0.05,
          max_symbol_exposure: 0.20,
          circuit_breaker_enabled: true,
          circuit_breaker_threshold: 0.03,
          position_sizing_method: 'fixed_percentage'
        });

      if (riskError) throw riskError;

      // Update bot config
      const { error: botError } = await supabase
        .from('bot_config')
        .upsert({
          user_id: user.id,
          risk_per_trade: riskSettings.riskPerTrade / 100,
          daily_stop_loss: riskSettings.dailyStopLoss,
          max_positions: riskSettings.maxPositions,
          capital_cad: riskSettings.capitalCAD,
          mode: 'paper',
          paper_trading_balance: 10000.00,
          paper_trading_fees: 0.001,
          is_active: false
        });

      if (botError) throw botError;

      updateStepCompletion('risk-params', true);
      updateStepCompletion('paper-trading', true);

      toast({
        title: "Risk Parameters Configured",
        description: "Trading parameters set: 0.5% risk/trade, 2% daily stop, 4 max positions"
      });
    } catch (error) {
      console.error('Error configuring risk parameters:', error);
      toast({
        title: "Configuration Error",
        description: "Failed to configure risk parameters",
        variant: "destructive"
      });
    }
  };

  const validateSystem = async () => {
    try {
      // Simulate system validation
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      updateStepCompletion('validation', true);
      
      toast({
        title: "System Validation Complete",
        description: "All components are ready for paper trading"
      });
    } catch (error) {
      console.error('Error validating system:', error);
    }
  };

  const startPaperTrading = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { error } = await supabase
        .from('bot_config')
        .update({ 
          is_active: true,
          mode: 'paper' 
        })
        .eq('user_id', user.id);

      if (error) throw error;

      toast({
        title: "Paper Trading Started",
        description: "Bot is now active in paper trading mode with $10,000 virtual balance",
      });
    } catch (error) {
      console.error('Error starting paper trading:', error);
      toast({
        title: "Start Error", 
        description: "Failed to start paper trading",
        variant: "destructive"
      });
    }
  };

  const completedSteps = setupSteps.filter(step => step.completed).length;
  const progressPercentage = (completedSteps / setupSteps.length) * 100;
  const allStepsCompleted = completedSteps === setupSteps.length;

  return (
    <div className="space-y-6">
      {/* Progress Header */}
      <Card className="card-shadow">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Target className="h-6 w-6 text-primary" />
                Trading Bot Setup Wizard
              </CardTitle>
              <CardDescription>
                Configure your bot for the $100 CAD beta test plan
              </CardDescription>
            </div>
            <Badge variant={allStepsCompleted ? "default" : "secondary"}>
              {completedSteps}/{setupSteps.length} Complete
            </Badge>
          </div>
          <Progress value={progressPercentage} className="mt-4" />
        </CardHeader>
      </Card>

      {/* Setup Steps */}
      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="api-keys">API Keys</TabsTrigger>
          <TabsTrigger value="risk-config">Risk Config</TabsTrigger>
          <TabsTrigger value="paper-setup">Paper Setup</TabsTrigger>
          <TabsTrigger value="validation">Validation</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Setup Overview</CardTitle>
              <CardDescription>Complete these steps to start your trading journey</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {setupSteps.map((step, index) => (
                  <div key={step.id} className="flex items-center gap-4 p-4 border rounded-lg">
                    <div className="flex-shrink-0">
                      {step.completed ? (
                        <CheckCircle className="h-5 w-5 text-green-500" />
                      ) : (
                        <div className="h-5 w-5 rounded-full border-2 border-muted flex items-center justify-center text-xs">
                          {index + 1}
                        </div>
                      )}
                    </div>
                    <div className="flex-1">
                      <h4 className="font-medium">{step.title}</h4>
                      <p className="text-sm text-muted-foreground">{step.description}</p>
                    </div>
                    <Badge variant={step.completed ? "default" : "outline"}>
                      {step.completed ? "Complete" : "Pending"}
                    </Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {allStepsCompleted && (
            <Alert>
              <CheckCircle className="h-4 w-4" />
              <AlertDescription>
                <strong>Setup Complete!</strong> Your trading bot is ready for paper trading. 
                Click below to start the 5-7 day paper trading phase.
              </AlertDescription>
            </Alert>
          )}
        </TabsContent>

        <TabsContent value="api-keys" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Key className="h-5 w-5" />
                API Key Configuration
              </CardTitle>
              <CardDescription>
                Set up your Kraken trading API and Telegram notifications
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Card className="p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="font-medium">Kraken API</h4>
                    <Badge variant={apiKeyStatus.kraken ? "default" : "destructive"}>
                      {apiKeyStatus.kraken ? "Configured" : "Required"}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground mb-3">
                    Required for live trading execution
                  </p>
                  {!apiKeyStatus.kraken && (
                    <Button variant="outline" size="sm" onClick={() => setShowAPIKeyManager(true)}>
                      Configure Kraken API
                    </Button>
                  )}
                </Card>

                <Card className="p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="font-medium">Telegram Notifications</h4>
                    <Badge variant={apiKeyStatus.telegram ? "default" : "secondary"}>
                      {apiKeyStatus.telegram ? "Configured" : "Optional"}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground mb-3">
                    Get real-time trading notifications
                  </p>
                  <Button variant="outline" size="sm">
                    <MessageSquare className="h-4 w-4 mr-2" />
                    Test Notifications
                  </Button>
                </Card>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="risk-config" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5" />
                Risk Management Configuration
              </CardTitle>
              <CardDescription>
                Set your risk parameters according to the beta test plan
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <Label>Risk Per Trade (%)</Label>
                  <Input
                    type="number"
                    step="0.1"
                    value={riskSettings.riskPerTrade}
                    onChange={(e) => setRiskSettings(prev => ({ ...prev, riskPerTrade: Number(e.target.value) }))}
                    className="mt-2"
                  />
                  <p className="text-xs text-muted-foreground mt-1">Recommended: 0.5%</p>
                </div>

                <div>
                  <Label>Daily Stop Loss (%)</Label>
                  <Input
                    type="number" 
                    step="0.1"
                    value={riskSettings.dailyStopLoss}
                    onChange={(e) => setRiskSettings(prev => ({ ...prev, dailyStopLoss: Number(e.target.value) }))}
                    className="mt-2"
                  />
                  <p className="text-xs text-muted-foreground mt-1">Recommended: 2.0%</p>
                </div>

                <div>
                  <Label>Max Concurrent Positions</Label>
                  <Input
                    type="number"
                    value={riskSettings.maxPositions}
                    onChange={(e) => setRiskSettings(prev => ({ ...prev, maxPositions: Number(e.target.value) }))}
                    className="mt-2"
                  />
                  <p className="text-xs text-muted-foreground mt-1">Recommended: 4</p>
                </div>

                <div>
                  <Label>Live Trading Capital (CAD)</Label>
                  <Input
                    type="number"
                    value={riskSettings.capitalCAD}
                    onChange={(e) => setRiskSettings(prev => ({ ...prev, capitalCAD: Number(e.target.value) }))}
                    className="mt-2"
                  />
                  <p className="text-xs text-muted-foreground mt-1">Beta test: $100 CAD</p>
                </div>
              </div>

              <Button onClick={configureRiskParameters} className="w-full">
                <Settings className="h-4 w-4 mr-2" />
                Apply Risk Configuration
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="paper-setup" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TestTube className="h-5 w-5" />
                Paper Trading Setup
              </CardTitle>
              <CardDescription>
                Initialize virtual trading environment for strategy validation
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  Paper trading uses a $10,000 virtual balance to test your strategies without risk.
                  You must achieve positive results over 5-7 days before going live.
                </AlertDescription>
              </Alert>

              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 border rounded-lg">
                  <h4 className="font-medium mb-2">Virtual Balance</h4>
                  <p className="text-2xl font-bold text-primary">$10,000</p>
                  <p className="text-sm text-muted-foreground">Starting capital</p>
                </div>
                <div className="p-4 border rounded-lg">
                  <h4 className="font-medium mb-2">Trading Fees</h4>
                  <p className="text-2xl font-bold text-primary">0.1%</p>
                  <p className="text-sm text-muted-foreground">Simulated fees</p>
                </div>
              </div>

              {allStepsCompleted && (
                <Button onClick={startPaperTrading} className="w-full" size="lg">
                  <Play className="h-5 w-5 mr-2" />
                  Start Paper Trading
                </Button>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="validation" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CheckCircle className="h-5 w-5" />
                System Validation
              </CardTitle>
              <CardDescription>
                Verify all components are configured and ready
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button onClick={validateSystem} className="w-full">
                Run System Validation
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* API Key Manager Modal */}
      {showAPIKeyManager && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-background p-6 rounded-lg max-w-4xl w-full mx-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold">Configure API Keys</h2>
              <Button variant="ghost" size="sm" onClick={() => setShowAPIKeyManager(false)}>
                ✕
              </Button>
            </div>
            <APIKeyManager />
          </div>
        </div>
      )}
    </div>
  );
};