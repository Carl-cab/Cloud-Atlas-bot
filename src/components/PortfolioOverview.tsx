import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { 
  PieChart, 
  TrendingUp, 
  TrendingDown, 
  DollarSign, 
  Percent,
  Activity,
  BarChart3,
  ArrowUpRight,
  ArrowDownRight
} from 'lucide-react';

interface Holding {
  symbol: string;
  amount: number;
  value: number;
  change24h: number;
  allocation: number;
  avgBuyPrice: number;
  currentPrice: number;
}

export const PortfolioOverview = () => {
  const [holdings] = useState<Holding[]>([
    {
      symbol: 'BTC',
      amount: 0.285,
      value: 12318.25,
      change24h: 2.45,
      allocation: 45.2,
      avgBuyPrice: 41200,
      currentPrice: 43250
    },
    {
      symbol: 'ETH',
      amount: 4.82,
      value: 12437.46,
      change24h: -1.2,
      allocation: 35.8,
      avgBuyPrice: 2420,
      currentPrice: 2580
    },
    {
      symbol: 'ADA',
      amount: 8450,
      value: 4097.25,
      change24h: 5.8,
      allocation: 12.5,
      avgBuyPrice: 0.42,
      currentPrice: 0.485
    },
    {
      symbol: 'DOT',
      amount: 425,
      value: 2975.50,
      change24h: -0.8,
      allocation: 6.5,
      avgBuyPrice: 6.80,
      currentPrice: 7.00
    }
  ]);

  const totalValue = holdings.reduce((sum, holding) => sum + holding.value, 0);
  const totalPnL = holdings.reduce((sum, holding) => {
    const pnl = (holding.currentPrice - holding.avgBuyPrice) * holding.amount;
    return sum + pnl;
  }, 0);
  const totalPnLPercent = (totalPnL / (totalValue - totalPnL)) * 100;

  const getChangeColor = (change: number) => {
    return change >= 0 ? 'text-success' : 'text-danger';
  };

  const getChangeIcon = (change: number) => {
    return change >= 0 ? 
      <ArrowUpRight className="w-4 h-4 text-success" /> : 
      <ArrowDownRight className="w-4 h-4 text-danger" />;
  };

  return (
    <div className="space-y-6">
      {/* Portfolio Summary */}
      <Card className="card-shadow">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <PieChart className="w-5 h-5" />
            Portfolio Overview
          </CardTitle>
          <CardDescription>
            Your current cryptocurrency holdings and performance
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6">
            <div className="text-center">
              <p className="text-sm text-muted-foreground">Total Value</p>
              <p className="text-2xl font-bold text-primary">${totalValue.toFixed(2)}</p>
            </div>
            
            <div className="text-center">
              <p className="text-sm text-muted-foreground">Total P&L</p>
              <p className={`text-2xl font-bold ${getChangeColor(totalPnL)}`}>
                ${Math.abs(totalPnL).toFixed(2)}
              </p>
            </div>
            
            <div className="text-center">
              <p className="text-sm text-muted-foreground">P&L Percentage</p>
              <p className={`text-2xl font-bold ${getChangeColor(totalPnLPercent)}`}>
                {totalPnLPercent >= 0 ? '+' : ''}{totalPnLPercent.toFixed(2)}%
              </p>
            </div>
            
            <div className="text-center">
              <p className="text-sm text-muted-foreground">Assets</p>
              <p className="text-2xl font-bold text-primary">{holdings.length}</p>
            </div>
          </div>

          {/* Allocation Chart Visualization */}
          <div className="space-y-4">
            <h4 className="font-semibold">Asset Allocation</h4>
            {holdings.map((holding) => (
              <div key={holding.symbol} className="space-y-2">
                <div className="flex justify-between items-center">
                  <span className="font-medium">{holding.symbol}</span>
                  <span className="text-sm text-muted-foreground">
                    {holding.allocation.toFixed(1)}%
                  </span>
                </div>
                <Progress value={holding.allocation} className="h-2" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Holdings Table */}
      <Card className="card-shadow">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="w-5 h-5" />
            Current Holdings
          </CardTitle>
          <CardDescription>
            Detailed breakdown of your cryptocurrency positions
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {holdings.map((holding) => {
              const pnl = (holding.currentPrice - holding.avgBuyPrice) * holding.amount;
              const pnlPercent = ((holding.currentPrice - holding.avgBuyPrice) / holding.avgBuyPrice) * 100;
              
              return (
                <div key={holding.symbol} className="p-4 border rounded-lg space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center">
                        <span className="font-bold text-primary">{holding.symbol[0]}</span>
                      </div>
                      <div>
                        <h3 className="font-semibold">{holding.symbol}</h3>
                        <p className="text-sm text-muted-foreground">
                          {holding.amount.toFixed(holding.symbol === 'BTC' ? 6 : 2)} {holding.symbol}
                        </p>
                      </div>
                    </div>
                    
                    <div className="text-right">
                      <p className="font-semibold">${holding.value.toFixed(2)}</p>
                      <div className="flex items-center gap-1">
                        {getChangeIcon(holding.change24h)}
                        <span className={`text-sm ${getChangeColor(holding.change24h)}`}>
                          {holding.change24h >= 0 ? '+' : ''}{holding.change24h.toFixed(2)}%
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                    <div>
                      <p className="text-muted-foreground">Avg Buy Price</p>
                      <p className="font-medium">${holding.avgBuyPrice.toFixed(2)}</p>
                    </div>
                    
                    <div>
                      <p className="text-muted-foreground">Current Price</p>
                      <p className="font-medium">${holding.currentPrice.toFixed(2)}</p>
                    </div>
                    
                    <div>
                      <p className="text-muted-foreground">P&L</p>
                      <p className={`font-medium ${getChangeColor(pnl)}`}>
                        ${Math.abs(pnl).toFixed(2)}
                      </p>
                    </div>
                    
                    <div>
                      <p className="text-muted-foreground">P&L %</p>
                      <p className={`font-medium ${getChangeColor(pnlPercent)}`}>
                        {pnlPercent >= 0 ? '+' : ''}{pnlPercent.toFixed(2)}%
                      </p>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <Button variant="outline" size="sm">Buy More</Button>
                    <Button variant="outline" size="sm">Sell</Button>
                    <Button variant="ghost" size="sm">Details</Button>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Trading History */}
      <Card className="card-shadow">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="w-5 h-5" />
            Recent Trading Activity
          </CardTitle>
          <CardDescription>
            Your latest automated and manual trades
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[
              { type: 'buy', symbol: 'BTC', amount: 0.025, price: 43100, time: '2 hours ago', auto: true },
              { type: 'sell', symbol: 'ETH', amount: 1.5, price: 2590, time: '4 hours ago', auto: true },
              { type: 'buy', symbol: 'ADA', amount: 1000, price: 0.475, time: '6 hours ago', auto: false },
              { type: 'sell', symbol: 'DOT', amount: 50, price: 7.10, time: '1 day ago', auto: true }
            ].map((trade, index) => (
              <div key={index} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                <div className="flex items-center gap-3">
                  <Badge 
                    variant={trade.type === 'buy' ? 'default' : 'secondary'}
                    className={trade.type === 'buy' ? 'bg-success' : 'bg-danger'}
                  >
                    {trade.type.toUpperCase()}
                  </Badge>
                  
                  <div>
                    <p className="font-medium">
                      {trade.amount} {trade.symbol} @ ${trade.price}
                    </p>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">{trade.time}</span>
                      {trade.auto && (
                        <Badge variant="outline" className="text-xs">
                          Auto
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
                
                <p className="font-medium">
                  ${(trade.amount * trade.price).toFixed(2)}
                </p>
              </div>
            ))}
          </div>
          
          <Button variant="outline" className="w-full mt-4">
            View All Trades
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};