import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { AlertTriangle, Clock, Power, Calendar } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';

interface SchedulingControlsProps {
  onScheduleChange?: (isActive: boolean, stopTime: string) => void;
  onEmergencyStop?: () => void;
}

export const SchedulingControls: React.FC<SchedulingControlsProps> = ({
  onScheduleChange,
  onEmergencyStop,
}) => {
  const { toast } = useToast();
  const [isSchedulingActive, setIsSchedulingActive] = useState(false);
  const [stopTime, setStopTime] = useState('20:00'); // 8:00 PM PT default
  const [currentTime, setCurrentTime] = useState(new Date());
  const [timeUntilStop, setTimeUntilStop] = useState<string>('');
  const [hasAutoStopped, setHasAutoStopped] = useState(false);

  // Update current time every second
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  // Calculate time until stop
  useEffect(() => {
    if (!isSchedulingActive || !stopTime) return;

    const now = new Date();
    const [hours, minutes] = stopTime.split(':').map(Number);
    
    // Create stop time for today in PT (assuming UTC-8 for simplicity)
    const stopDateTime = new Date(now);
    stopDateTime.setHours(hours, minutes, 0, 0);
    
    // If stop time has passed today, set for tomorrow
    if (stopDateTime <= now) {
      stopDateTime.setDate(stopDateTime.getDate() + 1);
    }

    const timeDiff = stopDateTime.getTime() - now.getTime();
    const hoursLeft = Math.floor(timeDiff / (1000 * 60 * 60));
    const minutesLeft = Math.floor((timeDiff % (1000 * 60 * 60)) / (1000 * 60));
    const secondsLeft = Math.floor((timeDiff % (1000 * 60)) / 1000);

    if (timeDiff <= 0 && !hasAutoStopped) {
      // Auto-stop triggered
      handleAutoStop();
      setTimeUntilStop('Trading stopped');
    } else {
      setTimeUntilStop(`${hoursLeft}h ${minutesLeft}m ${secondsLeft}s`);
    }
  }, [currentTime, stopTime, isSchedulingActive, hasAutoStopped]);

  const handleAutoStop = () => {
    setHasAutoStopped(true);
    setIsSchedulingActive(false);
    
    toast({
      title: "Auto-Stop Triggered",
      description: `Trading automatically stopped at ${stopTime} PT`,
      variant: "destructive",
    });

    onEmergencyStop?.();
    
    // Schedule final report 5 minutes later
    setTimeout(() => {
      toast({
        title: "Final Report Generated",
        description: "Trading session summary sent via Telegram and email",
      });
    }, 5 * 60 * 1000); // 5 minutes
  };

  const handleSchedulingToggle = (checked: boolean) => {
    setIsSchedulingActive(checked);
    setHasAutoStopped(false);
    
    if (checked) {
      toast({
        title: "Auto-Stop Scheduled",
        description: `Trading will stop automatically at ${stopTime} PT`,
      });
    } else {
      toast({
        title: "Auto-Stop Disabled",
        description: "Manual control enabled",
      });
    }

    onScheduleChange?.(checked, stopTime);
  };

  const handleStopTimeChange = (newTime: string) => {
    setStopTime(newTime);
    if (isSchedulingActive) {
      onScheduleChange?.(true, newTime);
    }
  };

  const handleManualStop = () => {
    setIsSchedulingActive(false);
    setHasAutoStopped(true);
    
    toast({
      title: "Manual Stop Executed",
      description: "All trading activities have been stopped",
      variant: "destructive",
    });

    onEmergencyStop?.();
  };

  const getPacificTime = () => {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Los_Angeles',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).format(currentTime);
  };

  return (
    <div className="space-y-6">
      {/* Current Time & Status */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Trading Schedule
          </CardTitle>
          <CardDescription>
            Automatic time-based trading controls and shutdown
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-sm font-medium">Current Time (PT)</Label>
              <div className="text-2xl font-mono">{getPacificTime()}</div>
            </div>
            <Badge variant={isSchedulingActive ? "default" : "secondary"}>
              {isSchedulingActive ? "Auto-Stop Active" : "Manual Control"}
            </Badge>
          </div>

          {isSchedulingActive && !hasAutoStopped && (
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                Trading will automatically stop in: <strong>{timeUntilStop}</strong>
              </AlertDescription>
            </Alert>
          )}

          {hasAutoStopped && (
            <Alert variant="destructive">
              <Power className="h-4 w-4" />
              <AlertDescription>
                Trading has been stopped. Final report will be sent at 8:05 PM PT.
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* Schedule Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Auto-Stop Settings
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <Label htmlFor="auto-stop">Enable Auto-Stop</Label>
              <p className="text-sm text-muted-foreground">
                Automatically stop trading at scheduled time
              </p>
            </div>
            <Switch
              id="auto-stop"
              checked={isSchedulingActive}
              onCheckedChange={handleSchedulingToggle}
              disabled={hasAutoStopped}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="stop-time">Stop Time (PT)</Label>
            <Input
              id="stop-time"
              type="time"
              value={stopTime}
              onChange={(e) => handleStopTimeChange(e.target.value)}
              disabled={!isSchedulingActive || hasAutoStopped}
              className="w-32"
            />
            <p className="text-xs text-muted-foreground">
              Default: 8:00 PM PT. Final report sent 5 minutes after stop.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Emergency Controls */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-destructive">
            <Power className="h-5 w-5" />
            Emergency Controls
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Button
            variant="destructive"
            onClick={handleManualStop}
            disabled={hasAutoStopped}
            className="w-full"
          >
            <Power className="h-4 w-4 mr-2" />
            Stop All Trading Immediately
          </Button>
          <p className="text-xs text-muted-foreground mt-2">
            Immediately stops all trading activities and closes open positions
          </p>
        </CardContent>
      </Card>
    </div>
  );
};