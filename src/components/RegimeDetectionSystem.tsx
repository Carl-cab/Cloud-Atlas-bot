import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { 
  Activity, 
  TrendingUp, 
  TrendingDown, 
  BarChart3, 
  AlertTriangle,
  Clock,
  Target
} from 'lucide-react';

interface MarketRegime {
  type: 'trending' | 'ranging' | 'high_volatility';
  confidence: number;
  strength: number;
  adx: number;
  emaDivergence: number;
  bbWidth: number;
  atrPercentage: number;
  lastUpdate: string;
}

interface RegimeIndicator {
  name: string;
  value: number;
  threshold: number;
  status: 'active' | 'inactive';
  description: string;
}

export const RegimeDetectionSystem = () => {
  const [currentRegime, setCurrentRegime] = useState<MarketRegime>({
    type: 'trending',
    confidence: 78,
    strength: 65,
    adx: 24.5,
    emaDivergence: 0.8,
    bbWidth: 45,
    atrPercentage: 1.2,
    lastUpdate: new Date().toLocaleTimeString()
  });

  const [indicators, setIndicators] = useState<RegimeIndicator[]>([
    {
      name: 'ADX(14)',
      value: 24.5,
      threshold: 20,
      status: 'active',
      description: 'Trend strength indicator'
    },
    {
      name: 'EMA Divergence',
      value: 0.8,
      threshold: 0.5,
      status: 'active',
      description: '|EMA50-EMA200|/Price %'
    },
    {
      name: 'Bollinger Width',
      value: 45,
      threshold: 60,
      status: 'inactive',
      description: 'vs 60-day median'
    },
    {
      name: 'ATR Percentage',
      value: 1.2,
      threshold: 2.0,
      status: 'inactive',
      description: 'ATR(14)/Price volatility'
    }
  ]);

  const [regimeHistory] = useState([
    { time: '09:00', regime: 'ranging', confidence: 85 },
    { time: '10:15', regime: 'trending', confidence: 72 },
    { time: '11:30', regime: 'trending', confidence: 78 },
    { time: '12:45', regime: 'high_volatility', confidence: 91 },
    { time: '14:00', regime: 'trending', confidence: 78 }
  ]);

  useEffect(() => {
    // Simulate real-time regime updates
    const interval = setInterval(() => {
      setCurrentRegime(prev => ({
        ...prev,
        adx: Math.max(10, Math.min(50, prev.adx + (Math.random() - 0.5) * 5)),
        emaDivergence: Math.max(0, Math.min(2, prev.emaDivergence + (Math.random() - 0.5) * 0.3)),
        bbWidth: Math.max(20, Math.min(100, prev.bbWidth + (Math.random() - 0.5) * 10)),
        atrPercentage: Math.max(0.5, Math.min(4, prev.atrPercentage + (Math.random() - 0.5) * 0.5)),
        lastUpdate: new Date().toLocaleTimeString()
      }));
    }, 5000);

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    // Update regime based on indicators
    const { adx, emaDivergence, bbWidth, atrPercentage } = currentRegime;
    
    let newRegime: 'trending' | 'ranging' | 'high_volatility' = 'ranging';
    let confidence = 50;
    
    if (atrPercentage >= 2.0) {
      newRegime = 'high_volatility';
      confidence = 90;
    } else if (adx >= 20 && emaDivergence >= 0.5) {
      newRegime = 'trending';
      confidence = Math.min(95, 60 + (adx - 20) * 2 + emaDivergence * 20);
    } else if (adx < 20 && bbWidth < 60) {
      newRegime = 'ranging';
      confidence = Math.min(90, 70 + (20 - adx) + (60 - bbWidth) * 0.5);
    }

    setCurrentRegime(prev => ({
      ...prev,
      type: newRegime,
      confidence: Math.round(confidence),
      strength: Math.round((adx + emaDivergence * 20) / 2)
    }));

    // Update indicator statuses
    setIndicators(prev => prev.map(indicator => ({
      ...indicator,
      value: indicator.name === 'ADX(14)' ? adx :
             indicator.name === 'EMA Divergence' ? emaDivergence :
             indicator.name === 'Bollinger Width' ? bbWidth :
             atrPercentage,
      status: (
        (indicator.name === 'ADX(14)' && adx >= indicator.threshold) ||
        (indicator.name === 'EMA Divergence' && emaDivergence >= indicator.threshold) ||
        (indicator.name === 'Bollinger Width' && bbWidth < indicator.threshold) ||
        (indicator.name === 'ATR Percentage' && atrPercentage >= indicator.threshold)
      ) ? 'active' : 'inactive'
    })));
  }, [currentRegime.adx, currentRegime.emaDivergence, currentRegime.bbWidth, currentRegime.atrPercentage]);

  const getRegimeIcon = (regime: string) => {
    switch (regime) {
      case 'trending': return <TrendingUp className="w-5 h-5 text-success" />;
      case 'ranging': return <BarChart3 className="w-5 h-5 text-primary" />;
      case 'high_volatility': return <AlertTriangle className="w-5 h-5 text-danger" />;
      default: return <Activity className="w-5 h-5 text-muted-foreground" />;
    }
  };

  const getRegimeColor = (regime: string) => {
    switch (regime) {
      case 'trending': return 'bg-success text-success-foreground';
      case 'ranging': return 'bg-primary text-primary-foreground';
      case 'high_volatility': return 'bg-danger text-danger-foreground';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  const getRegimeDescription = (regime: string) => {
    switch (regime) {
      case 'trending': return 'Market showing strong directional movement. Trend-following strategies active.';
      case 'ranging': return 'Market in consolidation phase. Mean-reversion strategies preferred.';
      case 'high_volatility': return 'Elevated volatility detected. Position sizes halved, stops widened.';
      default: return 'Analyzing market conditions...';
    }
  };

  return (
    <div className="space-y-6">
      {/* Current Regime Status */}
      <Card className="card-shadow">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {getRegimeIcon(currentRegime.type)}
            Market Regime Detection
          </CardTitle>
          <CardDescription>
            Real-time market environment analysis • Updated every minute
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold">Current Regime</h3>
                <Badge className={getRegimeColor(currentRegime.type)}>
                  {currentRegime.type.replace('_', ' ').toUpperCase()}
                </Badge>
              </div>
              
              <div className="space-y-3">
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span>Confidence</span>
                    <span className="font-medium">{currentRegime.confidence}%</span>
                  </div>
                  <Progress value={currentRegime.confidence} className="h-2" />
                </div>
                
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span>Signal Strength</span>
                    <span className="font-medium">{currentRegime.strength}%</span>
                  </div>
                  <Progress value={currentRegime.strength} className="h-2" />
                </div>
              </div>
              
              <div className="p-3 bg-muted/50 rounded-lg">
                <p className="text-sm text-muted-foreground">
                  {getRegimeDescription(currentRegime.type)}
                </p>
              </div>
              
              <div className="text-xs text-muted-foreground flex items-center gap-1">
                <Clock className="w-3 h-3" />
                Last updated: {currentRegime.lastUpdate}
              </div>
            </div>

            <div className="space-y-4">
              <h3 className="text-lg font-semibold flex items-center gap-2">
                <Target className="w-4 h-4" />
                Key Indicators
              </h3>
              
              {indicators.map((indicator, index) => (
                <div key={index} className="flex items-center justify-between p-3 border rounded-lg">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <h4 className="font-medium text-sm">{indicator.name}</h4>
                      <Badge 
                        variant={indicator.status === 'active' ? 'default' : 'secondary'}
                        className="text-xs"
                      >
                        {indicator.status}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">{indicator.description}</p>
                  </div>
                  
                  <div className="text-right">
                    <div className={`font-semibold ${
                      indicator.status === 'active' ? 'text-primary' : 'text-muted-foreground'
                    }`}>
                      {indicator.value.toFixed(1)}{indicator.name.includes('Percentage') || indicator.name.includes('Divergence') ? '%' : ''}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {indicator.name === 'Bollinger Width' ? '<' : '>'} {indicator.threshold}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Regime History */}
      <Card className="card-shadow">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="w-5 h-5" />
            Regime History (Today)
          </CardTitle>
          <CardDescription>
            Market regime transitions and confidence levels
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {regimeHistory.map((entry, index) => (
              <div key={index} className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
                <div className="flex items-center gap-3">
                  <div className="text-sm font-mono text-muted-foreground">
                    {entry.time}
                  </div>
                  {getRegimeIcon(entry.regime)}
                  <Badge className={getRegimeColor(entry.regime)}>
                    {entry.regime.replace('_', ' ')}
                  </Badge>
                </div>
                <div className="text-sm font-medium">
                  {entry.confidence}% confidence
                </div>
              </div>
            ))}
          </div>
          
          <div className="mt-4 flex gap-2">
            <Button variant="outline" size="sm">
              <BarChart3 className="w-4 h-4 mr-2" />
              View Chart
            </Button>
            <Button variant="outline" size="sm">
              Export Data
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};