import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TrendingUp, Brain, Settings, Clock } from "lucide-react";

interface OptimizationLogModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const OptimizationLogModal = ({ open, onOpenChange }: OptimizationLogModalProps) => {
  const mlUpdates = [
    {
      timestamp: "2024-01-08 18:00:00",
      type: "Model Retrain",
      description: "Nightly ML model update with 24h data",
      accuracy: "78.5%",
      improvement: "+2.3%",
      features: ["RSI", "MACD", "Volume Delta", "Bollinger %B"]
    },
    {
      timestamp: "2024-01-07 18:00:00", 
      type: "Feature Selection",
      description: "Removed low-importance features below 0.05 threshold",
      accuracy: "76.2%",
      improvement: "+1.1%",
      features: ["Order Book Imbalance", "EMA Distance"]
    },
    {
      timestamp: "2024-01-06 18:00:00",
      type: "Hyperparameter Tuning",
      description: "Optimized Gradient Boosting parameters",
      accuracy: "75.1%",
      improvement: "+0.8%",
      features: ["n_estimators: 150", "max_depth: 6", "learning_rate: 0.1"]
    }
  ];

  const strategyAdjustments = [
    {
      timestamp: "2024-01-08 14:30:00",
      type: "Risk Adjustment",
      parameter: "Position Size",
      oldValue: "0.5%",
      newValue: "0.4%",
      reason: "High volatility detected (ATR > 2%)",
      impact: "Reduced risk exposure by 20%"
    },
    {
      timestamp: "2024-01-07 09:15:00",
      type: "Regime Switch",
      parameter: "Active Engine",
      oldValue: "Mean Reversion",
      newValue: "Trend Following",
      reason: "Market regime changed to trending (ADX > 20)",
      impact: "Switched primary strategy focus"
    },
    {
      timestamp: "2024-01-06 16:45:00",
      type: "Stop Loss",
      parameter: "ATR Multiple",
      oldValue: "1.8x",
      newValue: "2.0x",
      reason: "Increased market noise in 15m timeframe",
      impact: "Reduced false stop-outs by 15%"
    }
  ];

  const performanceImprovements = [
    {
      metric: "Win Rate",
      before: "65.2%",
      after: "68.5%",
      improvement: "+3.3%",
      period: "Last 7 days"
    },
    {
      metric: "Profit Factor", 
      before: "1.72",
      after: "1.89",
      improvement: "+9.9%",
      period: "Last 7 days"
    },
    {
      metric: "Max Drawdown",
      before: "-4.8%",
      after: "-3.2%",
      improvement: "+33.3%",
      period: "Last 7 days"
    },
    {
      metric: "ML Accuracy",
      before: "74.1%",
      after: "78.5%",
      improvement: "+5.9%",
      period: "Last 3 retrains"
    }
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-primary" />
            Optimization & Learning Log
          </DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="ml" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="ml">ML Model Updates</TabsTrigger>
            <TabsTrigger value="strategy">Strategy Adjustments</TabsTrigger>
            <TabsTrigger value="performance">Performance Gains</TabsTrigger>
          </TabsList>

          <TabsContent value="ml" className="space-y-4">
            <ScrollArea className="h-[400px]">
              <div className="space-y-4">
                {mlUpdates.map((update, index) => (
                  <Card key={index} className="border-l-4 border-l-blue-500">
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between">
                        <CardTitle className="flex items-center gap-2 text-base">
                          <Brain className="w-4 h-4" />
                          {update.type}
                        </CardTitle>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline">{update.accuracy}</Badge>
                          <Badge variant="default" className="text-green-600 bg-green-50">
                            {update.improvement}
                          </Badge>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Clock className="w-3 h-3" />
                        {update.timestamp}
                      </div>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm mb-3">{update.description}</p>
                      <div>
                        <p className="text-xs font-semibold mb-1">Updated Features/Parameters:</p>
                        <div className="flex flex-wrap gap-1">
                          {update.features.map((feature, idx) => (
                            <Badge key={idx} variant="outline" className="text-xs">
                              {feature}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="strategy" className="space-y-4">
            <ScrollArea className="h-[400px]">
              <div className="space-y-4">
                {strategyAdjustments.map((adjustment, index) => (
                  <Card key={index} className="border-l-4 border-l-orange-500">
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between">
                        <CardTitle className="flex items-center gap-2 text-base">
                          <Settings className="w-4 h-4" />
                          {adjustment.type}
                        </CardTitle>
                        <Badge variant="secondary">{adjustment.parameter}</Badge>
                      </div>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Clock className="w-3 h-3" />
                        {adjustment.timestamp}
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-2 gap-4 mb-3">
                        <div>
                          <p className="text-xs text-muted-foreground">Previous Value</p>
                          <p className="font-medium">{adjustment.oldValue}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">New Value</p>
                          <p className="font-medium text-green-600">{adjustment.newValue}</p>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <div>
                          <p className="text-xs font-semibold">Reason:</p>
                          <p className="text-sm text-muted-foreground">{adjustment.reason}</p>
                        </div>
                        <div>
                          <p className="text-xs font-semibold">Impact:</p>
                          <p className="text-sm text-muted-foreground">{adjustment.impact}</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="performance" className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {performanceImprovements.map((metric, index) => (
                <Card key={index} className="border-l-4 border-l-green-500">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">{metric.metric}</CardTitle>
                    <Badge variant="outline" className="w-fit">{metric.period}</Badge>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-3 gap-2 text-sm">
                      <div>
                        <p className="text-muted-foreground">Before</p>
                        <p className="font-medium">{metric.before}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">After</p>
                        <p className="font-medium text-green-600">{metric.after}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Improvement</p>
                        <p className="font-bold text-green-600">{metric.improvement}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Overall Learning Summary</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="bg-green-50 p-4 rounded-lg border border-green-200">
                  <h4 className="font-semibold text-green-800 mb-2">Key Achievements</h4>
                  <ul className="text-sm text-green-700 space-y-1">
                    <li>• ML model accuracy improved by 5.9% over 3 retrains</li>
                    <li>• Dynamic risk adjustment reduced max drawdown by 33%</li>
                    <li>• Regime detection prevented 12 poor-timing trades</li>
                    <li>• Feature selection improved computational efficiency by 18%</li>
                  </ul>
                </div>
                
                <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                  <h4 className="font-semibold text-blue-800 mb-2">Next Optimizations</h4>
                  <ul className="text-sm text-blue-700 space-y-1">
                    <li>• Test Random Forest vs Gradient Boosting performance</li>
                    <li>• Implement ensemble voting between multiple models</li>
                    <li>• Add sentiment analysis from crypto news feeds</li>
                    <li>• Optimize execution timing with order book depth</li>
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