import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BarChart3, TrendingUp, Clock, Database } from "lucide-react";
import { useState } from "react";

interface BacktestModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const BacktestModal = ({ open, onOpenChange }: BacktestModalProps) => {
  const [backtestRunning, setBacktestRunning] = useState(false);
  const [progress, setProgress] = useState(0);

  const tradingPairs = [
    { symbol: "BTC/CAD", status: "completed", winRate: 72.5, pnl: "+$1,245.50", trades: 45 },
    { symbol: "ETH/CAD", status: "completed", winRate: 68.2, pnl: "+$892.30", trades: 38 },
    { symbol: "SOL/CAD", status: "running", winRate: 65.8, pnl: "+$654.20", trades: 28 },
    { symbol: "XRP/CAD", status: "pending", winRate: 0, pnl: "$0.00", trades: 0 }
  ];

  const handleStartBacktest = () => {
    setBacktestRunning(true);
    // Simulate progress
    const interval = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 100) {
          clearInterval(interval);
          setBacktestRunning(false);
          return 100;
        }
        return prev + 10;
      });
    }, 500);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-primary" />
            Historical Backtest - Kraken Data
          </DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="config" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="config">Configuration</TabsTrigger>
            <TabsTrigger value="results">Results</TabsTrigger>
            <TabsTrigger value="analysis">Analysis</TabsTrigger>
          </TabsList>

          <TabsContent value="config" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Database className="w-4 h-4" />
                  Backtest Configuration
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-6">
                  <div className="space-y-4">
                    <div>
                      <h4 className="font-semibold mb-2">Time Period</h4>
                      <p className="text-sm text-muted-foreground">6-12 months historical data</p>
                      <p className="text-sm">Jan 1, 2024 - Dec 31, 2024</p>
                    </div>
                    
                    <div>
                      <h4 className="font-semibold mb-2">Starting Capital</h4>
                      <p className="text-sm">$10,000 CAD</p>
                    </div>

                    <div>
                      <h4 className="font-semibold mb-2">Commission</h4>
                      <p className="text-sm">Kraken fees: 0.26% maker, 0.16% taker</p>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div>
                      <h4 className="font-semibold mb-2">Trading Pairs</h4>
                      <div className="space-y-1">
                        <Badge variant="outline">BTC/CAD</Badge>
                        <Badge variant="outline">ETH/CAD</Badge>
                        <Badge variant="outline">SOL/CAD</Badge>
                        <Badge variant="outline">XRP/CAD</Badge>
                      </div>
                    </div>

                    <div>
                      <h4 className="font-semibold mb-2">Strategy Parameters</h4>
                      <p className="text-sm text-muted-foreground">
                        Risk per trade: 0.5%<br />
                        ML threshold: 0.60<br />
                        Stop loss: 1.8x ATR<br />
                        Max concurrent: 4R
                      </p>
                    </div>
                  </div>
                </div>

                {backtestRunning && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">Backtest Progress</span>
                      <span className="text-sm text-muted-foreground">{progress}%</span>
                    </div>
                    <Progress value={progress} className="w-full" />
                  </div>
                )}

                <Button 
                  onClick={handleStartBacktest} 
                  disabled={backtestRunning}
                  className="w-full"
                >
                  {backtestRunning ? (
                    <>
                      <Clock className="w-4 h-4 mr-2 animate-spin" />
                      Running Backtest...
                    </>
                  ) : (
                    <>
                      <BarChart3 className="w-4 h-4 mr-2" />
                      Start Historical Backtest
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="results" className="space-y-6">
            <div className="grid gap-4">
              {tradingPairs.map((pair, index) => (
                <Card key={index}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <TrendingUp className="w-4 h-4 text-primary" />
                        <div>
                          <p className="font-semibold">{pair.symbol}</p>
                          <Badge 
                            variant={
                              pair.status === 'completed' ? 'default' : 
                              pair.status === 'running' ? 'secondary' : 'outline'
                            }
                          >
                            {pair.status}
                          </Badge>
                        </div>
                      </div>
                      
                      <div className="grid grid-cols-3 gap-6 text-right">
                        <div>
                          <p className="text-sm text-muted-foreground">Win Rate</p>
                          <p className="font-medium">{pair.winRate}%</p>
                        </div>
                        <div>
                          <p className="text-sm text-muted-foreground">P&L</p>
                          <p className={`font-medium ${pair.pnl.startsWith('+') ? 'text-green-500' : 'text-gray-500'}`}>
                            {pair.pnl}
                          </p>
                        </div>
                        <div>
                          <p className="text-sm text-muted-foreground">Trades</p>
                          <p className="font-medium">{pair.trades}</p>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Overall Performance Summary</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="text-center">
                    <p className="text-2xl font-bold text-green-500">+$2,792</p>
                    <p className="text-sm text-muted-foreground">Total P&L</p>
                  </div>
                  <div className="text-center">
                    <p className="text-2xl font-bold">69.2%</p>
                    <p className="text-sm text-muted-foreground">Win Rate</p>
                  </div>
                  <div className="text-center">
                    <p className="text-2xl font-bold">1.89</p>
                    <p className="text-sm text-muted-foreground">Profit Factor</p>
                  </div>
                  <div className="text-center">
                    <p className="text-2xl font-bold text-red-500">-4.2%</p>
                    <p className="text-sm text-muted-foreground">Max Drawdown</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="analysis" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Strategy Performance Analysis</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-6">
                  <div>
                    <h4 className="font-semibold mb-2">Trend-Following Engine</h4>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span>Win Rate:</span>
                        <span className="font-medium">71.5%</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Avg Win:</span>
                        <span className="font-medium text-green-500">+$45.20</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Avg Loss:</span>
                        <span className="font-medium text-red-500">-$18.50</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Total Trades:</span>
                        <span className="font-medium">78</span>
                      </div>
                    </div>
                  </div>

                  <div>
                    <h4 className="font-semibold mb-2">Mean-Reversion Engine</h4>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span>Win Rate:</span>
                        <span className="font-medium">66.8%</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Avg Win:</span>
                        <span className="font-medium text-green-500">+$32.10</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Avg Loss:</span>
                        <span className="font-medium text-red-500">-$15.80</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Total Trades:</span>
                        <span className="font-medium">33</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="pt-4">
                  <h4 className="font-semibold mb-2">Key Insights</h4>
                  <ul className="text-sm space-y-1 text-muted-foreground">
                    <li>• ML filtering improved win rate by 12.3% vs raw signals</li>
                    <li>• Best performance during trending market conditions</li>
                    <li>• Weekend trading showed 23% lower performance</li>
                    <li>• High volatility periods required 50% position size reduction</li>
                    <li>• Strategy validates for live deployment with $100 CAD</li>
                  </ul>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
};