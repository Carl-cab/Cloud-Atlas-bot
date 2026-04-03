import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertTriangle, Pause, Shield, Clock } from "lucide-react";
import { useState } from "react";

interface EmergencyStopModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const EmergencyStopModal = ({ open, onOpenChange }: EmergencyStopModalProps) => {
  const [emergencyStopActivated, setEmergencyStopActivated] = useState(false);
  const [positions, setPositions] = useState([
    { pair: "BTC/CAD", side: "LONG", size: 0.0011, pnl: "+$12.45", status: "open" },
    { pair: "ETH/CAD", side: "SHORT", size: 0.029, pnl: "-$5.20", status: "open" },
    { pair: "SOL/CAD", side: "LONG", size: 0.204, pnl: "+$8.30", status: "open" }
  ]);

  const handleEmergencyStop = () => {
    setEmergencyStopActivated(true);
    // Simulate closing positions
    setTimeout(() => {
      setPositions(prev => prev.map(pos => ({ ...pos, status: "closed" })));
    }, 2000);
  };

  const handleResumeTrading = () => {
    setEmergencyStopActivated(false);
    setPositions(prev => prev.map(pos => ({ ...pos, status: "open" })));
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-red-600">
            <AlertTriangle className="w-5 h-5" />
            Emergency Stop Control Panel
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {!emergencyStopActivated ? (
            <Alert className="border-red-200 bg-red-50">
              <AlertTriangle className="h-4 w-4 text-red-600" />
              <AlertDescription className="text-red-800">
                <strong>Warning:</strong> Emergency stop will immediately halt all trading activity and close open positions at market price. This action cannot be undone.
              </AlertDescription>
            </Alert>
          ) : (
            <Alert className="border-orange-200 bg-orange-50">
              <Pause className="h-4 w-4 text-orange-600" />
              <AlertDescription className="text-orange-800">
                <strong>Emergency Stop Activated:</strong> All trading has been halted. Positions are being closed safely.
              </AlertDescription>
            </Alert>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="w-4 h-4" />
                Current Positions Status
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {positions.map((position, index) => (
                  <div key={index} className="flex items-center justify-between p-3 border rounded-lg">
                    <div className="flex items-center gap-3">
                      <Badge variant={position.side === 'LONG' ? 'default' : 'secondary'}>
                        {position.side}
                      </Badge>
                      <span className="font-medium">{position.pair}</span>
                      <span className="text-sm text-muted-foreground">Size: {position.size}</span>
                    </div>
                    
                    <div className="flex items-center gap-3">
                      <span className={`font-medium ${
                        position.pnl.startsWith('+') ? 'text-green-500' : 'text-red-500'
                      }`}>
                        {position.pnl}
                      </span>
                      <Badge variant={
                        position.status === 'open' ? 'outline' : 
                        position.status === 'closed' ? 'default' : 'secondary'
                      }>
                        {position.status === 'open' ? 'Open' : 
                         position.status === 'closed' ? 'Closed' : 'Closing...'}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>

              {positions.length === 0 && (
                <div className="text-center py-8 text-muted-foreground">
                  <Shield className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p>No open positions</p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Safety Measures</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center gap-2">
                <Shield className="w-4 h-4 text-green-500" />
                <span className="text-sm">All new trade signals will be ignored</span>
              </div>
              <div className="flex items-center gap-2">
                <Shield className="w-4 h-4 text-green-500" />
                <span className="text-sm">Open positions closed at best available market price</span>
              </div>
              <div className="flex items-center gap-2">
                <Shield className="w-4 h-4 text-green-500" />
                <span className="text-sm">All pending orders cancelled immediately</span>
              </div>
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-blue-500" />
                <span className="text-sm">Notifications sent to all configured channels</span>
              </div>
            </CardContent>
          </Card>

          <div className="flex justify-between gap-3">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            
            <div className="flex gap-3">
              {emergencyStopActivated && (
                <Button variant="outline" onClick={handleResumeTrading}>
                  Resume Trading
                </Button>
              )}
              
              <Button 
                variant="destructive" 
                onClick={handleEmergencyStop}
                disabled={emergencyStopActivated}
              >
                {emergencyStopActivated ? (
                  <>
                    <Pause className="w-4 h-4 mr-2" />
                    Emergency Stop Active
                  </>
                ) : (
                  <>
                    <AlertTriangle className="w-4 h-4 mr-2" />
                    Activate Emergency Stop
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};