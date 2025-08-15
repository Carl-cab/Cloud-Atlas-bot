import { useState } from 'react';
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

interface AutoTradingControlsProps {
  botActive: boolean;
  onToggle: () => void;
  platform: string;
}

export const AutoTradingControls = ({ botActive, onToggle, platform }: AutoTradingControlsProps) => {
  const [settings, setSettings] = useState({
    maxInvestment: 100, // $100 CAD beta test
    riskLevel: [0.5], // 0.5% risk per trade
    takeProfitPercent: 15,
    stopLossPercent: 8,
    enableDCA: true,
    dcaInterval: 4,
    maxPositions: 4, // 4 max positions as per requirements
    tradingPairs: ['BTC/USDT', 'ETH/USDT', 'ADA/USDT'],
    enableGridTrading: false,
    gridLevels: 10,
    enableTrendFollowing: true,
    dailyStopLoss: 2.0 // 2% daily stop loss
  });

  const [activeStrategies, setActiveStrategies] = useState([
    { name: 'Momentum Trading', status: 'active', profit: '+5.2%' },
    { name: 'Mean Reversion', status: 'paused', profit: '+2.1%' },
    { name: 'Grid Trading', status: 'active', profit: '+3.8%' }
  ]);

  const updateSetting = (key: string, value: any) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  };

  return (
    <Card className="card-shadow">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bot className="w-5 h-5 text-primary" />
          Auto Trading Controls
        </CardTitle>
        <CardDescription>
          Configure your automated trading parameters and strategies
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="basic" className="space-y-6">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="basic">Basic</TabsTrigger>
            <TabsTrigger value="strategies">Strategies</TabsTrigger>
            <TabsTrigger value="risk">Risk</TabsTrigger>
            <TabsTrigger value="advanced">Advanced</TabsTrigger>
          </TabsList>

          <TabsContent value="basic" className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <div>
                  <Label htmlFor="maxInvestment" className="flex items-center gap-2">
                    <DollarSign className="w-4 h-4" />
                    Maximum Investment Per Trade
                  </Label>
                  <Input
                    id="maxInvestment"
                    type="number"
                    value={settings.maxInvestment}
                    onChange={(e) => updateSetting('maxInvestment', Number(e.target.value))}
                    className="mt-2"
                  />
                </div>

                <div>
                  <Label className="flex items-center gap-2">
                    <Percent className="w-4 h-4" />
                    Take Profit (%)
                  </Label>
                  <Input
                    type="number"
                    value={settings.takeProfitPercent}
                    onChange={(e) => updateSetting('takeProfitPercent', Number(e.target.value))}
                    className="mt-2"
                  />
                </div>

                <div>
                  <Label className="flex items-center gap-2">
                    <Percent className="w-4 h-4" />
                    Stop Loss (%)
                  </Label>
                  <Input
                    type="number"
                    value={settings.stopLossPercent}
                    onChange={(e) => updateSetting('stopLossPercent', Number(e.target.value))}
                    className="mt-2"
                  />
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <Label className="flex items-center gap-2">
                    <Shield className="w-4 h-4" />
                    Risk Level: {settings.riskLevel[0]}%/trade
                  </Label>
                  <Slider
                    value={settings.riskLevel}
                    onValueChange={(value) => updateSetting('riskLevel', value)}
                    max={2}
                    min={0.1}
                    step={0.1}
                    className="mt-2"
                  />
                  <div className="flex justify-between text-xs text-muted-foreground mt-1">
                    <span>0.1% (Conservative)</span>
                    <span>2% (Aggressive)</span>
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <Label htmlFor="enableDCA" className="flex items-center gap-2">
                    <Clock className="w-4 h-4" />
                    Enable DCA
                  </Label>
                  <Switch
                    id="enableDCA"
                    checked={settings.enableDCA}
                    onCheckedChange={(checked) => updateSetting('enableDCA', checked)}
                  />
                </div>

                <div>
                  <Label>Max Concurrent Positions</Label>
                  <Input
                    type="number"
                    value={settings.maxPositions}
                    onChange={(e) => updateSetting('maxPositions', Number(e.target.value))}
                    className="mt-2"
                  />
                </div>
              </div>
            </div>

            <div className="flex gap-4 pt-4 border-t">
              <Button 
                variant={botActive ? "danger" : "trading"} 
                onClick={onToggle}
                className="flex-1"
              >
                {botActive ? 'Stop Auto Trading' : 'Start Auto Trading'}
              </Button>
              <Button variant="outline">
                <Settings className="w-4 h-4 mr-2" />
                Test Strategy
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="strategies" className="space-y-6">
            <div className="space-y-4">
              <h3 className="text-lg font-semibold flex items-center gap-2">
                <Target className="w-5 h-5" />
                Active Trading Strategies
              </h3>
              
              {activeStrategies.map((strategy, index) => (
                <div key={index} className="flex items-center justify-between p-4 border rounded-lg">
                  <div className="flex items-center gap-3">
                    <Activity className="w-4 h-4 text-primary" />
                    <div>
                      <h4 className="font-medium">{strategy.name}</h4>
                      <p className="text-sm text-muted-foreground">
                        Performance: <span className="text-success font-medium">{strategy.profit}</span>
                      </p>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-3">
                    <Badge 
                      variant={strategy.status === 'active' ? 'default' : 'secondary'}
                    >
                      {strategy.status}
                    </Badge>
                    <Switch 
                      checked={strategy.status === 'active'}
                      onCheckedChange={() => {
                        const newStrategies = [...activeStrategies];
                        newStrategies[index].status = strategy.status === 'active' ? 'paused' : 'active';
                        setActiveStrategies(newStrategies);
                      }}
                    />
                  </div>
                </div>
              ))}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="flex items-center justify-between p-4 border rounded-lg">
                  <Label htmlFor="trendFollowing" className="flex items-center gap-2">
                    <TrendingUp className="w-4 h-4" />
                    Trend Following
                  </Label>
                  <Switch
                    id="trendFollowing"
                    checked={settings.enableTrendFollowing}
                    onCheckedChange={(checked) => updateSetting('enableTrendFollowing', checked)}
                  />
                </div>

                <div className="flex items-center justify-between p-4 border rounded-lg">
                  <Label htmlFor="gridTrading" className="flex items-center gap-2">
                    <Target className="w-4 h-4" />
                    Grid Trading
                  </Label>
                  <Switch
                    id="gridTrading"
                    checked={settings.enableGridTrading}
                    onCheckedChange={(checked) => updateSetting('enableGridTrading', checked)}
                  />
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="risk" className="space-y-6">
            <div className="space-y-4">
              <div className="p-4 bg-danger/10 border border-danger/20 rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <AlertTriangle className="w-4 h-4 text-danger" />
                  <h4 className="font-medium text-danger">Risk Management</h4>
                </div>
                <p className="text-sm text-muted-foreground">
                  These settings control your maximum exposure and risk tolerance
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <Label>Daily Loss Limit (%)</Label>
                  <Input 
                    type="number" 
                    value={settings.dailyStopLoss}
                    onChange={(e) => updateSetting('dailyStopLoss', Number(e.target.value))}
                    className="mt-2" 
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Bot will stop trading if daily losses exceed this percentage (Recommended: 2%)
                  </p>
                </div>

                <div>
                  <Label>Maximum Drawdown (%)</Label>
                  <Input type="number" defaultValue="10" className="mt-2" />
                  <p className="text-xs text-muted-foreground mt-1">
                    Maximum portfolio decline from peak value
                  </p>
                </div>

                <div>
                  <Label>Position Size per Trade (%)</Label>
                  <Input 
                    type="number" 
                    value={settings.riskLevel[0]}
                    onChange={(e) => updateSetting('riskLevel', [Number(e.target.value)])}
                    className="mt-2" 
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Percentage of portfolio to risk per trade (Recommended: 0.5%)
                  </p>
                </div>

                <div>
                  <Label>Cool-down Period (hours)</Label>
                  <Input type="number" defaultValue="24" className="mt-2" />
                  <p className="text-xs text-muted-foreground mt-1">
                    Time to wait after stop-loss trigger
                  </p>
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="advanced" className="space-y-6">
            <div className="space-y-4">
              <div>
                <Label>Trading Pairs</Label>
                <div className="flex flex-wrap gap-2 mt-2">
                  {settings.tradingPairs.map((pair) => (
                    <Badge key={pair} variant="outline">
                      {pair}
                    </Badge>
                  ))}
                </div>
                <Button variant="outline" size="sm" className="mt-2">
                  Add Pair
                </Button>
              </div>

              <div>
                <Label>DCA Interval (hours)</Label>
                <Input
                  type="number"
                  value={settings.dcaInterval}
                  onChange={(e) => updateSetting('dcaInterval', Number(e.target.value))}
                  className="mt-2"
                />
              </div>

              <div>
                <Label>Grid Trading Levels</Label>
                <Input
                  type="number"
                  value={settings.gridLevels}
                  onChange={(e) => updateSetting('gridLevels', Number(e.target.value))}
                  className="mt-2"
                />
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
};