import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Key, Plus, Eye, EyeOff, Trash2, Shield, AlertTriangle, CheckCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface APIKey {
  id: string;
  exchange: string;
  exchange_name?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  last_accessed?: string;
  access_count: number;
  failed_attempts: number;
  locked_until?: string;
  security_status?: string;
  status_display?: string;
}

interface NewAPIKey {
  exchange: string;
  api_key: string;
  api_secret: string;
  passphrase?: string;
}

const SUPPORTED_EXCHANGES = [
  { id: 'kraken', name: 'Kraken', requiresPassphrase: false },
  { id: 'binance', name: 'Binance', requiresPassphrase: false },
  { id: 'coinbase', name: 'Coinbase Pro', requiresPassphrase: true },
  { id: 'bybit', name: 'Bybit', requiresPassphrase: false },
  { id: 'okx', name: 'OKX', requiresPassphrase: true }
];

export const APIKeyManager = () => {
  const [apiKeys, setApiKeys] = useState<APIKey[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showSecrets, setShowSecrets] = useState<Record<string, boolean>>({});
  const [isAdding, setIsAdding] = useState(false);
  const { toast } = useToast();

  const [newKey, setNewKey] = useState<NewAPIKey>({
    exchange: '',
    api_key: '',
    api_secret: '',
    passphrase: ''
  });

  useEffect(() => {
    loadAPIKeys();
  }, []);

  const loadAPIKeys = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast({ title: "Authentication required", variant: "destructive" });
        return;
      }
      
      // Use secure credentials endpoint to get overview
      const response = await supabase.functions.invoke('secure-credentials', {
        body: { action: 'overview' },
        headers: {
          Authorization: `Bearer ${session.access_token}`
        }
      });

      if (response.error || !response.data?.success) {
        throw new Error(response.data?.error || 'Failed to load API keys');
      }

      setApiKeys(response.data.keys || []);
    } catch (error) {
      console.error('Error loading API keys:', error);
      toast({
        title: "Error",
        description: "Failed to load API keys",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const addAPIKey = async () => {
    if (!newKey.exchange || !newKey.api_key || !newKey.api_secret) {
      toast({
        title: "Validation Error",
        description: "Please fill in all required fields",
        variant: "destructive"
      });
      return;
    }

    setIsAdding(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast({ title: "Authentication required", variant: "destructive" });
        return;
      }
      
      // Use secure credentials endpoint to store encrypted keys
      const response = await supabase.functions.invoke('secure-credentials', {
        body: {
          action: 'store',
          exchange: newKey.exchange,
          api_key: newKey.api_key,
          api_secret: newKey.api_secret,
          passphrase: requiresPassphrase(newKey.exchange) ? newKey.passphrase : undefined
        },
        headers: {
          Authorization: `Bearer ${session.access_token}`
        }
      });

      if (response.error || !response.data?.success) {
        throw new Error(response.data?.error || 'Failed to store API key');
      }

      await loadAPIKeys();
      setShowAddDialog(false);
      setNewKey({ exchange: '', api_key: '', api_secret: '', passphrase: '' });
      
      toast({
        title: "API Key Added",
        description: `${getExchangeName(newKey.exchange)} API key has been securely encrypted and stored`,
      });

    } catch (error) {
      console.error('Error adding API key:', error);
      toast({
        title: "Error",
        description: "Failed to add API key. Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsAdding(false);
    }
  };

  const toggleAPIKey = async (id: string, currentStatus: boolean) => {
    try {
      const { error } = await supabase
        .from('api_keys')
        .update({ is_active: !currentStatus })
        .eq('id', id);

      if (error) throw error;
      await loadAPIKeys();
      
      toast({
        title: currentStatus ? "API Key Disabled" : "API Key Enabled",
        description: `API key has been ${currentStatus ? 'disabled' : 'enabled'}`,
      });

    } catch (error) {
      console.error('Error toggling API key:', error);
      toast({
        title: "Error",
        description: "Failed to update API key status",
        variant: "destructive"
      });
    }
  };

  const deleteAPIKey = async (id: string, exchange: string) => {
    if (!confirm(`Are you sure you want to delete the ${exchange} API key?`)) {
      return;
    }

    try {
      const { error } = await supabase
        .from('api_keys')
        .delete()
        .eq('id', id);

      if (error) throw error;
      await loadAPIKeys();
      
      toast({
        title: "API Key Deleted",
        description: `${exchange} API key has been removed`,
      });

    } catch (error) {
      console.error('Error deleting API key:', error);
      toast({
        title: "Error",
        description: "Failed to delete API key",
        variant: "destructive"
      });
    }
  };

  const toggleSecretVisibility = (keyId: string) => {
    setShowSecrets(prev => ({
      ...prev,
      [keyId]: !prev[keyId]
    }));
  };

  const maskSecret = (secret: string) => {
    if (secret.length <= 8) return '••••••••';
    return secret.substring(0, 4) + '••••••••' + secret.substring(secret.length - 4);
  };

  const getExchangeName = (exchange: string) => {
    return SUPPORTED_EXCHANGES.find(e => e.id === exchange)?.name || exchange.toUpperCase();
  };

  const requiresPassphrase = (exchange: string) => {
    return SUPPORTED_EXCHANGES.find(e => e.id === exchange)?.requiresPassphrase || false;
  };

  return (
    <div className="space-y-6">
      {/* Security Notice */}
      <Alert>
        <Shield className="h-4 w-4" />
        <AlertDescription>
          <strong>Security:</strong> All API keys are encrypted and stored securely. 
          Never share your API keys or secrets with anyone.
        </AlertDescription>
      </Alert>

      {/* API Keys List */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Key className="h-5 w-5" />
                Exchange API Keys
              </CardTitle>
              <CardDescription>
                Manage your exchange API credentials for automated trading
              </CardDescription>
            </div>
            <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="h-4 w-4 mr-2" />
                  Add API Key
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Add Exchange API Key</DialogTitle>
                  <DialogDescription>
                    Add your exchange API credentials to enable automated trading
                  </DialogDescription>
                </DialogHeader>
                
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="exchange">Exchange</Label>
                    <Select
                      value={newKey.exchange}
                      onValueChange={(value) => setNewKey(prev => ({ ...prev, exchange: value }))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select an exchange" />
                      </SelectTrigger>
                      <SelectContent>
                        {SUPPORTED_EXCHANGES.map((exchange) => (
                          <SelectItem key={exchange.id} value={exchange.id}>
                            {exchange.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label htmlFor="api-key">API Key</Label>
                    <Input
                      id="api-key"
                      type="password"
                      placeholder="Enter your API key"
                      value={newKey.api_key}
                      onChange={(e) => setNewKey(prev => ({ ...prev, api_key: e.target.value }))}
                    />
                  </div>

                  <div>
                    <Label htmlFor="api-secret">API Secret</Label>
                    <Input
                      id="api-secret"
                      type="password"
                      placeholder="Enter your API secret"
                      value={newKey.api_secret}
                      onChange={(e) => setNewKey(prev => ({ ...prev, api_secret: e.target.value }))}
                    />
                  </div>

                  {newKey.exchange && requiresPassphrase(newKey.exchange) && (
                    <div>
                      <Label htmlFor="passphrase">Passphrase</Label>
                      <Input
                        id="passphrase"
                        type="password"
                        placeholder="Enter your passphrase"
                        value={newKey.passphrase}
                        onChange={(e) => setNewKey(prev => ({ ...prev, passphrase: e.target.value }))}
                      />
                    </div>
                  )}

                  <Alert>
                    <AlertTriangle className="h-4 w-4" />
                    <AlertDescription>
                      Make sure your API key has only the necessary permissions for trading.
                      Never grant withdrawal permissions.
                    </AlertDescription>
                  </Alert>
                </div>

                <DialogFooter>
                  <Button
                    variant="outline"
                    onClick={() => setShowAddDialog(false)}
                  >
                    Cancel
                  </Button>
                  <Button onClick={addAPIKey} disabled={isAdding}>
                    {isAdding ? 'Adding...' : 'Add API Key'}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent>
          {apiKeys.length > 0 ? (
            <div className="space-y-4">
              {apiKeys.map((key) => (
                <div
                  key={key.id}
                  className="flex items-center justify-between p-4 border rounded-lg"
                >
                  <div className="flex-1">
                    <div className="flex items-center space-x-3">
                      <div>
                        <h4 className="font-medium">{key.exchange_name || getExchangeName(key.exchange)}</h4>
                        <p className="text-sm text-muted-foreground">
                          {key.security_status === 'Requires Re-encryption' ? 'Security Update Required' : 
                           `Added ${new Date(key.created_at).toLocaleDateString()}`}
                        </p>
                      </div>
                      <Badge
                        variant={key.is_active && key.security_status === 'Securely Encrypted' ? 'default' : 
                                key.security_status === 'Requires Re-encryption' ? 'destructive' : 'secondary'}
                      >
                        {key.security_status === 'Securely Encrypted' ? (
                          <>
                            <CheckCircle className="h-3 w-3 mr-1" />
                            Secure
                          </>
                        ) : key.security_status === 'Requires Re-encryption' ? (
                          <>
                            <AlertTriangle className="h-3 w-3 mr-1" />
                            Update Required
                          </>
                        ) : (
                          'Inactive'
                        )}
                      </Badge>
                    </div>
                    
                    <div className="mt-2 space-y-1">
                      <div className="flex items-center space-x-2">
                        <span className="text-xs text-muted-foreground">Status:</span>
                        <code className="text-xs bg-muted px-1 rounded">
                          {key.security_status || 'Unknown'}
                        </code>
                        {key.security_status === 'Requires Re-encryption' && (
                          <span className="text-xs text-destructive">
                            Please re-enter your API key for enhanced security
                          </span>
                        )}
                      </div>
                      
                      {/* Security Status Indicators */}
                      <div className="flex items-center space-x-4 text-xs">
                        {key.locked_until && new Date(key.locked_until) > new Date() && (
                          <Badge variant="destructive" className="text-xs">
                            <AlertTriangle className="h-3 w-3 mr-1" />
                            Locked until {new Date(key.locked_until).toLocaleString()}
                          </Badge>
                        )}
                        {key.failed_attempts > 0 && (
                          <span className="text-destructive">
                            Failed attempts: {key.failed_attempts}
                          </span>
                        )}
                        {key.access_count > 0 && (
                          <span className="text-muted-foreground">
                            Used {key.access_count} times
                          </span>
                        )}
                        {key.last_accessed && (
                          <span className="text-muted-foreground">
                            Last used: {new Date(key.last_accessed).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center space-x-2">
                    {key.security_status === 'Requires Re-encryption' ? (
                      <Button
                        variant="default"
                        size="sm"
                        onClick={() => {
                          // Pre-fill the form with the exchange to make re-entry easier
                          setNewKey(prev => ({ ...prev, exchange: key.exchange }));
                          setShowAddDialog(true);
                        }}
                      >
                        Update Key
                      </Button>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => toggleAPIKey(key.id, key.is_active)}
                        disabled={key.security_status !== 'Securely Encrypted'}
                      >
                        {key.is_active ? 'Disable' : 'Enable'}
                      </Button>
                    )}
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => deleteAPIKey(key.id, key.exchange)}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8">
              <Key className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
              <p className="text-muted-foreground">
                No API keys configured yet. Add your first exchange API key to get started.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};