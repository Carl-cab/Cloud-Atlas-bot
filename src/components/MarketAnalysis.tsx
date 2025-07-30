import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { 
  TrendingUp, 
  TrendingDown, 
  Brain, 
  Target, 
  AlertCircle,
  Activity,
  BarChart3,
  Eye
} from 'lucide-react';

interface MarketData {
  symbol: string;
  price: number;
  change24h: number;
  volume: number;
  trend: 'bullish' | 'bearish' | 'neutral';
  confidence: number;
  signals: {
    type: 'buy' | 'sell' | 'hold';
    strength: number;
    reason: string;
  }[];
}

interface MarketAnalysisProps {
  platform: string;
}

export const MarketAnalysis = ({ platform }: MarketAnalysisProps) => {
  const [marketData, setMarketData] = useState<MarketData[]>([
    {
      symbol: 'BTC/USDT',
      price: 43250.50,
      change24h: 2.45,
      volume: 1250000000,
      trend: 'bullish',
      confidence: 78,
      signals: [
        { type: 'buy', strength: 85, reason: 'Breaking resistance at $43,000' },
        { type: 'buy', strength: 72, reason: 'RSI oversold recovery' },
        { type: 'hold', strength: 60, reason: 'Volume confirmation needed' }
      ]
    },
    {
      symbol: 'ETH/USDT',
      price: 2580.30,
      change24h: -1.2,
      volume: 800000000,
      trend: 'neutral',
      confidence: 65,
      signals: [
        { type: 'hold', strength: 70, reason: 'Consolidation phase' },
        { type: 'buy', strength: 55, reason: 'Support holding at $2,550' }
      ]
    },
    {
      symbol: 'ADA/USDT',
      price: 0.485,
      change24h: 5.8,
      volume: 120000000,
      trend: 'bullish',
      confidence: 82,
      signals: [
        { type: 'buy', strength: 88, reason: 'Strong momentum breakout' },
        { type: 'buy', strength: 75, reason: 'High volume confirmation' }
      ]
    }
  ]);

  const [aiInsights, setAiInsights] = useState({
    marketSentiment: 'Cautiously Optimistic',
    riskLevel: 'Medium',
    recommendedAction: 'Selective buying with tight stops',
    volatilityIndex: 68,
    fearGreedIndex: 55
  });

  useEffect(() => {
    // Simulate real-time market data updates
    const interval = setInterval(() => {
      setMarketData(prev => prev.map(item => ({
        ...item,
        price: item.price + (Math.random() - 0.5) * item.price * 0.01,
        change24h: item.change24h + (Math.random() - 0.5) * 2,
        confidence: Math.max(30, Math.min(95, item.confidence + (Math.random() - 0.5) * 10))
      })));
    }, 3000);

    return () => clearInterval(interval);
  }, []);

  const getTrendIcon = (trend: string) => {
    switch (trend) {
      case 'bullish': return <TrendingUp className="w-4 h-4 text-success" />;
      case 'bearish': return <TrendingDown className="w-4 h-4 text-danger" />;
      default: return <Activity className="w-4 h-4 text-muted-foreground" />;
    }
  };

  const getTrendColor = (trend: string) => {
    switch (trend) {
      case 'bullish': return 'text-success';
      case 'bearish': return 'text-danger';
      default: return 'text-muted-foreground';
    }
  };

  const getSignalColor = (type: string) => {
    switch (type) {
      case 'buy': return 'bg-success text-success-foreground';
      case 'sell': return 'bg-danger text-danger-foreground';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  return (
    <div className="space-y-6">
      {/* AI Insights */}
      <Card className="card-shadow">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Brain className="w-5 h-5 text-primary" />
            AI Market Intelligence
          </CardTitle>
          <CardDescription>
            Real-time market analysis powered by advanced algorithms
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="space-y-2">
              <h4 className="text-sm font-medium text-muted-foreground">Market Sentiment</h4>
              <p className="text-lg font-semibold text-primary">{aiInsights.marketSentiment}</p>
            </div>
            
            <div className="space-y-2">
              <h4 className="text-sm font-medium text-muted-foreground">Risk Level</h4>
              <Badge variant="outline" className="text-sm">
                {aiInsights.riskLevel}
              </Badge>
            </div>
            
            <div className="space-y-2">
              <h4 className="text-sm font-medium text-muted-foreground">Volatility Index</h4>
              <div className="space-y-1">
                <p className="text-lg font-semibold">{aiInsights.volatilityIndex}%</p>
                <Progress value={aiInsights.volatilityIndex} className="h-2" />
              </div>
            </div>
            
            <div className="space-y-2">
              <h4 className="text-sm font-medium text-muted-foreground">Fear & Greed</h4>
              <div className="space-y-1">
                <p className="text-lg font-semibold">{aiInsights.fearGreedIndex}</p>
                <Progress value={aiInsights.fearGreedIndex} className="h-2" />
              </div>
            </div>
          </div>
          
          <div className="mt-6 p-4 bg-muted/50 rounded-lg">
            <h4 className="font-medium mb-2 flex items-center gap-2">
              <Target className="w-4 h-4" />
              Recommended Action
            </h4>
            <p className="text-sm text-muted-foreground">{aiInsights.recommendedAction}</p>
          </div>
        </CardContent>
      </Card>

      {/* Market Data */}
      <Card className="card-shadow">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="w-5 h-5" />
            Market Analysis - {platform.charAt(0).toUpperCase() + platform.slice(1)}
          </CardTitle>
          <CardDescription>
            Real-time price analysis and trading signals
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-6">
            {marketData.map((item) => (
              <div key={item.symbol} className="border rounded-lg p-4 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <h3 className="text-lg font-semibold">{item.symbol}</h3>
                    {getTrendIcon(item.trend)}
                    <Badge variant="outline" className={getTrendColor(item.trend)}>
                      {item.trend}
                    </Badge>
                  </div>
                  
                  <div className="text-right">
                    <p className="text-lg font-semibold">${item.price.toFixed(2)}</p>
                    <p className={`text-sm ${item.change24h >= 0 ? 'text-success' : 'text-danger'}`}>
                      {item.change24h >= 0 ? '+' : ''}{item.change24h.toFixed(2)}%
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <h4 className="text-sm font-medium text-muted-foreground mb-2">AI Confidence</h4>
                    <div className="flex items-center gap-2">
                      <Progress value={item.confidence} className="flex-1" />
                      <span className="text-sm font-medium">{item.confidence}%</span>
                    </div>
                  </div>
                  
                  <div>
                    <h4 className="text-sm font-medium text-muted-foreground mb-2">24h Volume</h4>
                    <p className="text-sm font-medium">
                      ${(item.volume / 1000000).toFixed(0)}M
                    </p>
                  </div>
                </div>

                <div>
                  <h4 className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2">
                    <Eye className="w-4 h-4" />
                    Trading Signals
                  </h4>
                  <div className="space-y-2">
                    {item.signals.map((signal, index) => (
                      <div key={index} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                        <div className="flex items-center gap-3">
                          <Badge className={getSignalColor(signal.type)}>
                            {signal.type.toUpperCase()}
                          </Badge>
                          <span className="text-sm">{signal.reason}</span>
                        </div>
                        <div className="text-sm font-medium">
                          {signal.strength}% confidence
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};