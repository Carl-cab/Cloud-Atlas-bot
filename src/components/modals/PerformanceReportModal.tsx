import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { BarChart3, TrendingUp, TrendingDown, Download, DollarSign } from "lucide-react";

interface PerformanceReportModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const PerformanceReportModal = ({ open, onOpenChange }: PerformanceReportModalProps) => {
  const exchangePerformance = [
    {
      exchange: "Kraken",
      pnl: "+$127.45",
      winRate: "68.5%",
      trades: 23,
      fees: "$8.50",
      topPair: "BTC/CAD (+$78.20)"
    }
  ];

  const weeklyTrades = [
    { date: "2024-01-08", pair: "BTC/CAD", type: "BUY", pnl: "+$12.45", status: "Best Trade" },
    { date: "2024-01-08", pair: "ETH/CAD", type: "SELL", pnl: "+$8.30", status: "Good" },
    { date: "2024-01-07", pair: "SOL/CAD", type: "BUY", pnl: "-$5.20", status: "Worst Trade" },
    { date: "2024-01-07", pair: "XRP/CAD", type: "SELL", pnl: "+$15.60", status: "Good" },
  ];

  const withdrawalAdvice = {
    recommendation: "HOLD",
    reason: "3-day volatility below 75th percentile and no recent drawdown > 1R",
    weeklyProfit: "$127.45",
    suggestedWithdrawal: "$0.00",
    currentEquity: "$227.45",
    isNewHigh: true
  };

  const handleDownloadReport = () => {
    // Create downloadable report
    const reportData = {
      date: new Date().toISOString().split('T')[0],
      exchangePerformance,
      weeklyTrades,
      withdrawalAdvice
    };
    
    const blob = new Blob([JSON.stringify(reportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `trading-report-${reportData.date}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-primary" />
            Comprehensive Performance Report
          </DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="overview" className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="exchanges">Per-Exchange</TabsTrigger>
            <TabsTrigger value="trades">Trade Analysis</TabsTrigger>
            <TabsTrigger value="withdrawal">Withdrawal Advice</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Weekly P&L</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-bold text-green-500">+$127.45</p>
                  <p className="text-xs text-muted-foreground">+12.7% return</p>
                </CardContent>
              </Card>
              
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Win Rate</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-bold">68.5%</p>
                  <p className="text-xs text-muted-foreground">23 total trades</p>
                </CardContent>
              </Card>
              
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Profit Factor</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-bold text-blue-500">1.89</p>
                  <p className="text-xs text-muted-foreground">Above target 1.5</p>
                </CardContent>
              </Card>
              
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Max Drawdown</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-bold text-red-500">-3.2%</p>
                  <p className="text-xs text-muted-foreground">Within 5% limit</p>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Rolling Performance Metrics</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-3 gap-6">
                  <div>
                    <h4 className="font-semibold mb-2">Daily Average</h4>
                    <p className="text-lg font-medium text-green-500">+0.82%</p>
                    <p className="text-sm text-muted-foreground">Target: &gt;0.8%</p>
                  </div>
                  <div>
                    <h4 className="font-semibold mb-2">Slippage Estimate</h4>
                    <p className="text-lg font-medium">0.12%</p>
                    <p className="text-sm text-muted-foreground">Low market impact</p>
                  </div>
                  <div>
                    <h4 className="font-semibold mb-2">Rolling Volatility</h4>
                    <p className="text-lg font-medium">18.5%</p>
                    <p className="text-sm text-muted-foreground">30-day annualized</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="exchanges" className="space-y-6">
            <ScrollArea className="h-[400px]">
              <div className="space-y-4">
                {exchangePerformance.map((exchange, index) => (
                  <Card key={index} className="border-l-4 border-l-primary">
                    <CardHeader>
                      <CardTitle className="flex items-center justify-between">
                        <span>{exchange.exchange}</span>
                        <Badge variant="default">Active</Badge>
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                        <div>
                          <p className="text-sm text-muted-foreground">P&L</p>
                          <p className="text-lg font-bold text-green-500">{exchange.pnl}</p>
                        </div>
                        <div>
                          <p className="text-sm text-muted-foreground">Win Rate</p>
                          <p className="text-lg font-bold">{exchange.winRate}</p>
                        </div>
                        <div>
                          <p className="text-sm text-muted-foreground">Trades</p>
                          <p className="text-lg font-bold">{exchange.trades}</p>
                        </div>
                        <div>
                          <p className="text-sm text-muted-foreground">Fees Paid</p>
                          <p className="text-lg font-bold text-red-500">{exchange.fees}</p>
                        </div>
                        <div className="md:col-span-2">
                          <p className="text-sm text-muted-foreground">Top Performer</p>
                          <p className="text-lg font-bold">{exchange.topPair}</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="trades" className="space-y-6">
            <ScrollArea className="h-[400px]">
              <div className="space-y-3">
                {weeklyTrades.map((trade, index) => (
                  <Card key={index} className={`border-l-4 ${
                    trade.status === 'Best Trade' ? 'border-l-green-500' : 
                    trade.status === 'Worst Trade' ? 'border-l-red-500' : 
                    'border-l-blue-500'
                  }`}>
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          {trade.type === 'BUY' ? (
                            <TrendingUp className="w-4 h-4 text-green-500" />
                          ) : (
                            <TrendingDown className="w-4 h-4 text-red-500" />
                          )}
                          <span className="font-semibold">{trade.pair}</span>
                          <Badge variant={trade.type === 'BUY' ? 'default' : 'secondary'}>
                            {trade.type}
                          </Badge>
                        </div>
                        <span className="text-sm text-muted-foreground">{trade.date}</span>
                      </div>
                      
                      <div className="flex items-center justify-between">
                        <span className={`font-bold ${
                          trade.pnl.startsWith('+') ? 'text-green-500' : 'text-red-500'
                        }`}>
                          {trade.pnl}
                        </span>
                        <Badge variant={
                          trade.status === 'Best Trade' ? 'default' :
                          trade.status === 'Worst Trade' ? 'destructive' : 'outline'
                        }>
                          {trade.status}
                        </Badge>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="withdrawal" className="space-y-6">
            <Card className={`border-l-4 ${
              withdrawalAdvice.recommendation === 'HOLD' ? 'border-l-blue-500' : 'border-l-green-500'
            }`}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <DollarSign className="w-5 h-5" />
                  Withdrawal Recommendation
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="text-center">
                  <Badge 
                    variant={withdrawalAdvice.recommendation === 'HOLD' ? 'secondary' : 'default'}
                    className="text-lg px-4 py-2"
                  >
                    {withdrawalAdvice.recommendation}
                  </Badge>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Weekly Profit</p>
                    <p className="text-lg font-bold text-green-500">{withdrawalAdvice.weeklyProfit}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Suggested Withdrawal</p>
                    <p className="text-lg font-bold">{withdrawalAdvice.suggestedWithdrawal}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Current Equity</p>
                    <p className="text-lg font-bold">{withdrawalAdvice.currentEquity}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Equity Status</p>
                    <Badge variant={withdrawalAdvice.isNewHigh ? 'default' : 'outline'}>
                      {withdrawalAdvice.isNewHigh ? 'New High' : 'Below High'}
                    </Badge>
                  </div>
                </div>

                <div className="bg-muted p-4 rounded-lg">
                  <h4 className="font-semibold mb-2">Analysis</h4>
                  <p className="text-sm text-muted-foreground">{withdrawalAdvice.reason}</p>
                </div>

                <div className="text-xs text-muted-foreground">
                  <p><strong>Withdrawal Rule:</strong> Suggest withdrawing 25% of weekly profits if new equity high and (3-day volatility &gt; 75th percentile or 48h drawdown &gt; 1R)</p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        <div className="flex justify-end gap-3 pt-4">
          <Button variant="outline" onClick={handleDownloadReport}>
            <Download className="w-4 h-4 mr-2" />
            Download Report
          </Button>
          <Button onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};