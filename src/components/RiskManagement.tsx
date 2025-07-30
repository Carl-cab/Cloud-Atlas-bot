import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  Shield, 
  AlertTriangle, 
  TrendingDown, 
  Activity,
  Target,
  BarChart3,
  Clock,
  DollarSign
} from 'lucide-react';

interface RiskMetric {
  label: string;
  value: number;
  threshold: number;
  status: 'safe' | 'warning' | 'danger';
  description: string;
}

export const RiskManagement = () => {
  const [riskMetrics] = useState<RiskMetric[]>([
    {
      label: 'Portfolio Volatility',
      value: 28.5,
      threshold: 35,
      status: 'safe',
      description: 'Current portfolio volatility is within acceptable limits'
    },
    {
      label: 'Maximum Drawdown',
      value: 12.3,
      threshold: 15,
      status: 'warning',
      description: 'Approaching maximum drawdown threshold'
    },
    {
      label: 'Concentration Risk',
      value: 45.2,
      threshold: 50,
      status: 'warning',
      description: 'High concentration in BTC - consider diversification'
    },
    {
      label: 'Leverage Exposure',
      value: 15.8,
      threshold: 25,
      status: 'safe',
      description: 'Leverage usage is conservative'
    }
  ]);

  const [riskAlerts] = useState([
    {
      type: 'warning',
      title: 'High Volatility Detected',
      message: 'Market volatility has increased 25% in the last 24 hours. Consider reducing position sizes.',
      time: '2 hours ago'
    },
    {
      type: 'info',
      title: 'Correlation Alert',
      message: 'ETH and BTC correlation has reached 0.85. Diversification benefits may be reduced.',
      time: '4 hours ago'
    },
    {
      type: 'success',
      title: 'Risk Target Met',
      message: 'Portfolio risk has been successfully reduced to target levels.',
      time: '1 day ago'
    }
  ]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'safe': return 'text-success';
      case 'warning': return 'text-primary';
      case 'danger': return 'text-danger';
      default: return 'text-muted-foreground';
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'safe': return 'bg-success text-success-foreground';
      case 'warning': return 'bg-primary text-primary-foreground';
      case 'danger': return 'bg-danger text-danger-foreground';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  const getAlertIcon = (type: string) => {
    switch (type) {
      case 'warning': return <AlertTriangle className="w-4 h-4 text-primary" />;
      case 'danger': return <AlertTriangle className="w-4 h-4 text-danger" />;
      case 'info': return <Activity className="w-4 h-4 text-blue-500" />;
      case 'success': return <Shield className="w-4 h-4 text-success" />;
      default: return <Activity className="w-4 h-4 text-muted-foreground" />;
    }
  };

  return (
    <div className="space-y-6">
      {/* Risk Overview */}
      <Card className="card-shadow">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-primary" />
            Risk Assessment
          </CardTitle>
          <CardDescription>
            Real-time monitoring of portfolio risk metrics and exposure
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {riskMetrics.map((metric, index) => (
              <div key={index} className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="font-medium">{metric.label}</h4>
                  <Badge className={getStatusBadge(metric.status)}>
                    {metric.status.toUpperCase()}
                  </Badge>
                </div>
                
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className={getStatusColor(metric.status)}>
                      {metric.value.toFixed(1)}%
                    </span>
                    <span className="text-muted-foreground">
                      Limit: {metric.threshold}%
                    </span>
                  </div>
                  <Progress 
                    value={(metric.value / metric.threshold) * 100} 
                    className="h-2"
                  />
                </div>
                
                <p className="text-xs text-muted-foreground">
                  {metric.description}
                </p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Risk Controls */}
      <Card className="card-shadow">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Target className="w-5 h-5" />
            Risk Controls & Limits
          </CardTitle>
          <CardDescription>
            Automated risk management settings and emergency controls
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Emergency Controls */}
            <div className="space-y-4">
              <h4 className="font-semibold text-danger flex items-center gap-2">
                <AlertTriangle className="w-4 h-4" />
                Emergency Controls
              </h4>
              
              <div className="space-y-3">
                <Button 
                  variant="danger" 
                  className="w-full justify-start"
                  size="sm"
                >
                  <TrendingDown className="w-4 h-4 mr-2" />
                  Emergency Stop All Trading
                </Button>
                
                <Button 
                  variant="outline" 
                  className="w-full justify-start text-danger border-danger"
                  size="sm"
                >
                  <DollarSign className="w-4 h-4 mr-2" />
                  Liquidate All Positions
                </Button>
                
                <Button 
                  variant="outline" 
                  className="w-full justify-start"
                  size="sm"
                >
                  <Clock className="w-4 h-4 mr-2" />
                  Pause for 24 Hours
                </Button>
              </div>
            </div>

            {/* Current Limits */}
            <div className="space-y-4">
              <h4 className="font-semibold">Current Risk Limits</h4>
              
              <div className="space-y-3">
                {[
                  { label: 'Daily Loss Limit', value: '5%', used: '2.1%' },
                  { label: 'Maximum Position Size', value: '10%', used: '8.5%' },
                  { label: 'Total Leverage', value: '3x', used: '1.5x' },
                  { label: 'Correlation Limit', value: '0.8', used: '0.65' }
                ].map((limit, index) => (
                  <div key={index} className="flex justify-between items-center p-3 bg-muted/50 rounded-lg">
                    <div>
                      <p className="font-medium text-sm">{limit.label}</p>
                      <p className="text-xs text-muted-foreground">
                        Used: {limit.used} / {limit.value}
                      </p>
                    </div>
                    <Button variant="ghost" size="sm">
                      Edit
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Risk Alerts */}
      <Card className="card-shadow">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="w-5 h-5" />
            Risk Alerts & Notifications
          </CardTitle>
          <CardDescription>
            Recent risk alerts and system notifications
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {riskAlerts.map((alert, index) => (
              <Alert key={index} className="border-l-4 border-l-primary">
                <div className="flex items-start gap-3">
                  {getAlertIcon(alert.type)}
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-1">
                      <h4 className="font-medium">{alert.title}</h4>
                      <span className="text-xs text-muted-foreground">{alert.time}</span>
                    </div>
                    <AlertDescription>{alert.message}</AlertDescription>
                  </div>
                </div>
              </Alert>
            ))}
          </div>
          
          <Button variant="outline" className="w-full mt-4">
            View All Alerts
          </Button>
        </CardContent>
      </Card>

      {/* Market Stability Analysis */}
      <Card className="card-shadow">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="w-5 h-5" />
            Market Stability Analysis
          </CardTitle>
          <CardDescription>
            Real-time market conditions affecting trading decisions
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="text-center space-y-2">
              <h4 className="font-medium">Market Sentiment</h4>
              <div className="text-2xl font-bold text-primary">Bullish</div>
              <Badge variant="outline" className="bg-success/10 text-success">
                Fear & Greed: 65
              </Badge>
            </div>
            
            <div className="text-center space-y-2">
              <h4 className="font-medium">Volatility Index</h4>
              <div className="text-2xl font-bold text-primary">28.5</div>
              <Badge variant="outline">
                Normal Range
              </Badge>
            </div>
            
            <div className="text-center space-y-2">
              <h4 className="font-medium">Liquidity Score</h4>
              <div className="text-2xl font-bold text-success">High</div>
              <Badge variant="outline" className="bg-success/10 text-success">
                Optimal
              </Badge>
            </div>
          </div>
          
          <div className="mt-6 p-4 bg-success/10 rounded-lg border border-success/20">
            <p className="text-sm text-success font-medium mb-2">
              ✓ Market conditions are favorable for automated trading
            </p>
            <p className="text-xs text-muted-foreground">
              Low volatility, high liquidity, and positive sentiment create optimal conditions for bot operations.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};