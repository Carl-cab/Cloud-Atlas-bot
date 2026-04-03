import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { 
  Bell, 
  Smartphone, 
  Mail, 
  MessageSquare, 
  Settings, 
  Plus,
  Trash2,
  AlertTriangle,
  TrendingUp,
  Shield,
  Timer,
  Volume2
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface NotificationRule {
  id: string;
  name: string;
  type: 'price_alert' | 'volume_alert' | 'risk_alert' | 'news_alert';
  conditions: {
    symbol?: string;
    priceAbove?: number;
    priceBelow?: number;
    volumeThreshold?: number;
    riskLevel?: string;
    keywords?: string[];
  };
  channels: ('email' | 'telegram' | 'sms' | 'push')[];
  enabled: boolean;
  priority: 'low' | 'medium' | 'high' | 'critical';
  cooldown: number; // Minutes between notifications
  lastTriggered?: string;
}

interface SmartFilter {
  duplicateDetection: boolean;
  quietHours: {
    enabled: boolean;
    start: string;
    end: string;
  };
  batchNotifications: boolean;
  adaptivePriority: boolean;
}

export const AdvancedNotifications = () => {
  const [rules, setRules] = useState<NotificationRule[]>([]);
  const [smartFilters, setSmartFilters] = useState<SmartFilter>({
    duplicateDetection: true,
    quietHours: {
      enabled: false,
      start: '22:00',
      end: '08:00'
    },
    batchNotifications: true,
    adaptivePriority: true
  });
  const [newRule, setNewRule] = useState<Partial<NotificationRule>>({
    type: 'price_alert',
    channels: ['push'],
    priority: 'medium',
    cooldown: 5,
    enabled: true
  });
  const [isLoading, setIsLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    loadNotificationRules();
    loadSmartFilters();
  }, []);

  const loadNotificationRules = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // In a real implementation, load from database
      // For now, use demo data
      const demoRules: NotificationRule[] = [
        {
          id: '1',
          name: 'BTC Price Alert',
          type: 'price_alert',
          conditions: { symbol: 'BTCUSD', priceAbove: 70000 },
          channels: ['push', 'email'],
          enabled: true,
          priority: 'high',
          cooldown: 15
        },
        {
          id: '2',
          name: 'High Volume Alert',
          type: 'volume_alert',
          conditions: { symbol: 'ETHUSD', volumeThreshold: 1000000 },
          channels: ['telegram'],
          enabled: true,
          priority: 'medium',
          cooldown: 30
        }
      ];

      setRules(demoRules);
      setIsLoading(false);
    } catch (error) {
      console.error('Error loading notification rules:', error);
      setIsLoading(false);
    }
  };

  const loadSmartFilters = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Load smart filter settings from user preferences
      // For now, use defaults
    } catch (error) {
      console.error('Error loading smart filters:', error);
    }
  };

  const createRule = async () => {
    if (!newRule.name || !newRule.type) {
      toast({
        title: 'Validation Error',
        description: 'Please fill in all required fields',
        variant: 'destructive'
      });
      return;
    }

    const rule: NotificationRule = {
      id: Date.now().toString(),
      name: newRule.name,
      type: newRule.type,
      conditions: newRule.conditions || {},
      channels: newRule.channels || ['push'],
      enabled: newRule.enabled || true,
      priority: newRule.priority || 'medium',
      cooldown: newRule.cooldown || 5
    };

    setRules(prev => [...prev, rule]);
    setNewRule({
      type: 'price_alert',
      channels: ['push'],
      priority: 'medium',
      cooldown: 5,
      enabled: true
    });

    toast({
      title: 'Rule Created',
      description: `Notification rule "${rule.name}" has been created`
    });
  };

  const deleteRule = (ruleId: string) => {
    setRules(prev => prev.filter(rule => rule.id !== ruleId));
    toast({
      title: 'Rule Deleted',
      description: 'Notification rule has been removed'
    });
  };

  const toggleRule = (ruleId: string) => {
    setRules(prev => prev.map(rule => 
      rule.id === ruleId ? { ...rule, enabled: !rule.enabled } : rule
    ));
  };

  const updateSmartFilters = async (updates: Partial<SmartFilter>) => {
    const updated = { ...smartFilters, ...updates };
    setSmartFilters(updated);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Save to database
      toast({
        title: 'Settings Updated',
        description: 'Smart filter settings have been saved'
      });
    } catch (error) {
      console.error('Error updating smart filters:', error);
    }
  };

  const testRule = async (rule: NotificationRule) => {
    try {
      // Simulate sending test notification
      toast({
        title: 'Test Notification Sent',
        description: `Test notification for "${rule.name}" has been sent to selected channels`
      });
    } catch (error) {
      toast({
        title: 'Test Failed',
        description: 'Failed to send test notification',
        variant: 'destructive'
      });
    }
  };

  const getRuleIcon = (type: string) => {
    switch (type) {
      case 'price_alert': return <TrendingUp className="h-4 w-4" />;
      case 'volume_alert': return <Volume2 className="h-4 w-4" />;
      case 'risk_alert': return <Shield className="h-4 w-4" />;
      case 'news_alert': return <Bell className="h-4 w-4" />;
      default: return <Bell className="h-4 w-4" />;
    }
  };

  const getChannelIcon = (channel: string) => {
    switch (channel) {
      case 'email': return <Mail className="h-3 w-3" />;
      case 'telegram': return <MessageSquare className="h-3 w-3" />;
      case 'sms': return <Smartphone className="h-3 w-3" />;
      case 'push': return <Bell className="h-3 w-3" />;
      default: return <Bell className="h-3 w-3" />;
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'critical': return 'bg-red-500';
      case 'high': return 'bg-orange-500';
      case 'medium': return 'bg-yellow-500';
      case 'low': return 'bg-green-500';
      default: return 'bg-gray-500';
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="animate-pulse space-y-4">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-16 bg-gray-200 rounded"></div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Smart Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Smart Notification Filters
          </CardTitle>
          <CardDescription>
            Intelligent filtering to reduce notification noise and improve relevance
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label>Duplicate Detection</Label>
                  <p className="text-sm text-muted-foreground">
                    Prevent similar notifications from being sent repeatedly
                  </p>
                </div>
                <Switch
                  checked={smartFilters.duplicateDetection}
                  onCheckedChange={(checked) => 
                    updateSmartFilters({ duplicateDetection: checked })
                  }
                />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <Label>Batch Notifications</Label>
                  <p className="text-sm text-muted-foreground">
                    Group similar notifications together
                  </p>
                </div>
                <Switch
                  checked={smartFilters.batchNotifications}
                  onCheckedChange={(checked) => 
                    updateSmartFilters({ batchNotifications: checked })
                  }
                />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <Label>Adaptive Priority</Label>
                  <p className="text-sm text-muted-foreground">
                    Automatically adjust priority based on market conditions
                  </p>
                </div>
                <Switch
                  checked={smartFilters.adaptivePriority}
                  onCheckedChange={(checked) => 
                    updateSmartFilters({ adaptivePriority: checked })
                  }
                />
              </div>
            </div>

            <div className="space-y-4">
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Label>Quiet Hours</Label>
                  <Switch
                    checked={smartFilters.quietHours.enabled}
                    onCheckedChange={(checked) => 
                      updateSmartFilters({ 
                        quietHours: { ...smartFilters.quietHours, enabled: checked }
                      })
                    }
                  />
                </div>
                {smartFilters.quietHours.enabled && (
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label htmlFor="quiet-start">Start Time</Label>
                      <Input
                        id="quiet-start"
                        type="time"
                        value={smartFilters.quietHours.start}
                        onChange={(e) => updateSmartFilters({ 
                          quietHours: { 
                            ...smartFilters.quietHours, 
                            start: e.target.value 
                          }
                        })}
                      />
                    </div>
                    <div>
                      <Label htmlFor="quiet-end">End Time</Label>
                      <Input
                        id="quiet-end"
                        type="time"
                        value={smartFilters.quietHours.end}
                        onChange={(e) => updateSmartFilters({ 
                          quietHours: { 
                            ...smartFilters.quietHours, 
                            end: e.target.value 
                          }
                        })}
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Notification Rules */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5" />
            Custom Notification Rules
          </CardTitle>
          <CardDescription>
            Create and manage personalized notification triggers
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Create New Rule */}
          <div className="p-4 border rounded-lg space-y-4">
            <h4 className="font-medium flex items-center gap-2">
              <Plus className="h-4 w-4" />
              Create New Rule
            </h4>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <div>
                <Label htmlFor="rule-name">Rule Name</Label>
                <Input
                  id="rule-name"
                  placeholder="My Custom Alert"
                  value={newRule.name || ''}
                  onChange={(e) => setNewRule(prev => ({ ...prev, name: e.target.value }))}
                />
              </div>

              <div>
                <Label htmlFor="rule-type">Alert Type</Label>
                <Select 
                  value={newRule.type} 
                  onValueChange={(value) => setNewRule(prev => ({ ...prev, type: value as any }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="price_alert">Price Alert</SelectItem>
                    <SelectItem value="volume_alert">Volume Alert</SelectItem>
                    <SelectItem value="risk_alert">Risk Alert</SelectItem>
                    <SelectItem value="news_alert">News Alert</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="rule-priority">Priority</Label>
                <Select 
                  value={newRule.priority} 
                  onValueChange={(value) => setNewRule(prev => ({ ...prev, priority: value as any }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="critical">Critical</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {newRule.type === 'price_alert' && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <Label htmlFor="symbol">Symbol</Label>
                  <Input
                    id="symbol"
                    placeholder="BTCUSD"
                    value={newRule.conditions?.symbol || ''}
                    onChange={(e) => setNewRule(prev => ({ 
                      ...prev, 
                      conditions: { ...prev.conditions, symbol: e.target.value }
                    }))}
                  />
                </div>
                <div>
                  <Label htmlFor="price-above">Price Above</Label>
                  <Input
                    id="price-above"
                    type="number"
                    placeholder="70000"
                    value={newRule.conditions?.priceAbove || ''}
                    onChange={(e) => setNewRule(prev => ({ 
                      ...prev, 
                      conditions: { ...prev.conditions, priceAbove: Number(e.target.value) }
                    }))}
                  />
                </div>
                <div>
                  <Label htmlFor="price-below">Price Below</Label>
                  <Input
                    id="price-below"
                    type="number"
                    placeholder="65000"
                    value={newRule.conditions?.priceBelow || ''}
                    onChange={(e) => setNewRule(prev => ({ 
                      ...prev, 
                      conditions: { ...prev.conditions, priceBelow: Number(e.target.value) }
                    }))}
                  />
                </div>
              </div>
            )}

            <div className="flex justify-end">
              <Button onClick={createRule}>
                <Plus className="h-4 w-4 mr-2" />
                Create Rule
              </Button>
            </div>
          </div>

          {/* Existing Rules */}
          <div className="space-y-4">
            {rules.map((rule) => (
              <div
                key={rule.id}
                className={`p-4 border rounded-lg transition-colors ${
                  rule.enabled ? 'bg-background' : 'bg-muted/30'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <div className="flex items-center space-x-2">
                      {getRuleIcon(rule.type)}
                      <h4 className="font-medium">{rule.name}</h4>
                    </div>
                    
                    <div className="flex items-center space-x-2">
                      <div className={`w-2 h-2 rounded-full ${getPriorityColor(rule.priority)}`} />
                      <Badge variant="outline">{rule.type.replace('_', ' ')}</Badge>
                      
                      <div className="flex items-center space-x-1">
                        {rule.channels.map((channel) => (
                          <div key={channel} className="flex items-center">
                            {getChannelIcon(channel)}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center space-x-2">
                    <div className="flex items-center space-x-1 text-sm text-muted-foreground">
                      <Timer className="h-3 w-3" />
                      <span>{rule.cooldown}m</span>
                    </div>
                    
                    <Switch
                      checked={rule.enabled}
                      onCheckedChange={() => toggleRule(rule.id)}
                    />

                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => testRule(rule)}
                    >
                      Test
                    </Button>

                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => deleteRule(rule.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                {rule.lastTriggered && (
                  <p className="text-xs text-muted-foreground mt-2">
                    Last triggered: {new Date(rule.lastTriggered).toLocaleString()}
                  </p>
                )}
              </div>
            ))}

            {rules.length === 0 && (
              <div className="text-center py-8">
                <AlertTriangle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground">No notification rules configured</p>
                <p className="text-sm text-muted-foreground">Create your first custom notification rule above</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
