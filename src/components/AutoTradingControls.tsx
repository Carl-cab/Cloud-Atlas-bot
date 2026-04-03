import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Slider } from '@/components/ui/slider';
import { Badge } from '@/components/ui/badge';
import { 
  Bot, 
  Settings, 
  DollarSign, 
  Percent, 
  Clock, 
  Shield,
  TrendingUp,
  AlertTriangle,
  Target,
  Activity
} from 'lucide-react';
import { useBotState, safeToFixed } from '@/context/BotStateProvider';

interface AutoTradingControlsProps {
  botActive: boolean;
  onToggle: () => void;
  platform: string;
}

export const AutoTradingControls = ({ botActive, onToggle, platform }: AutoTradingControlsProps) => {
  const { botStatus, config, updateBotConfig } = useBotState();

  const handleSettingUpdate = async (field: string, value: any) => {
    if (!config) return;
    
    const updates: any = {};
    updates[field] = value;
    await updateBotConfig(updates);
  };

  const activeStrategies = [
    { name: 'Momentum Trading', status: 'active', profit: '+5.2%' },
    { name: 'Mean Reversion', status: 'paused', profit: '+2.1%' },
    { name: 'Grid Trading', status: 'active', profit: '+3.8%' }
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bot className="h-5 w-5" />
          Auto Trading Controls
        </CardTitle>
        <CardDescription>
          Configure trading parameters and manage strategies on {platform}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="basic" className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="basic">Basic</TabsTrigger>
            <TabsTrigger value="strategies">Strategies</TabsTrigger>
            <TabsTrigger value="risk">Risk</TabsTrigger>
            <TabsTrigger value="advanced">Advanced</TabsTrigger>
          </TabsList>

          <TabsContent value="basic" className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="max-investment">Max Investment (CAD)</Label>
                <div className="flex items-center space-x-2">
                  <DollarSign className="h-4 w-4 text-muted-foreground" />
                  <Input
                    id="max-investment"
                    type="number"
                    value={config?.capital_cad || 100}
                    onChange={(e) => handleSettingUpdate('capital_cad', Number(e.target.value))}
                    className="flex-1"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="risk-level">Risk Per Trade (%)</Label>
                <div className="flex items-center space-x-2">
                  <Percent className="h-4 w-4 text-muted-foreground" />
                  <div className="flex-1">
                    <Slider
                      value={[config?.risk_per_trade || 0.5]}
                      onValueChange={(value) => handleSettingUpdate('risk_per_trade', value[0])}
                      max={2}
                      min={0.1}
                      step={0.1}
                    />
                  </div>
                  <span className="text-sm text-muted-foreground w-12">
                    {safeToFixed(config?.risk_per_trade || 0.5, 1)}%
                  </span>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="max-positions">Max Positions</Label>
                <div className="flex items-center space-x-2">
                  <Target className="h-4 w-4 text-muted-foreground" />
                  <Input
                    id="max-positions"
                    type="number"
                    value={config?.max_positions || 4}
                    onChange={(e) => handleSettingUpdate('max_positions', Number(e.target.value))}
                    min={1}
                    max={10}
                    className="flex-1"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="daily-stop">Daily Stop Loss (%)</Label>
                <div className="flex items-center space-x-2">
                  <Shield className="h-4 w-4 text-muted-foreground" />
                  <Input
                    id="daily-stop"
                    type="number"
                    value={config?.daily_stop_loss || 2.0}
                    onChange={(e) => handleSettingUpdate('daily_stop_loss', Number(e.target.value))}
                    step={0.1}
                    className="flex-1"
                  />
                </div>
              </div>
            </div>

            <div className="pt-4 border-t">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-medium">Trading Status</h4>
                  <p className="text-sm text-muted-foreground">
                    Bot is currently {botStatus.isActive ? 'active' : 'inactive'} in {botStatus.mode} mode
                  </p>
                </div>
                <Badge variant={botStatus.isActive ? 'default' : 'secondary'}>
                  {botStatus.isActive ? 'ACTIVE' : 'INACTIVE'}
                </Badge>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="strategies" className="space-y-4">
            <h4 className="font-medium">Active Strategies</h4>
            <div className="space-y-3">
              {activeStrategies.map((strategy, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between p-3 rounded-lg border"
                >
                  <div className="flex items-center space-x-3">
                    <Activity className="h-4 w-4" />
                    <div>
                      <p className="font-medium">{strategy.name}</p>
                      <p className="text-sm text-muted-foreground">
                        P&L: {strategy.profit}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Badge
                      variant={strategy.status === 'active' ? 'default' : 'secondary'}
                    >
                      {strategy.status}
                    </Badge>
                    <Switch
                      checked={strategy.status === 'active'}
                      disabled={!botActive}
                    />
                  </div>
                </div>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="risk" className="space-y-4">
            <div className="space-y-4">
              <div>
                <Label>Risk Used Today</Label>
                <div className="mt-2">
                  <div className="flex justify-between text-sm">
                    <span>Used</span>
                    <span>{safeToFixed(botStatus.riskUsed)}% / {safeToFixed(config?.daily_stop_loss || 2)}%</span>
                  </div>
                  <div className="mt-1 w-full bg-secondary rounded-full h-2">
                    <div 
                      className="bg-primary h-2 rounded-full transition-all"
                      style={{ 
                        width: `${Math.min((botStatus.riskUsed / (config?.daily_stop_loss || 2)) * 100, 100)}%` 
                      }}
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="p-3 rounded-lg border">
                  <div className="flex items-center space-x-2">
                    <Shield className="h-4 w-4 text-emerald-600" />
                    <span className="text-sm font-medium">Active Positions</span>
                  </div>
                  <p className="text-lg font-bold mt-1">
                    {botStatus.activeTrades} / {config?.max_positions}
                  </p>
                </div>
                
                <div className="p-3 rounded-lg border">
                  <div className="flex items-center space-x-2">
                    <TrendingUp className="h-4 w-4 text-blue-600" />
                    <span className="text-sm font-medium">Win Rate</span>
                  </div>
                  <p className="text-lg font-bold mt-1">{safeToFixed(botStatus.winRate, 1)}%</p>
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="advanced" className="space-y-4">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label>Paper Trading Mode</Label>
                  <p className="text-sm text-muted-foreground">
                    Use virtual balance for testing ({safeToFixed(config?.paper_trading_balance || 10000)} CAD)
                  </p>
                </div>
                <Switch
                  checked={botStatus.mode === 'paper'}
                  onCheckedChange={(checked) => 
                    handleSettingUpdate('mode', checked ? 'paper' : 'live')
                  }
                />
              </div>

              <div className="pt-4 border-t">
                <div className="grid grid-cols-2 gap-4">
                  <Button variant="outline" disabled={!botActive}>
                    <Settings className="h-4 w-4 mr-2" />
                    Test Strategy
                  </Button>
                  <Button variant="outline" disabled={!botActive}>
                    <Clock className="h-4 w-4 mr-2" />
                    View Logs
                  </Button>
                </div>
              </div>
            </div>
          </TabsContent>
        </Tabs>

        <div className="mt-6 pt-4 border-t">
          <div className="flex space-x-2">
            <Button
              onClick={onToggle}
              variant={botActive ? 'destructive' : 'default'}
              className="flex-1"
            >
              {botActive ? 'Stop Auto Trading' : 'Start Auto Trading'}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};