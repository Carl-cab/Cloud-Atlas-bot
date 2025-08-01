import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Clock, TrendingUp, TrendingDown, Target } from "lucide-react";

interface DetailedLogsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const DetailedLogsModal = ({ open, onOpenChange }: DetailedLogsModalProps) => {
  const tradeLogs = [
    {
      time: "14:32:15",
      type: "BUY",
      pair: "BTC/CAD",
      signal: "EMA Crossover + Volume Spike",
      entry: 89250.45,
      size: 0.0011,
      status: "Executed",
      confidence: 0.78
    },
    {
      time: "14:28:03",
      type: "SELL",
      pair: "ETH/CAD",
      signal: "RSI Overbought + Bollinger Upper",
      entry: 3420.85,
      size: 0.029,
      status: "Partial Fill",
      confidence: 0.65
    },
    {
      time: "14:15:22",
      type: "BUY",
      pair: "SOL/CAD",
      signal: "Mean Reversion + S/R Bounce",
      entry: 245.30,
      size: 0.204,
      status: "Executed",
      confidence: 0.82
    }
  ];

  const signalAnalysis = [
    {
      indicator: "Regime Detection",
      value: "Trending Market",
      confidence: "High",
      lastUpdate: "14:30:00"
    },
    {
      indicator: "ML Score",
      value: "0.78",
      confidence: "Above Threshold",
      lastUpdate: "14:32:15"
    },
    {
      indicator: "Volume Delta",
      value: "+$2.3M",
      confidence: "Bullish",
      lastUpdate: "14:32:10"
    }
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Clock className="w-5 h-5 text-primary" />
            Detailed Trading Logs
          </DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="executions" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="executions">Trade Executions</TabsTrigger>
            <TabsTrigger value="signals">Signal Analysis</TabsTrigger>
            <TabsTrigger value="performance">Performance Metrics</TabsTrigger>
          </TabsList>

          <TabsContent value="executions" className="space-y-4">
            <ScrollArea className="h-[400px]">
              <div className="space-y-3">
                {tradeLogs.map((trade, index) => (
                  <Card key={index} className="border-l-4 border-l-primary">
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
                        <span className="text-sm text-muted-foreground">{trade.time}</span>
                      </div>
                      
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                        <div>
                          <p className="text-muted-foreground">Signal</p>
                          <p className="font-medium">{trade.signal}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Entry Price</p>
                          <p className="font-medium">${trade.entry.toLocaleString()}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Size</p>
                          <p className="font-medium">{trade.size}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">ML Confidence</p>
                          <p className="font-medium">{(trade.confidence * 100).toFixed(0)}%</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="signals" className="space-y-4">
            <div className="grid gap-4">
              {signalAnalysis.map((signal, index) => (
                <Card key={index}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <Target className="w-4 h-4 text-primary" />
                        <div>
                          <p className="font-semibold">{signal.indicator}</p>
                          <p className="text-sm text-muted-foreground">Last updated: {signal.lastUpdate}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="font-medium">{signal.value}</p>
                        <Badge variant="outline">{signal.confidence}</Badge>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="performance" className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Win Rate</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-bold text-green-500">68.5%</p>
                </CardContent>
              </Card>
              
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Profit Factor</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-bold text-blue-500">1.85</p>
                </CardContent>
              </Card>
              
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Max Drawdown</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-bold text-red-500">-3.2%</p>
                </CardContent>
              </Card>
              
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Avg Trade</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-bold text-green-500">+$12.45</p>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
};