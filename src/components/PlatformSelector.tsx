import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Check, ExternalLink, Wifi, WifiOff } from 'lucide-react';

interface Platform {
  id: string;
  name: string;
  description: string;
  status: 'connected' | 'disconnected' | 'pending';
  features: string[];
  logo: string;
}

interface PlatformSelectorProps {
  selectedPlatform: string;
  onPlatformChange: (platform: string) => void;
}

export const PlatformSelector = ({ selectedPlatform, onPlatformChange }: PlatformSelectorProps) => {
  const [platforms] = useState<Platform[]>([
    {
      id: 'binance',
      name: 'Binance',
      description: 'World\'s largest crypto exchange',
      status: 'connected',
      features: ['Spot Trading', 'Futures', 'Options', 'Staking'],
      logo: '🟡'
    },
    {
      id: 'coinbase',
      name: 'Coinbase Pro',
      description: 'Professional trading platform',
      status: 'disconnected',
      features: ['Spot Trading', 'Advanced Orders', 'API Access'],
      logo: '🔵'
    },
    {
      id: 'kraken',
      name: 'Kraken',
      description: 'Secure and reliable exchange',
      status: 'connected',
      features: ['Spot Trading', 'Margin Trading', 'Futures'],
      logo: '🟣'
    },
    {
      id: 'bybit',
      name: 'Bybit',
      description: 'Derivatives trading platform',
      status: 'pending',
      features: ['Derivatives', 'Spot Trading', 'Copy Trading'],
      logo: '🟠'
    }
  ]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'connected': return 'bg-success text-success-foreground';
      case 'disconnected': return 'bg-muted text-muted-foreground';
      case 'pending': return 'bg-primary text-primary-foreground';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'connected': return <Wifi className="w-3 h-3" />;
      case 'disconnected': return <WifiOff className="w-3 h-3" />;
      case 'pending': return <div className="w-3 h-3 rounded-full bg-primary animate-trading-pulse" />;
      default: return <WifiOff className="w-3 h-3" />;
    }
  };

  return (
    <Card className="card-shadow">
      <CardHeader>
        <CardTitle>Trading Platforms</CardTitle>
        <CardDescription>
          Select and manage your connected trading platforms
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {platforms.map((platform) => (
          <div
            key={platform.id}
            className={`p-4 border rounded-lg cursor-pointer transition-all hover:shadow-md ${
              selectedPlatform === platform.id ? 'border-primary bg-primary/5' : ''
            }`}
            onClick={() => onPlatformChange(platform.id)}
          >
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-3">
                <span className="text-2xl">{platform.logo}</span>
                <div>
                  <h4 className="font-semibold flex items-center gap-2">
                    {platform.name}
                    {selectedPlatform === platform.id && (
                      <Check className="w-4 h-4 text-primary" />
                    )}
                  </h4>
                  <p className="text-sm text-muted-foreground">
                    {platform.description}
                  </p>
                </div>
              </div>
              
              <Badge className={getStatusColor(platform.status)}>
                {getStatusIcon(platform.status)}
                <span className="ml-1 capitalize">{platform.status}</span>
              </Badge>
            </div>

            <div className="flex flex-wrap gap-2 mb-3">
              {platform.features.map((feature) => (
                <Badge key={feature} variant="outline" className="text-xs">
                  {feature}
                </Badge>
              ))}
            </div>

            <div className="flex gap-2">
              {platform.status === 'connected' ? (
                <Button variant="outline" size="sm" className="text-xs">
                  Configure
                </Button>
              ) : (
                <Button variant="trading" size="sm" className="text-xs">
                  Connect
                </Button>
              )}
              
              <Button variant="ghost" size="sm" className="text-xs">
                <ExternalLink className="w-3 h-3" />
              </Button>
            </div>
          </div>
        ))}

        <Button variant="outline" className="w-full">
          Add New Platform
        </Button>
      </CardContent>
    </Card>
  );
};