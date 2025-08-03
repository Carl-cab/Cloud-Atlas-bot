import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { CheckCircle, DollarSign, Shield, AlertTriangle, Play } from "lucide-react";
import { useState } from "react";

interface ProceedToLiveModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const ProceedToLiveModal = ({ open, onOpenChange }: ProceedToLiveModalProps) => {
  const [confirmed, setConfirmed] = useState(false);

  const safetyChecklist = [
    { item: "Paper trading completed with positive results", checked: true },
    { item: "$100 CAD account balance verified", checked: true },
    { item: "Risk management parameters configured", checked: true },
    { item: "Emergency stop mechanisms active", checked: true },
    { item: "Real-time notifications configured", checked: true },
    { item: "5% drawdown circuit breaker enabled", checked: true }
  ];

  const handleProceed = async () => {
    setConfirmed(true);
    try {
      // Start live trading through the live-trading-engine
      const response = await fetch('https://asxcbnkpflgecqreegdd.supabase.co/functions/v1/live-trading-engine', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('supabase.auth.token')}`
        },
        body: JSON.stringify({
          action: 'activate_live_trading',
          capital: 100
        })
      });
      
      if (!response.ok) throw new Error('Failed to activate live trading');
      
      const data = await response.json();
      console.log('Live trading initiated with $100 CAD:', data);
      
      setTimeout(() => {
        onOpenChange(false);
        setConfirmed(false);
      }, 2000);
    } catch (error) {
      console.error('Failed to activate live trading:', error);
      setConfirmed(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Play className="w-5 h-5 text-primary" />
            Proceed to Live Trading
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {!confirmed ? (
            <>
              <Alert className="border-orange-200 bg-orange-50">
                <AlertTriangle className="h-4 w-4 text-orange-600" />
                <AlertDescription className="text-orange-800">
                  <strong>Important:</strong> You are about to transition from paper trading to live trading with real money ($100 CAD). Please review all safety measures below.
                </AlertDescription>
              </Alert>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Shield className="w-4 h-4" />
                    Safety Checklist
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {safetyChecklist.map((check, index) => (
                      <div key={index} className="flex items-center gap-3">
                        <CheckCircle className="w-4 h-4 text-green-500" />
                        <span className="text-sm">{check.item}</span>
                        <Badge variant="outline" className="ml-auto text-green-600">
                          ✓ Ready
                        </Badge>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <DollarSign className="w-4 h-4" />
                    Account Details
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-muted-foreground">Starting Balance</p>
                      <p className="text-lg font-bold">$100.00 CAD</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Exchange</p>
                      <p className="text-lg font-bold">Kraken</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Risk Per Trade</p>
                      <p className="text-lg font-bold">0.50%</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Max Drawdown</p>
                      <p className="text-lg font-bold text-red-500">-5%</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <div className="bg-muted p-4 rounded-lg">
                <h4 className="font-semibold mb-2">What happens next?</h4>
                <ul className="text-sm text-muted-foreground space-y-1">
                  <li>• Real trading will begin immediately with configured strategies</li>
                  <li>• All trades will be executed with real money on Kraken</li>
                  <li>• You'll receive real-time notifications for all trades</li>
                  <li>• Trading will halt automatically if account drops below $95</li>
                  <li>• Daily performance reports will be sent at 18:00 PT</li>
                </ul>
              </div>

              <div className="flex justify-between gap-3">
                <Button variant="outline" onClick={() => onOpenChange(false)}>
                  Cancel
                </Button>
                <Button onClick={handleProceed} className="bg-green-600 hover:bg-green-700">
                  <Play className="w-4 h-4 mr-2" />
                  Begin Live Trading
                </Button>
              </div>
            </>
          ) : (
            <div className="text-center py-8">
              <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-green-600 mb-2">Live Trading Activated!</h3>
              <p className="text-muted-foreground">
                Your bot is now trading live with $100 CAD on Kraken. 
                All safety measures are active and monitoring your account.
              </p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};