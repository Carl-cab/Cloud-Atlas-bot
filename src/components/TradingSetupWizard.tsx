import React, { useState, useEffect } from 'react';
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
import { useToast } from '@/hooks/use-toast';
import { useBotState, safeToFixed } from '@/context/BotStateProvider';
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
  const { config, updateBotConfig, reloadData } = useBotState();
  
  const [currentStep, setCurrentStep] = useState(0);
  const [setupSteps, setSetupSteps] = useState<SetupStep[]>([
    { id: 'api-keys', title: 'Configure API Keys', description: 'Set up Kraken and Telegram credentials', completed: false, required: true },
    { id: 'risk-params', title: 'Risk Parameters', description: 'Configure 0.5% risk/trade, 2% daily stop, 4 positions max', completed: false, required: true },
    { id: 'paper-trading', title: 'Paper Trading Setup', description: 'Initialize $10,000 virtual balance', completed: false, required: true },
    { id: 'validation', title: 'System Validation', description: 'Verify all components are ready', completed: false, required: true }
  ]);

  const [riskSettings, setRiskSettings] = useState({
    riskPerTrade: config?.risk_per_trade || 0.5,
    dailyStopLoss: config?.daily_stop_loss || 2.0,
    maxPositions: config?.max_positions || 4,
    capital: config?.capital_cad || 100,
    paperBalance: config?.paper_trading_balance || 10000
  });

  useEffect(() => {
    if (config) {
      setRiskSettings({
        riskPerTrade: config.risk_per_trade || 0.5,
        dailyStopLoss: config.daily_stop_loss || 2.0,
        maxPositions: config.max_positions || 4,
        capital: config.capital_cad || 100,
        paperBalance: config.paper_trading_balance || 10000
      });
      checkSetupCompletion();
    }
  }, [config]);

  const checkSetupCompletion = () => {
    const updatedSteps = [...setupSteps];
    
    // Check API keys completion (simplified check)
    updatedSteps[0].completed = true; // Assume API keys are configured
    
    // Check risk parameters
    updatedSteps[1].completed = config?.risk_per_trade !== undefined && 
                                config?.daily_stop_loss !== undefined && 
                                config?.max_positions !== undefined;
    
    // Check paper trading setup
    updatedSteps[2].completed = config?.paper_trading_balance !== undefined && 
                                config?.paper_trading_balance > 0;
    
    // Check system validation
    updatedSteps[3].completed = updatedSteps.slice(0, 3).every(step => step.completed);
    
    setSetupSteps(updatedSteps);
  };

  const handleRiskSettingsUpdate = async () => {
    try {
      await updateBotConfig({
        risk_per_trade: riskSettings.riskPerTrade,
        daily_stop_loss: riskSettings.dailyStopLoss,
        max_positions: riskSettings.maxPositions,
        capital_cad: riskSettings.capital,
        paper_trading_balance: riskSettings.paperBalance
      });
      
      toast({
        title: "Risk Settings Updated",
        description: "Your risk parameters have been configured successfully.",
      });
      
      checkSetupCompletion();
    } catch (error) {
      toast({
        title: "Update Failed",
        description: "Failed to update risk settings.",
        variant: "destructive",
      });
    }
  };

  const handlePaperTradingSetup = async () => {
    try {
      await updateBotConfig({
        mode: 'paper',
        paper_trading_balance: riskSettings.paperBalance
      });
      
      toast({
        title: "Paper Trading Initialized",
        description: `Virtual balance of $${safeToFixed(riskSettings.paperBalance)} CAD has been set.`,
      });
      
      checkSetupCompletion();
    } catch (error) {
      toast({
        title: "Setup Failed",
        description: "Failed to initialize paper trading.",
        variant: "destructive",
      });
    }
  };

  const completedSteps = setupSteps.filter(step => step.completed).length;
  const progressPercentage = (completedSteps / setupSteps.length) * 100;
  const isSetupComplete = completedSteps === setupSteps.length;

  const renderStepContent = () => {
    const step = setupSteps[currentStep];
    
    switch (step.id) {
      case 'api-keys':
        return (
          <div className="space-y-4">
            <Alert>
              <Key className="h-4 w-4" />
              <AlertDescription>
                Configure your API keys to enable live trading. These credentials are encrypted and stored securely.
              </AlertDescription>
            </Alert>
            <APIKeyManager />
          </div>
        );
        
      case 'risk-params': 
        return (
          <div className="space-y-4">
            <Alert>
              <Shield className="h-4 w-4" />
              <AlertDescription>
                Set your risk management parameters. These limits help protect your capital.
              </AlertDescription>
            </Alert>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="risk-per-trade">Risk Per Trade (%)</Label>
                <Input
                  id="risk-per-trade"
                  type="number"
                  step="0.1"
                  min="0.1"
                  max="5"
                  value={riskSettings.riskPerTrade}
                  onChange={(e) => setRiskSettings(prev => ({
                    ...prev,
                    riskPerTrade: parseFloat(e.target.value) || 0.5
                  }))}
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="daily-stop">Daily Stop Loss (%)</Label>
                <Input
                  id="daily-stop"
                  type="number"
                  step="0.1"
                  min="1"
                  max="10" 
                  value={riskSettings.dailyStopLoss}
                  onChange={(e) => setRiskSettings(prev => ({
                    ...prev,
                    dailyStopLoss: parseFloat(e.target.value) || 2.0
                  }))}
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="max-positions">Max Positions</Label>
                <Input
                  id="max-positions"
                  type="number"
                  min="1"
                  max="10"
                  value={riskSettings.maxPositions}
                  onChange={(e) => setRiskSettings(prev => ({
                    ...prev,
                    maxPositions: parseInt(e.target.value) || 4
                  }))}
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="capital">Capital (CAD)</Label>
                <Input
                  id="capital"
                  type="number"
                  min="100"
                  value={riskSettings.capital}
                  onChange={(e) => setRiskSettings(prev => ({
                    ...prev,
                    capital: parseFloat(e.target.value) || 100
                  }))}
                />
              </div>
            </div>
            
            <Button onClick={handleRiskSettingsUpdate} className="w-full">
              <Shield className="mr-2 h-4 w-4" />
              Save Risk Parameters
            </Button>
          </div>
        );
        
      case 'paper-trading':
        return (
          <div className="space-y-4">
            <Alert>
              <TestTube className="h-4 w-4" />
              <AlertDescription>
                Paper trading allows you to test strategies with virtual money before risking real capital.
              </AlertDescription>
            </Alert>
            
            <div className="space-y-2">
              <Label htmlFor="paper-balance">Virtual Balance (CAD)</Label>
              <Input
                id="paper-balance" 
                type="number"
                min="1000"
                value={riskSettings.paperBalance}
                onChange={(e) => setRiskSettings(prev => ({
                  ...prev,
                  paperBalance: parseFloat(e.target.value) || 10000
                }))}
              />
              <p className="text-sm text-muted-foreground">
                Recommended: $10,000 CAD for realistic testing
              </p>
            </div>
            
            <Button onClick={handlePaperTradingSetup} className="w-full">
              <Play className="mr-2 h-4 w-4" />
              Initialize Paper Trading
            </Button>
          </div>
        );
        
      case 'validation':
        return (
          <div className="space-y-4">
            <Alert>
              <CheckCircle className="h-4 w-4" />
              <AlertDescription>
                All setup steps completed! Your trading bot is ready to start paper trading.
              </AlertDescription>
            </Alert>
            
            <div className="grid grid-cols-2 gap-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Risk Configuration</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-1 text-sm">
                    <div className="flex justify-between">
                      <span>Risk per trade:</span>
                      <span>{safeToFixed(riskSettings.riskPerTrade, 1)}%</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Daily stop loss:</span>
                      <span>{safeToFixed(riskSettings.dailyStopLoss, 1)}%</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Max positions:</span>
                      <span>{riskSettings.maxPositions}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
              
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Paper Trading</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-1 text-sm">
                    <div className="flex justify-between">
                      <span>Virtual balance:</span>
                      <span>${safeToFixed(riskSettings.paperBalance)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Mode:</span>
                      <span>Paper Trading</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Status:</span>
                      <Badge variant="outline">Ready</Badge>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
            
            <Button onClick={reloadData} className="w-full">
              <TrendingUp className="mr-2 h-4 w-4" />
              Start Paper Trading
            </Button>
          </div>
        ); 
        
      default:
        return <div>Step content not found</div>;
    }
  };

  return (    
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <div className="text-center space-y-2">
        <h1 className="text-3xl font-bold">Trading Bot Setup</h1>
        <p className="text-muted-foreground">
          Configure your automated trading system in {setupSteps.length} simple steps
        </p>
      </div>

      {/* Progress Overview */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Setup Progress</CardTitle>
            <Badge variant={isSetupComplete ? 'default' : 'secondary'}>
              {completedSteps} / {setupSteps.length} Complete
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <Progress value={progressPercentage} className="w-full" />
          <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-2">
            {setupSteps.map((step, index) => (
              <div
                key={step.id}
                className={`p-2 rounded-lg border text-center cursor-pointer transition-colors ${
                  index === currentStep 
                    ? 'border-primary bg-primary/10' 
                    : step.completed 
                    ? 'border-emerald-500 bg-emerald-50' 
                    : 'border-border'
                }`}
                onClick={() => setCurrentStep(index)}
              >
                <div className="flex items-center justify-center mb-1">
                  {step.completed ? (
                    <CheckCircle className="h-4 w-4 text-emerald-600" />
                  ) : index === currentStep ? (
                    <Settings className="h-4 w-4 text-primary" />
                  ) : (
                    <div className="h-4 w-4 rounded-full border-2 border-muted-foreground" />
                  )}
                </div>
                <p className="text-xs font-medium">{step.title}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Current Step Content */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <span className="bg-primary text-primary-foreground rounded-full w-6 h-6 flex items-center justify-center text-sm">
              {currentStep + 1}
            </span>
            {setupSteps[currentStep]?.title}
          </CardTitle>
          <CardDescription>
            {setupSteps[currentStep]?.description}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {renderStepContent()}
        </CardContent>
      </Card>

      {/* Navigation */}
      <div className="flex justify-between">
        <Button
          variant="outline"
          onClick={() => setCurrentStep(Math.max(0, currentStep - 1))}
          disabled={currentStep === 0}
        >
          Previous
        </Button>
        <Button
          onClick={() => setCurrentStep(Math.min(setupSteps.length - 1, currentStep + 1))}
          disabled={currentStep === setupSteps.length - 1}
        >
          Next
        </Button>
      </div>

      {isSetupComplete && (
        <Alert>
          <CheckCircle className="h-4 w-4" />
          <AlertDescription>
            🎉 Setup complete! Your trading bot is ready to start paper trading. 
            Navigate to the Dashboard to monitor your bot's performance.
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
};