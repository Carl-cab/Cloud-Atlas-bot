import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Settings, Target, Brain, Shield } from "lucide-react";
import { useState } from "react";

interface ParameterAdjustmentModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const ParameterAdjustmentModal = ({ open, onOpenChange }: ParameterAdjustmentModalProps) => {
  const [riskPerTrade, setRiskPerTrade] = useState([0.5]);
  const [stopLossATR, setStopLossATR] = useState([1.8]);
  const [mlThreshold, setMlThreshold] = useState([0.60]);
  const [maxConcurrentTrades, setMaxConcurrentTrades] = useState([4]);

  const handleSaveParameters = () => {
    // Here you would save the parameters
    console.log('Saving parameters:', {
      riskPerTrade: riskPerTrade[0],
      stopLossATR: stopLossATR[0],
      mlThreshold: mlThreshold[0],
      maxConcurrentTrades: maxConcurrentTrades[0]
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings className="w-5 h-5 text-primary" />
            Parameter Adjustment Panel
          </DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="risk" className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="risk">Risk Management</TabsTrigger>
            <TabsTrigger value="trading">Trading Rules</TabsTrigger>
            <TabsTrigger value="ml">ML Settings</TabsTrigger>
            <TabsTrigger value="position">Position Sizing</TabsTrigger>
          </TabsList>

          <TabsContent value="risk" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Shield className="w-4 h-4" />
                  Risk Parameters
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-2">
                  <Label>Risk Per Trade (%)</Label>
                  <div className="px-3">
                    <Slider
                      value={riskPerTrade}
                      onValueChange={setRiskPerTrade}
                      max={2}
                      min={0.1}
                      step={0.1}
                      className="w-full"
                    />
                  </div>
                  <p className="text-sm text-muted-foreground">Current: {riskPerTrade[0]}% (Max: 1%)</p>
                </div>

                <div className="space-y-2">
                  <Label>Daily Loss Limit (R multiple)</Label>
                  <Input defaultValue="-2" placeholder="Enter loss limit" />
                  <p className="text-sm text-muted-foreground">Pause trading for 12h when reached</p>
                </div>

                <div className="space-y-2">
                  <Label>Max Concurrent Exposure (R)</Label>
                  <div className="px-3">
                    <Slider
                      value={maxConcurrentTrades}
                      onValueChange={setMaxConcurrentTrades}
                      max={8}
                      min={2}
                      step={1}
                      className="w-full"
                    />
                  </div>
                  <p className="text-sm text-muted-foreground">Current: {maxConcurrentTrades[0]}R total exposure</p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="trading" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Target className="w-4 h-4" />
                  Trading Rules
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-2">
                  <Label>Stop Loss (ATR Multiple)</Label>
                  <div className="px-3">
                    <Slider
                      value={stopLossATR}
                      onValueChange={setStopLossATR}
                      max={3}
                      min={1}
                      step={0.1}
                      className="w-full"
                    />
                  </div>
                  <p className="text-sm text-muted-foreground">Current: {stopLossATR[0]}x ATR</p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Take Profit 1 (ATR)</Label>
                    <Input defaultValue="1.0" placeholder="TP1 multiple" />
                  </div>
                  <div className="space-y-2">
                    <Label>Take Profit 2 (ATR)</Label>
                    <Input defaultValue="3.0" placeholder="TP2 multiple" />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Minimum Expected R</Label>
                  <Input defaultValue="1.8" placeholder="Minimum R ratio" />
                  <p className="text-sm text-muted-foreground">Only take trades with R ≥ 1.8</p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="ml" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Brain className="w-4 h-4" />
                  ML Ranker Settings
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-2">
                  <Label>ML Score Threshold</Label>
                  <div className="px-3">
                    <Slider
                      value={mlThreshold}
                      onValueChange={setMlThreshold}
                      max={0.9}
                      min={0.5}
                      step={0.05}
                      className="w-full"
                    />
                  </div>
                  <p className="text-sm text-muted-foreground">Current: {mlThreshold[0]} (Execute only if probability ≥ {mlThreshold[0]})</p>
                </div>

                <div className="space-y-2">
                  <Label>Model Retrain Frequency</Label>
                  <Input defaultValue="Daily at 18:00 PT" disabled />
                  <p className="text-sm text-muted-foreground">Automatic nightly retraining with latest data</p>
                </div>

                <div className="space-y-2">
                  <Label>Feature Importance Threshold</Label>
                  <Input defaultValue="0.05" placeholder="Minimum feature weight" />
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="position" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Position Sizing Rules</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-2">
                  <Label>Max Position per Asset (%)</Label>
                  <Input defaultValue="10" placeholder="Maximum % per asset" />
                </div>

                <div className="space-y-2">
                  <Label>High Volatility Size Reduction (%)</Label>
                  <Input defaultValue="50" placeholder="Reduce size by %" />
                  <p className="text-sm text-muted-foreground">When ATR(14)/Price ≥ 2%</p>
                </div>

                <div className="space-y-2">
                  <Label>Weekend Session Size Reduction (%)</Label>
                  <Input defaultValue="50" placeholder="Reduce size by %" />
                </div>

                <div className="space-y-2">
                  <Label>Fee/Slippage Threshold (% of TP1)</Label>
                  <Input defaultValue="25" placeholder="Skip trade threshold" />
                  <p className="text-sm text-muted-foreground">Skip trades if fees &gt; 25% of TP1 distance</p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        <div className="flex justify-end gap-3 pt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSaveParameters}>
            Save Parameters
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};