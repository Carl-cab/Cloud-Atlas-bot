import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { 
  Bell, 
  BellOff, 
  AlertTriangle, 
  TrendingUp, 
  TrendingDown, 
  CheckCircle, 
  Info,
  X,
  Settings
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface Notification {
  id: string;
  type: 'price_alert' | 'trade_execution' | 'system' | 'market_regime';
  title: string;
  message: string;
  severity: 'info' | 'warning' | 'success' | 'error';
  timestamp: string;
  read: boolean;
  symbol?: string;
  price?: number;
}

interface NotificationSettings {
  price_alerts: boolean;
  trade_executions: boolean;
  system_notifications: boolean;
  market_regime_changes: boolean;
  email_notifications: boolean;
}

export const BasicNotifications = () => {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [settings, setSettings] = useState<NotificationSettings>({
    price_alerts: true,
    trade_executions: true,
    system_notifications: true,
    market_regime_changes: true,
    email_notifications: false
  });
  const [unreadCount, setUnreadCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    loadNotifications();
    loadSettings();
    
    // Set up real-time notifications
    const notificationChannel = supabase
      .channel('notifications-changes')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notification_queue'
        },
        (payload) => {
          const newItem = payload.new;
          const newNotification: Notification = {
            id: newItem.id,
            type: newItem.type as 'price_alert' | 'trade_execution' | 'system' | 'market_regime',
            title: newItem.title,
            message: newItem.message,
            severity: (newItem.priority === 'high' ? 'error' : newItem.priority === 'medium' ? 'warning' : 'info') as 'info' | 'warning' | 'success' | 'error',
            timestamp: newItem.created_at,
            read: newItem.read || false
          };
          setNotifications(prev => [newNotification, ...prev]);
          setUnreadCount(prev => prev + 1);
          
          // Show toast for new notifications
          showNotificationToast(newNotification);
        }
      )
      .subscribe();

    // Simulate some notifications for demo
    setTimeout(() => {
      generateDemoNotifications();
    }, 2000);

    return () => {
      supabase.removeChannel(notificationChannel);
    };
  }, []);

  const loadNotifications = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('notification_queue')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;

      // Transform notification_queue data to match our interface
      const transformedNotifications: Notification[] = (data || []).map(item => ({
        id: item.id,
        type: item.type as 'price_alert' | 'trade_execution' | 'system' | 'market_regime',
        title: item.title,
        message: item.message,
        severity: (item.priority === 'high' ? 'error' : item.priority === 'medium' ? 'warning' : 'info') as 'info' | 'warning' | 'success' | 'error',
        timestamp: item.created_at,
        read: item.read || false
      }));

      setNotifications(transformedNotifications);
      setUnreadCount(transformedNotifications.filter(n => !n.read).length);
      setIsLoading(false);
    } catch (error) {
      console.error('Error loading notifications:', error);
      setIsLoading(false);
    }
  };

  const loadSettings = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('notification_settings')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();

      if (data) {
        setSettings({
          price_alerts: data.trade_alerts || true,
          trade_executions: data.trade_alerts || true,
          system_notifications: true,
          market_regime_changes: true,
          email_notifications: data.email_enabled || false
        });
      }
    } catch (error) {
      console.error('Error loading settings:', error);
    }
  };

  const generateDemoNotifications = async () => {
    const demoNotifications: Omit<Notification, 'id'>[] = [
      {
        type: 'price_alert',
        title: 'Price Alert Triggered',
        message: 'BTC/USD has reached your target price of $65,000',
        severity: 'success',
        timestamp: new Date().toISOString(),
        read: false,
        symbol: 'BTCUSD',
        price: 65000
      },
      {
        type: 'trade_execution',
        title: 'Trade Executed',
        message: 'Successfully bought 0.1 BTC at $64,850',
        severity: 'success',
        timestamp: new Date(Date.now() - 300000).toISOString(),
        read: false,
        symbol: 'BTCUSD'
      },
      {
        type: 'market_regime',
        title: 'Market Regime Change',
        message: 'Market has shifted from Range to Trend (85% confidence)',
        severity: 'info',
        timestamp: new Date(Date.now() - 600000).toISOString(),
        read: false
      },
      {
        type: 'system',
        title: 'System Status',
        message: 'All systems operational - 99.9% uptime maintained',
        severity: 'info',
        timestamp: new Date(Date.now() - 900000).toISOString(),
        read: true
      }
    ];

    setNotifications(prev => [...demoNotifications.map((n, i) => ({ ...n, id: `demo-${i}` })), ...prev]);
    setUnreadCount(prev => prev + demoNotifications.filter(n => !n.read).length);
  };

  const showNotificationToast = (notification: Notification) => {
    const variant = notification.severity === 'error' ? 'destructive' : 'default';
    
    toast({
      title: notification.title,
      description: notification.message,
      variant
    });
  };

  const markAsRead = async (notificationId: string) => {
    try {
      setNotifications(prev => 
        prev.map(n => 
          n.id === notificationId ? { ...n, read: true } : n
        )
      );
      
      setUnreadCount(prev => Math.max(0, prev - 1));

      // In a real app, update database
      // await supabase
      //   .from('notifications')
      //   .update({ read: true })
      //   .eq('id', notificationId);
    } catch (error) {
      console.error('Error marking notification as read:', error);
    }
  };

  const markAllAsRead = async () => {
    try {
      setNotifications(prev => prev.map(n => ({ ...n, read: true })));
      setUnreadCount(0);

      // In a real app, update database
      // const { data: { user } } = await supabase.auth.getUser();
      // if (user) {
      //   await supabase
      //     .from('notifications')
      //     .update({ read: true })
      //     .eq('user_id', user.id)
      //     .eq('read', false);
      // }
    } catch (error) {
      console.error('Error marking all notifications as read:', error);
    }
  };

  const deleteNotification = (notificationId: string) => {
    setNotifications(prev => prev.filter(n => n.id !== notificationId));
    setUnreadCount(prev => {
      const notification = notifications.find(n => n.id === notificationId);
      return notification && !notification.read ? Math.max(0, prev - 1) : prev;
    });
  };

  const updateSetting = async (key: keyof NotificationSettings, value: boolean) => {
    const newSettings = { ...settings, [key]: value };
    setSettings(newSettings);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Map to existing notification_settings structure
      const mappedSettings = {
        telegram_enabled: false,
        email_enabled: newSettings.email_notifications,
        daily_reports: newSettings.system_notifications,
        trade_alerts: newSettings.trade_executions || newSettings.price_alerts,
        risk_alerts: newSettings.system_notifications,
        performance_summary: newSettings.system_notifications
      };

      await supabase.functions.invoke('notification-engine', {
        body: {
          action: 'update_settings',
          userId: user.id,
          settings: mappedSettings
        }
      });

      toast({
        title: 'Settings Updated',
        description: 'Notification preferences have been saved'
      });
    } catch (error) {
      console.error('Error updating settings:', error);
      toast({
        title: 'Settings Error',
        description: 'Failed to update notification settings',
        variant: 'destructive'
      });
    }
  };

  const getNotificationIcon = (type: string, severity: string) => {
    switch (type) {
      case 'price_alert':
        return severity === 'success' ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />;
      case 'trade_execution':
        return <CheckCircle className="h-4 w-4" />;
      case 'system':
        return severity === 'error' ? <AlertTriangle className="h-4 w-4" /> : <Info className="h-4 w-4" />;
      case 'market_regime':
        return <TrendingUp className="h-4 w-4" />;
      default:
        return <Bell className="h-4 w-4" />;
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'success': return 'text-green-500';
      case 'warning': return 'text-yellow-500';
      case 'error': return 'text-red-500';
      default: return 'text-blue-500';
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="animate-pulse space-y-4">
            {[1, 2, 3].map(i => (
              <div key={i} className="flex space-x-4">
                <div className="rounded-full bg-gray-200 h-10 w-10"></div>
                <div className="space-y-2 flex-1">
                  <div className="h-4 bg-gray-200 rounded w-3/4"></div>
                  <div className="h-3 bg-gray-200 rounded w-1/2"></div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Notification Header */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Bell className="h-5 w-5" />
                Notifications
                {unreadCount > 0 && (
                  <Badge variant="destructive">{unreadCount}</Badge>
                )}
              </CardTitle>
              <CardDescription>
                Stay updated with real-time trading alerts and system notifications
              </CardDescription>
            </div>
            
            <div className="flex items-center space-x-2">
              <Button 
                variant="outline" 
                size="sm"
                onClick={markAllAsRead}
                disabled={unreadCount === 0}
              >
                Mark All Read
              </Button>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Notification Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Notification Settings
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">Price Alerts</p>
                <p className="text-sm text-muted-foreground">Get notified when price targets are reached</p>
              </div>
              <Switch
                checked={settings.price_alerts}
                onCheckedChange={(checked) => updateSetting('price_alerts', checked)}
              />
            </div>
            
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">Trade Executions</p>
                <p className="text-sm text-muted-foreground">Notifications for completed trades</p>
              </div>
              <Switch
                checked={settings.trade_executions}
                onCheckedChange={(checked) => updateSetting('trade_executions', checked)}
              />
            </div>
            
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">Market Regime Changes</p>
                <p className="text-sm text-muted-foreground">Alerts when market conditions change</p>
              </div>
              <Switch
                checked={settings.market_regime_changes}
                onCheckedChange={(checked) => updateSetting('market_regime_changes', checked)}
              />
            </div>
            
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">System Notifications</p>
                <p className="text-sm text-muted-foreground">Important system status updates</p>
              </div>
              <Switch
                checked={settings.system_notifications}
                onCheckedChange={(checked) => updateSetting('system_notifications', checked)}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Notification List */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Notifications</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {notifications.length > 0 ? (
              notifications.map((notification) => (
                <div
                  key={notification.id}
                  className={`flex items-start space-x-4 p-4 border rounded-lg transition-colors ${
                    !notification.read ? 'bg-primary/5 border-primary/20' : 'bg-background'
                  }`}
                >
                  <div className={getSeverityColor(notification.severity)}>
                    {getNotificationIcon(notification.type, notification.severity)}
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <h4 className="font-medium">{notification.title}</h4>
                      <div className="flex items-center space-x-2">
                        {!notification.read && (
                          <Badge variant="outline" className="text-xs">NEW</Badge>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => deleteNotification(notification.id)}
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                    
                    <p className="text-sm text-muted-foreground mt-1">
                      {notification.message}
                    </p>
                    
                    <div className="flex items-center justify-between mt-2">
                      <div className="flex items-center space-x-2">
                        <Badge variant="outline">{notification.type.replace('_', ' ')}</Badge>
                        {notification.symbol && (
                          <Badge variant="secondary">{notification.symbol}</Badge>
                        )}
                      </div>
                      
                      <span className="text-xs text-muted-foreground">
                        {new Date(notification.timestamp).toLocaleTimeString()}
                      </span>
                    </div>
                    
                    {!notification.read && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="mt-2"
                        onClick={() => markAsRead(notification.id)}
                      >
                        Mark as Read
                      </Button>
                    )}
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center py-8">
                <BellOff className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground">No notifications yet</p>
                <p className="text-sm text-muted-foreground">
                  You'll receive alerts for trades, price changes, and system updates
                </p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};