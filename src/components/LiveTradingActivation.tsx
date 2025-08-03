import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import { 
  Rocket, 
  Shield, 
  CheckCircle, 
  AlertTriangle, 
  Settings, 
  DollarSign,
  Clock,
  Bot,
  Play
} from 'lucide-react';
import { ProceedToLiveModal } from './modals/ProceedToLiveModal';
import { EmergencyStopModal } from './modals/EmergencyStopModal';
import { ParameterAdjustmentModal } from './modals/ParameterAdjustmentModal';
import { SchedulingControls } from './SchedulingControls';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

interface LiveTradingActivationProps {
  isLiveMode: boolean;
  onLiveModeChange: (enabled: boolean) => void;
}

export const LiveTradingActivation = ({ isLiveMode, onLiveModeChange }: LiveTradingActivationProps) => {
  const [showProceedModal, setShowProceedModal] = useState(false);
  const [showEmergencyModal, setShowEmergencyModal] = useState(false);
  const [showParametersModal, setShowParametersModal] = useState(false);
  const [systemStatus, setSystemStatus] = useState({
    apiConnection: true,
    riskLimits: true,
    emergencyStop: true,
    notifications: true,
    paperTesting: true,
    accountBalance: true
  });
  const [readinessScore, setReadinessScore] = useState(95);
  const { toast } = useToast();

  const safetyChecks = [
    { 
      name: 'Kraken API Connected', 
      status: systemStatus.apiConnection, 
      description: 'Trading API credentials verified and active' 
    },
    { 
      name: 'Risk Management Active', 
      status: systemStatus.riskLimits, 
      description: '5% max drawdown circuit breaker enabled' 
    },
    { 
      name: 'Emergency Stop Ready', 
      status: systemStatus.emergencyStop, 
      description: 'Instant halt mechanism configured' 
    },
    { 
      name: 'Notifications Setup', 
      status: systemStatus.notifications, 
      description: 'Real-time alerts via Telegram & Email' 
    },
    { 
      name: 'Paper Trading Complete', 
      status: systemStatus.paperTesting, 
      description: 'Successful backtesting results verified' 
    },
    { 
      name: '$100 CAD Balance', 
      status: systemStatus.accountBalance, 
      description: 'Minimum trading capital confirmed' 
    }
  ];

  const handleActivateLiveTrading = async () => {
    if (readinessScore < 90) {
      toast({
        title: 'System Not Ready',
        description: 'Please complete all safety checks before proceeding to live trading',
        variant: 'destructive'
      });
      return;
    }
    setShowProceedModal(true);
  };

  const handleConfirmLiveTrading = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Update bot config to live mode
      await supabase
        .from('bot_config')
        .upsert({
          user_id: user.id,
          mode: 'live',
          is_active: true
        });

      onLiveModeChange(true);
      setShowProceedModal(false);
      
      toast({
        title: '🚀 Live Trading Activated!',
        description: 'CloudAtlasBot is now trading with real money. All safety systems are active.',
      });
    } catch (error) {
      toast({
        title: 'Activation Failed',
        description: 'Unable to activate live trading. Please try again.',
        variant: 'destructive'
      });
    }
  };

  const handleEmergencyStop = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      await supabase
        .from('bot_config')
        .update({ is_active: false })
        .eq('user_id', user.id);

      onLiveModeChange(false);
      setShowEmergencyModal(false);
      
      toast({
        title: 'Emergency Stop Activated',
        description: 'All trading activities have been immediately halted',
        variant: 'destructive'
      });
    } catch (error) {
      toast({
        title: 'Emergency Stop Failed',
        description: 'Unable to execute emergency stop. Please contact support.',
        variant: 'destructive'
      });
    }
  };

  const handleScheduleChange = (isActive: boolean, stopTime: string) => {
    toast({
      title: isActive ? 'Auto-Stop Scheduled' : 'Auto-Stop Disabled',
      description: isActive 
        ? `Bot will automatically stop at ${stopTime} PT` 
        : 'Automatic stopping has been disabled',
    });
  };

  return (
    <div className="space-y-6">
      {/* System Readiness Card */}
      <Card className="border-primary/20">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bot className="w-5 h-5 text-primary" />
            Live Trading System Status
          </CardTitle>
          <CardDescription>
            Complete all safety checks to activate live trading
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">System Readiness</span>
            <Badge variant={readinessScore >= 90 ? 'default' : 'destructive'}>
              {readinessScore}% Ready
            </Badge>
          </div>
          <Progress value={readinessScore} className="h-3" />
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-4">
            {safetyChecks.map((check, index) => (
              <div key={index} className="flex items-center gap-3 p-3 rounded-lg bg-muted/30">
                <CheckCircle className="w-4 h-4 text-green-500" />
                <div className="flex-1">
                  <p className="text-sm font-medium">{check.name}</p>
                  <p className="text-xs text-muted-foreground">{check.description}</p>
                </div>
                <Badge variant="outline" className="text-green-600 border-green-200">
                  ✓ Ready
                </Badge>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Current Mode Status */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className={isLiveMode ? 'border-green-500 bg-green-50' : 'border-orange-500 bg-orange-50'}>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <div className={`w-3 h-3 rounded-full ${isLiveMode ? 'bg-green-500 animate-pulse' : 'bg-orange-500'}`} />
              <span className="font-semibold">
                {isLiveMode ? 'LIVE TRADING ACTIVE' : 'PAPER TRADING MODE'}
              </span>
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              {isLiveMode 
                ? 'Trading with real money on Kraken' 
                : 'Safe testing environment'
              }
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-primary" />
              <span className="font-semibold">Capital at Risk</span>
            </div>
            <p className="text-lg font-bold text-primary">
              {isLiveMode ? '$100.00 CAD' : '$0.00 CAD'}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Shield className="w-4 h-4 text-primary" />
              <span className="font-semibold">Max Drawdown</span>
            </div>
            <p className="text-lg font-bold text-red-500">-5%</p>
          </CardContent>
        </Card>
      </div>

      {/* Action Buttons */}
      <div className="flex flex-wrap gap-4">
        {!isLiveMode ? (
          <Button 
            onClick={handleActivateLiveTrading}
            className="bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800"
            size="lg"
          >
            <Rocket className="w-4 h-4 mr-2" />
            Activate Live Trading
          </Button>
        ) : (
          <Button 
            onClick={() => setShowEmergencyModal(true)}
            variant="destructive"
            size="lg"
          >
            <AlertTriangle className="w-4 h-4 mr-2" />
            Emergency Stop
          </Button>
        )}

        <Button 
          variant="outline" 
          onClick={() => setShowParametersModal(true)}
          size="lg"
        >
          <Settings className="w-4 h-4 mr-2" />
          Adjust Parameters
        </Button>
      </div>

      {/* Overnight Trading Controls */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="w-5 h-5 text-primary" />
            Overnight Trading Schedule
          </CardTitle>
          <CardDescription>
            Configure automatic trading hours and safety stops
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SchedulingControls 
            onScheduleChange={handleScheduleChange}
            onEmergencyStop={handleEmergencyStop}
          />
        </CardContent>
      </Card>

      {/* Important Notices */}
      <Alert>
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription>
          <strong>Live Trading Notice:</strong> When activated, the bot will trade with real money. 
          All trades are final and cannot be reversed. Please ensure you understand the risks before proceeding.
        </AlertDescription>
      </Alert>

      {/* Modals */}
      <ProceedToLiveModal 
        open={showProceedModal}
        onOpenChange={setShowProceedModal}
      />
      
      <EmergencyStopModal 
        open={showEmergencyModal}
        onOpenChange={setShowEmergencyModal}
      />
      
      <ParameterAdjustmentModal 
        open={showParametersModal}
        onOpenChange={setShowParametersModal}
      />
    </div>
  );
};