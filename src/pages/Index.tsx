import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { CloudAtlasBot } from '@/components/CloudAtlasBot';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Bot, TrendingUp, LogIn } from 'lucide-react';

const Index = () => {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background to-background/80 flex items-center justify-center">
        <div className="text-center space-y-4">
          <Bot className="h-12 w-12 text-primary mx-auto animate-spin" />
          <p className="text-muted-foreground">Loading CloudAtlas Bot...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background to-background/80 flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center space-y-4">
            <div className="flex items-center justify-center gap-2">
              <Bot className="h-8 w-8 text-primary" />
              <span className="text-2xl font-bold">CloudAtlas Bot</span>
            </div>
            <CardTitle className="text-2xl">AI Trading Dashboard</CardTitle>
            <CardDescription>
              Access your personalized trading bot with advanced AI-driven strategies
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 gap-3 text-sm">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-primary" />
                <span>Real-time market analysis</span>
              </div>
              <div className="flex items-center gap-2">
                <Bot className="h-4 w-4 text-primary" />
                <span>Automated trading strategies</span>
              </div>
              <div className="flex items-center gap-2">
                <LogIn className="h-4 w-4 text-primary" />
                <span>Secure portfolio management</span>
              </div>
            </div>
            <Button 
              onClick={() => navigate('/auth')} 
              className="w-full"
              size="lg"
            >
              Access Trading Dashboard
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return <CloudAtlasBot />;
};

export default Index;
