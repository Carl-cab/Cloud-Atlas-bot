import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Key, Plus, Trash2, Shield, AlertTriangle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

const STORAGE_KEY = 'cloud_atlas_api_keys';

interface APIKey {
  id: string;
  exchange: string;
  exchange_name: string;
  api_key: string;
  api_secret: string;
  passphrase?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  access_count: number;
  failed_attempts: number;
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

const getExchangeName = (exchange: string) =>
  SUPPORTED_EXCHANGES.find(e => e.id === exchange)?.name || exchange.toUpperCase();

const requiresPassphrase = (exchange: string) =>
  SUPPORTED_EXCHANGES.find(e => e.id === exchange)?.requiresPassphrase || false;

const loadFromStorage = (): APIKey[] => {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  } catch {
    return [];
  }
};

const saveToStorage = (keys: APIKey[]) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(keys));
};

export const APIKeyManager = () => {
  const [apiKeys, setApiKeys] = useState<APIKey[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const { toast } = useToast();

  const [newKey, setNewKey] = useState<NewAPIKey>({
    exchange: '',
    api_key: '',
    api_secret: '',
    passphrase: ''
  });

  useEffect(() => {
    const loadKeys = async () => {
      // Try to load from Supabase first (source of truth)
      try {
        const { data, error } = await supabase.functions.invoke('secure-credentials', {
          body: { action: 'overview' }
        });
        if (!error && data?.success && Array.isArray(data.keys)) {
          const remoteKeys: APIKey[] = data.keys.map((k: any) => ({
            id: k.id,
            exchange: k.exchange,
            exchange_name: k.exchange_name || getExchangeName(k.exchange),
            api_key: '••••••••',
            api_secret: '••••••••',
            is_active: k.is_active,
            created_at: k.created_at,
            updated_at: k.updated_at,
            access_count: k.access_count || 0,
            failed_attempts: k.failed_attempts || 0
          }));
          saveToStorage(remoteKeys);
          setApiKeys(remoteKeys);
          setIsLoading(false);
          return;
        }
      } catch {
        // Fall through to localStorage
      }
      setApiKeys(loadFromStorage());
      setIsLoading(false);
    };
    loadKeys();
  }, []);

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

      const now = new Date().toISOString();
      let entryId = crypto.randomUUID();

      if (session) {
        // Persist securely server-side when authenticated
        const { data, error } = await supabase.functions.invoke('secure-credentials', {
          body: {
            action: 'store',
            exchange: newKey.exchange,
            api_key: newKey.api_key,
            api_secret: newKey.api_secret,
            passphrase: requiresPassphrase(newKey.exchange) ? newKey.passphrase : undefined
          }
        });
        if (error) throw error;
        if (!data?.success) throw new Error(data?.error || 'Failed to store credentials');
        if (data.id) entryId = data.id;
      }

      const entry: APIKey = {
        id: entryId,
        exchange: newKey.exchange,
        exchange_name: getExchangeName(newKey.exchange),
        api_key: session ? '••••••••' : newKey.api_key,
        api_secret: session ? '••••••••' : newKey.api_secret,
        passphrase: requiresPassphrase(newKey.exchange) ? (session ? '••••••••' : newKey.passphrase) : undefined,
        is_active: true,
        created_at: now,
        updated_at: now,
        access_count: 0,
        failed_attempts: 0
      };

      const existing = loadFromStorage();
      const filtered = existing.filter(k => k.exchange !== newKey.exchange);
      const updated = [...filtered, entry];
      saveToStorage(updated);
      setApiKeys(updated);

      setShowAddDialog(false);
      setNewKey({ exchange: '', api_key: '', api_secret: '', passphrase: '' });

      toast({
        title: "API Key Saved",
        description: `${getExchangeName(newKey.exchange)} API key has been securely stored`,
      });
    } catch (err: any) {
      toast({
        title: "Failed to Save API Key",
        description: err.message || "An error occurred",
        variant: "destructive"
      });
    } finally {
      setIsAdding(false);
    }
  };

  const toggleAPIKey = async (id: string) => {
    const key = apiKeys.find(k => k.id === id);
    if (!key) return;
    const newActive = !key.is_active;

    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
      try {
        const { data, error } = await supabase.functions.invoke('secure-credentials', {
          body: { action: 'toggle', key_id: id, active: newActive }
        });
        if (error) throw error;
        if (!data?.success) throw new Error(data?.error || 'Failed to update key');
      } catch (err: any) {
        toast({
          title: "Failed to Update Key",
          description: err.message || "An error occurred",
          variant: "destructive"
        });
        return;
      }
    }

    const updated = apiKeys.map(k =>
      k.id === id ? { ...k, is_active: newActive, updated_at: new Date().toISOString() } : k
    );
    saveToStorage(updated);
    setApiKeys(updated);
  };

  const deleteAPIKey = async (id: string, exchange: string) => {
    if (!confirm(`Are you sure you want to delete the ${exchange} API key? This action cannot be undone.`)) return;

    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
      try {
        const { data, error } = await supabase.functions.invoke('secure-credentials', {
          body: { action: 'delete', key_id: id }
        });
        if (error) throw error;
        if (!data?.success) throw new Error(data?.error || 'Failed to delete key');
      } catch (err: any) {
        toast({
          title: "Failed to Delete Key",
          description: err.message || "An error occurred",
          variant: "destructive"
        });
        return;
      }
    }

    const updated = apiKeys.filter(k => k.id !== id);
    saveToStorage(updated);
    setApiKeys(updated);
    toast({
      title: "API Key Deleted",
      description: `${exchange} API key has been removed`,
    });
  };

  if (isLoading) return null;

  return (
    <div className="space-y-6">
      <Alert>
        <Shield className="h-4 w-4" />
        <AlertDescription>
          API keys are stored locally in your browser. Never grant withdrawal permissions to trading API keys.
        </AlertDescription>
      </Alert>

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
                  <Button variant="outline" onClick={() => setShowAddDialog(false)}>
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
                        <h4 className="font-medium">{key.exchange_name}</h4>
                        <p className="text-sm text-muted-foreground">
                          Added {new Date(key.created_at).toLocaleDateString()}
                        </p>
                      </div>
                      <Badge variant={key.is_active ? 'default' : 'secondary'}>
                        {key.is_active ? 'Active' : 'Inactive'}
                      </Badge>
                    </div>
                  </div>

                  <div className="flex items-center space-x-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => toggleAPIKey(key.id)}
                    >
                      {key.is_active ? 'Disable' : 'Enable'}
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => deleteAPIKey(key.id, key.exchange_name)}
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
