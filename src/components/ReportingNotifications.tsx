import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Switch } from '@/components/ui/switch';
import { Progress } from '@/components/ui/progress';
import { 
  Send, 
  Mail, 
  MessageSquare, 
  Bell, 
  Calendar, 
  TrendingUp, 
  TrendingDown, 
  DollarSign,
  AlertTriangle,
  CheckCircle,
  Clock,
  Download,
  Settings,
  Zap,
  BarChart3,
  Target,
  Shield
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

interface TradingStats {
  total_trades: number;
  successful_trades: number;
  total_pnl: number;
  daily_pnl: number;
  win_rate: number;
  avg_trade_duration: string;
  portfolio_value: number;
  risk_score: number;
}

export const ReportingNotifications = () => {
  const { toast } = useToast();
  const [settings, setSettings] = useState<NotificationSettings>({
    telegram_enabled: false,
    email_enabled: false,
    daily_reports: true,
    trade_alerts: true,
    risk_alerts: true,
    performance_summary: true,
  });
  
  const [stats, setStats] = useState<TradingStats>({
    total_trades: 47,
    successful_trades: 32,
    total_pnl: 1245.88,
    daily_pnl: 89.32,
    win_rate: 68.1,
    avg_trade_duration: "2h 34m",
    portfolio_value: 12458.32,
    risk_score: 7.2
  });

  const [isLoading, setIsLoading] = useState(false);
  const [testEmailAddress, setTestEmailAddress] = useState('');
  const [reportType, setReportType] = useState('daily');
  const [customMessage, setCustomMessage] = useState('');

  useEffect(() => {
    fetchNotificationSettings();
    fetchTradingStats();
  }, []);

  const fetchNotificationSettings = async () => {
    try {
      const user = await supabase.auth.getUser();
      if (!user.data.user) return;

      // Use direct query instead of typed query to avoid type issues
      const { data, error } = await supabase
        .rpc('get_notification_settings', { p_user_id: user.data.user.id });

      if (error) {
        console.log('No existing settings found, using defaults');
        return;
      }

      if (data && data.length > 0) {
        const settingsData = data[0];
        setSettings({
          telegram_enabled: settingsData.telegram_enabled || false,
          email_enabled: settingsData.email_enabled || false,
          daily_reports: settingsData.daily_reports !== false,
          trade_alerts: settingsData.trade_alerts !== false,
          risk_alerts: settingsData.risk_alerts !== false,
          performance_summary: settingsData.performance_summary !== false,
          email_address: settingsData.email_address,
          telegram_chat_id: settingsData.telegram_chat_id,
        });
      }
    } catch (error) {
      console.error('Error fetching notification settings:', error);
    }
  };

  const fetchTradingStats = async () => {
    try {
      const user = await supabase.auth.getUser();
      if (!user.data.user) return;

      // This would typically fetch from your trading analytics
      // For now, we'll simulate the data
      setStats({
        total_trades: 47,
        successful_trades: 32,
        total_pnl: 1245.88,
        daily_pnl: 89.32,
        win_rate: 68.1,
        avg_trade_duration: "2h 34m",
        portfolio_value: 12458.32,
        risk_score: 7.2
      });
    } catch (error) {
      console.error('Error fetching trading stats:', error);
    }
  };

  const saveNotificationSettings = async () => {
    setIsLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('User not authenticated');
      }

      // Use secure notification settings endpoint
      const response = await supabase.functions.invoke('secure-notification-settings', {
        body: { 
          action: 'store',
          settings: {
            telegram_enabled: settings.telegram_enabled,
            email_enabled: settings.email_enabled,
            daily_reports: settings.daily_reports,
            trade_alerts: settings.trade_alerts,
            risk_alerts: settings.risk_alerts,
            performance_summary: settings.performance_summary,
            email_address: settings.email_address,
            telegram_chat_id: settings.telegram_chat_id
          }
        },
        headers: {
          Authorization: `Bearer ${session.access_token}`
        }
      });

      if (response.error || !response.data?.success) {
        throw new Error(response.data?.error || 'Failed to save notification settings');
      }

      toast({
        title: "Settings Saved",
        description: "Notification preferences have been updated successfully",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to save notification settings",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const sendTestNotification = async (type: 'telegram' | 'email') => {
    setIsLoading(true);
    try {
      const user = await supabase.auth.getUser();
      if (!user.data.user) throw new Error('User not authenticated');

      const { data, error } = await supabase.functions.invoke('notification-engine', {
        body: {
          action: 'send_test',
          type,
          user_id: user.data.user.id,
          email: type === 'email' ? testEmailAddress : undefined,
          message: customMessage || 'This is a test notification from CloudAtlasBot!'
        }
      });

      if (error) throw error;

      if (data?.success) {
        toast({
          title: "Test Sent",
          description: `Test ${type} notification sent successfully`,
        });
      }
    } catch (error) {
      toast({
        title: "Test Failed",
        description: `Failed to send test ${type} notification`,
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const generateReport = async () => {
    setIsLoading(true);
    try {
      const user = await supabase.auth.getUser();
      if (!user.data.user) throw new Error('User not authenticated');

      const { data, error } = await supabase.functions.invoke('notification-engine', {
        body: {
          action: 'generate_report',
          user_id: user.data.user.id,
          report_type: reportType,
          send_telegram: settings.telegram_enabled,
          send_email: settings.email_enabled,
          email: settings.email_address
        }
      });

      if (error) throw error;

      if (data?.success) {
        toast({
          title: "Report Generated",
          description: `${reportType.charAt(0).toUpperCase() + reportType.slice(1)} report has been generated and sent`,
        });
      }
    } catch (error) {
      toast({
        title: "Report Failed",
        description: "Failed to generate report",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const getRiskScoreColor = (score: number) => {
    if (score <= 3) return 'text-green-500';
    if (score <= 7) return 'text-yellow-500';
    return 'text-red-500';
  };

  const getRiskScoreText = (score: number) => {
    if (score <= 3) return 'Low Risk';
    if (score <= 7) return 'Medium Risk';
    return 'High Risk';
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <Bell className="h-8 w-8 text-primary" />
          <div>
            <h2 className="text-2xl font-bold">Reporting & Notifications</h2>
            <p className="text-muted-foreground">Automated reports and real-time alerts via Telegram and Email</p>
          </div>
        </div>
        
        <div className="flex items-center space-x-2">
          <Badge variant={settings.telegram_enabled ? 'default' : 'secondary'}>
            <MessageSquare className="h-3 w-3 mr-1" />
            Telegram {settings.telegram_enabled ? 'On' : 'Off'}
          </Badge>
          <Badge variant={settings.email_enabled ? 'default' : 'secondary'}>
            <Mail className="h-3 w-3 mr-1" />
            Email {settings.email_enabled ? 'On' : 'Off'}
          </Badge>
        </div>
      </div>

      {/* Performance Overview */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Win Rate</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-primary">
              {stats.win_rate}%
            </div>
            <Progress value={stats.win_rate} className="mt-2" />
            <p className="text-xs text-muted-foreground mt-1">
              {stats.successful_trades}/{stats.total_trades} trades
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Daily P&L</CardTitle>
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${stats.daily_pnl >= 0 ? 'text-green-500' : 'text-red-500'}`}>
              ${Math.abs(stats.daily_pnl).toFixed(2)}
            </div>
            <p className="text-xs text-muted-foreground">
              {stats.daily_pnl >= 0 ? '+' : '-'} {((stats.daily_pnl / stats.portfolio_value) * 100).toFixed(2)}%
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Portfolio Value</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-primary">
              ${stats.portfolio_value.toFixed(2)}
            </div>
            <p className="text-xs text-muted-foreground">
              Total P&L: +${stats.total_pnl.toFixed(2)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Risk Score</CardTitle>
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${getRiskScoreColor(stats.risk_score)}`}>
              {stats.risk_score}/10
            </div>
            <p className={`text-xs ${getRiskScoreColor(stats.risk_score)}`}>
              {getRiskScoreText(stats.risk_score)}
            </p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="settings" className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="settings">Settings</TabsTrigger>
          <TabsTrigger value="reports">Generate Reports</TabsTrigger>
          <TabsTrigger value="test">Test Notifications</TabsTrigger>
          <TabsTrigger value="history">Report History</TabsTrigger>
        </TabsList>

        <TabsContent value="settings" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <Settings className="h-5 w-5" />
                  <span>Notification Channels</span>
                </CardTitle>
                <CardDescription>Configure your notification preferences</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <MessageSquare className="h-4 w-4 text-blue-500" />
                    <div>
                      <Label className="text-sm font-medium">Telegram Notifications</Label>
                      <p className="text-xs text-muted-foreground">Receive alerts via Telegram bot</p>
                    </div>
                  </div>
                  <Switch
                    checked={settings.telegram_enabled}
                    onCheckedChange={(checked) => setSettings(prev => ({ ...prev, telegram_enabled: checked }))}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <Mail className="h-4 w-4 text-green-500" />
                    <div>
                      <Label className="text-sm font-medium">Email Notifications</Label>
                      <p className="text-xs text-muted-foreground">Receive reports via email</p>
                    </div>
                  </div>
                  <Switch
                    checked={settings.email_enabled}
                    onCheckedChange={(checked) => setSettings(prev => ({ ...prev, email_enabled: checked }))}
                  />
                </div>

                {settings.email_enabled && (
                  <div>
                    <Label>Email Address</Label>
                    <Input
                      type="email"
                      value={settings.email_address || ''}
                      onChange={(e) => setSettings(prev => ({ ...prev, email_address: e.target.value }))}
                      placeholder="your.email@example.com"
                    />
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <Bell className="h-5 w-5" />
                  <span>Alert Types</span>
                </CardTitle>
                <CardDescription>Choose what notifications to receive</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <Calendar className="h-4 w-4 text-purple-500" />
                    <div>
                      <Label className="text-sm font-medium">Daily Reports</Label>
                      <p className="text-xs text-muted-foreground">Daily trading performance summary</p>
                    </div>
                  </div>
                  <Switch
                    checked={settings.daily_reports}
                    onCheckedChange={(checked) => setSettings(prev => ({ ...prev, daily_reports: checked }))}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <Target className="h-4 w-4 text-blue-500" />
                    <div>
                      <Label className="text-sm font-medium">Trade Alerts</Label>
                      <p className="text-xs text-muted-foreground">Real-time trade execution notifications</p>
                    </div>
                  </div>
                  <Switch
                    checked={settings.trade_alerts}
                    onCheckedChange={(checked) => setSettings(prev => ({ ...prev, trade_alerts: checked }))}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <Shield className="h-4 w-4 text-red-500" />
                    <div>
                      <Label className="text-sm font-medium">Risk Alerts</Label>
                      <p className="text-xs text-muted-foreground">High-risk situation warnings</p>
                    </div>
                  </div>
                  <Switch
                    checked={settings.risk_alerts}
                    onCheckedChange={(checked) => setSettings(prev => ({ ...prev, risk_alerts: checked }))}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <BarChart3 className="h-4 w-4 text-green-500" />
                    <div>
                      <Label className="text-sm font-medium">Performance Summary</Label>
                      <p className="text-xs text-muted-foreground">Weekly performance reports</p>
                    </div>
                  </div>
                  <Switch
                    checked={settings.performance_summary}
                    onCheckedChange={(checked) => setSettings(prev => ({ ...prev, performance_summary: checked }))}
                  />
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="flex justify-end">
            <Button onClick={saveNotificationSettings} disabled={isLoading}>
              {isLoading ? <Clock className="h-4 w-4 mr-2 animate-spin" /> : <CheckCircle className="h-4 w-4 mr-2" />}
              Save Settings
            </Button>
          </div>
        </TabsContent>

        <TabsContent value="reports" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <BarChart3 className="h-5 w-5" />
                <span>Generate Custom Report</span>
              </CardTitle>
              <CardDescription>Create and send trading performance reports</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label>Report Type</Label>
                  <Select value={reportType} onValueChange={setReportType}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="daily">Daily Summary</SelectItem>
                      <SelectItem value="weekly">Weekly Performance</SelectItem>
                      <SelectItem value="monthly">Monthly Analysis</SelectItem>
                      <SelectItem value="custom">Custom Period</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-end">
                  <Button onClick={generateReport} disabled={isLoading} className="w-full">
                    {isLoading ? <Clock className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
                    Generate & Send Report
                  </Button>
                </div>
              </div>

              <div className="p-4 bg-muted rounded-lg">
                <h4 className="font-medium mb-2">Report will include:</h4>
                <ul className="text-sm text-muted-foreground space-y-1">
                  <li>• Trading performance metrics</li>
                  <li>• Profit/Loss breakdown</li>
                  <li>• Risk analysis summary</li>
                  <li>• Top performing strategies</li>
                  <li>• Market exposure details</li>
                </ul>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="test" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <MessageSquare className="h-5 w-5" />
                  <span>Test Telegram</span>
                </CardTitle>
                <CardDescription>Send a test message to your Telegram</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label>Custom Message</Label>
                  <Textarea
                    value={customMessage}
                    onChange={(e) => setCustomMessage(e.target.value)}
                    placeholder="Enter a custom test message..."
                  />
                </div>

                <Button 
                  onClick={() => sendTestNotification('telegram')} 
                  disabled={isLoading || !settings.telegram_enabled}
                  className="w-full"
                >
                  {isLoading ? <Clock className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
                  Send Test to Telegram
                </Button>

                {!settings.telegram_enabled && (
                  <Alert>
                    <AlertTriangle className="h-4 w-4" />
                    <AlertDescription>
                      Enable Telegram notifications in settings to test
                    </AlertDescription>
                  </Alert>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <Mail className="h-5 w-5" />
                  <span>Test Email</span>
                </CardTitle>
                <CardDescription>Send a test report to your email</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label>Email Address</Label>
                  <Input
                    type="email"
                    value={testEmailAddress}
                    onChange={(e) => setTestEmailAddress(e.target.value)}
                    placeholder="test@example.com"
                  />
                </div>

                <Button 
                  onClick={() => sendTestNotification('email')} 
                  disabled={isLoading || !testEmailAddress}
                  className="w-full"
                >
                  {isLoading ? <Clock className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
                  Send Test Email
                </Button>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="history" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Clock className="h-5 w-5" />
                <span>Recent Reports</span>
              </CardTitle>
              <CardDescription>History of generated reports and notifications</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {[
                  { type: 'Daily Report', time: '2 hours ago', status: 'sent', channel: 'Telegram + Email' },
                  { type: 'Risk Alert', time: '4 hours ago', status: 'sent', channel: 'Telegram' },
                  { type: 'Trade Alert', time: '6 hours ago', status: 'sent', channel: 'Telegram' },
                  { type: 'Weekly Summary', time: '1 day ago', status: 'sent', channel: 'Email' },
                  { type: 'Risk Alert', time: '2 days ago', status: 'failed', channel: 'Email' },
                ].map((report, index) => (
                  <div key={index} className="flex items-center justify-between p-3 border rounded">
                    <div className="flex items-center space-x-3">
                      <div className={`w-2 h-2 rounded-full ${report.status === 'sent' ? 'bg-green-500' : 'bg-red-500'}`} />
                      <div>
                        <div className="font-medium">{report.type}</div>
                        <div className="text-sm text-muted-foreground">{report.time} • {report.channel}</div>
                      </div>
                    </div>
                    <Badge variant={report.status === 'sent' ? 'default' : 'destructive'}>
                      {report.status}
                    </Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};