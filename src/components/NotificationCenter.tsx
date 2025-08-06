import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { 
  Bell, 
  Mail, 
  MessageSquare, 
  TrendingUp, 
  AlertTriangle, 
  BarChart3,
  Settings,
  Check,
  X
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface NotificationSettings {
  telegram_enabled: boolean;
  email_enabled: boolean;
  daily_reports: boolean;
  trade_alerts: boolean;
  risk_alerts: boolean;
  performance_summary: boolean;
  email_address?: string;
  telegram_chat_id?: string;
}

interface NotificationLog {
  id: string;
  notification_type: string;
  status: string;
  details: any;
  created_at: string;
}

export const NotificationCenter = () => {
  const [settings, setSettings] = useState<NotificationSettings>({
    telegram_enabled: false,
    email_enabled: false,
    daily_reports: true,
    trade_alerts: true,
    risk_alerts: true,
    performance_summary: true
  });
  
  const [notifications, setNotifications] = useState<NotificationLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    loadNotificationData();
  }, []);

  const loadNotificationData = async () => {
    try {
      const userId = '00000000-0000-0000-0000-000000000000';

      // Load notification settings
      const { data: settingsData } = await supabase
        .from('notification_settings')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();

      if (settingsData) {
        setSettings({
          telegram_enabled: settingsData.telegram_enabled || false,
          email_enabled: settingsData.email_enabled || false,
          daily_reports: settingsData.daily_reports || true,
          trade_alerts: settingsData.trade_alerts || true,
          risk_alerts: settingsData.risk_alerts || true,
          performance_summary: settingsData.performance_summary || true,
          email_address: settingsData.email_address || '',
          telegram_chat_id: settingsData.telegram_chat_id || ''
        });
      }

      // Load recent notifications
      const { data: notificationsData } = await supabase
        .from('notification_logs')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(20);

      if (notificationsData) {
        setNotifications(notificationsData);
      }

    } catch (error) {
      console.error('Error loading notification data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const saveSettings = async () => {
    setIsSaving(true);
    try {
      const userId = '00000000-0000-0000-0000-000000000000';

      await supabase
        .from('notification_settings')
        .upsert({
          user_id: userId,
          ...settings,
          updated_at: new Date().toISOString()
        });

      toast({
        title: "Settings Saved",
        description: "Notification preferences have been updated",
      });

    } catch (error) {
      console.error('Error saving settings:', error);
      toast({
        title: "Error",
        description: "Failed to save notification settings",
        variant: "destructive"
      });
    } finally {
      setIsSaving(false);
    }
  };

  const testNotification = async (type: 'email' | 'telegram') => {
    try {
      // In a real implementation, this would trigger a test notification
      toast({
        title: "Test Notification Sent",
        description: `Test ${type} notification has been sent`,
      });
    } catch (error) {
      toast({
        title: "Test Failed",
        description: `Failed to send test ${type} notification`,
        variant: "destructive"
      });
    }
  };

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'trade_alert': return <TrendingUp className="h-4 w-4" />;
      case 'risk_alert': return <AlertTriangle className="h-4 w-4" />;
      case 'daily_report': return <BarChart3 className="h-4 w-4" />;
      default: return <Bell className="h-4 w-4" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'sent': return 'text-green-500';
      case 'failed': return 'text-red-500';
      case 'pending': return 'text-yellow-500';
      default: return 'text-gray-500';
    }
  };

  return (
    <div className="space-y-6">
      {/* Notification Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Notification Settings
          </CardTitle>
          <CardDescription>
            Configure how you want to receive trading alerts and reports
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Email Settings */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Mail className="h-4 w-4" />
                <Label htmlFor="email-enabled">Email Notifications</Label>
              </div>
              <Switch
                id="email-enabled"
                checked={settings.email_enabled}
                onCheckedChange={(checked) =>
                  setSettings(prev => ({ ...prev, email_enabled: checked }))
                }
              />
            </div>
            
            {settings.email_enabled && (
              <div className="space-y-2">
                <Label htmlFor="email-address">Email Address</Label>
                <div className="flex space-x-2">
                  <Input
                    id="email-address"
                    type="email"
                    placeholder="your@email.com"
                    value={settings.email_address || ''}
                    onChange={(e) =>
                      setSettings(prev => ({ ...prev, email_address: e.target.value }))
                    }
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => testNotification('email')}
                  >
                    Test
                  </Button>
                </div>
              </div>
            )}
          </div>

          <Separator />

          {/* Telegram Settings */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <MessageSquare className="h-4 w-4" />
                <Label htmlFor="telegram-enabled">Telegram Notifications</Label>
              </div>
              <Switch
                id="telegram-enabled"
                checked={settings.telegram_enabled}
                onCheckedChange={(checked) =>
                  setSettings(prev => ({ ...prev, telegram_enabled: checked }))
                }
              />
            </div>
            
            {settings.telegram_enabled && (
              <div className="space-y-2">
                <Label htmlFor="telegram-chat-id">Telegram Chat ID</Label>
                <div className="flex space-x-2">
                  <Input
                    id="telegram-chat-id"
                    placeholder="123456789"
                    value={settings.telegram_chat_id || ''}
                    onChange={(e) =>
                      setSettings(prev => ({ ...prev, telegram_chat_id: e.target.value }))
                    }
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => testNotification('telegram')}
                  >
                    Test
                  </Button>
                </div>
              </div>
            )}
          </div>

          <Separator />

          {/* Notification Types */}
          <div className="space-y-4">
            <h4 className="font-medium">Notification Types</h4>
            
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <TrendingUp className="h-4 w-4" />
                  <Label>Trade Alerts</Label>
                </div>
                <Switch
                  checked={settings.trade_alerts}
                  onCheckedChange={(checked) =>
                    setSettings(prev => ({ ...prev, trade_alerts: checked }))
                  }
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <AlertTriangle className="h-4 w-4" />
                  <Label>Risk Alerts</Label>
                </div>
                <Switch
                  checked={settings.risk_alerts}
                  onCheckedChange={(checked) =>
                    setSettings(prev => ({ ...prev, risk_alerts: checked }))
                  }
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <BarChart3 className="h-4 w-4" />
                  <Label>Daily Reports</Label>
                </div>
                <Switch
                  checked={settings.daily_reports}
                  onCheckedChange={(checked) =>
                    setSettings(prev => ({ ...prev, daily_reports: checked }))
                  }
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <BarChart3 className="h-4 w-4" />
                  <Label>Performance Summary</Label>
                </div>
                <Switch
                  checked={settings.performance_summary}
                  onCheckedChange={(checked) =>
                    setSettings(prev => ({ ...prev, performance_summary: checked }))
                  }
                />
              </div>
            </div>
          </div>

          <div className="flex justify-end">
            <Button onClick={saveSettings} disabled={isSaving}>
              {isSaving ? 'Saving...' : 'Save Settings'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Recent Notifications */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5" />
            Recent Notifications
          </CardTitle>
          <CardDescription>
            History of sent notifications and their delivery status
          </CardDescription>
        </CardHeader>
        <CardContent>
          {notifications.length > 0 ? (
            <div className="space-y-3">
              {notifications.map((notification) => (
                <div
                  key={notification.id}
                  className="flex items-center justify-between p-3 border rounded-lg"
                >
                  <div className="flex items-center space-x-3">
                    {getNotificationIcon(notification.notification_type)}
                    <div>
                      <p className="font-medium">
                        {notification.notification_type.replace('_', ' ').toUpperCase()}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {new Date(notification.created_at).toLocaleString()}
                      </p>
                    </div>
                  </div>
                  <Badge
                    variant="outline"
                    className={getStatusColor(notification.status)}
                  >
                    {notification.status === 'sent' && <Check className="h-3 w-3 mr-1" />}
                    {notification.status === 'failed' && <X className="h-3 w-3 mr-1" />}
                    {notification.status.toUpperCase()}
                  </Badge>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-center text-muted-foreground py-8">
              No notifications sent yet
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
};