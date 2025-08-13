import React, { useState, Suspense, lazy } from "react";
import { RealTimeTradingDashboard } from "@/components/RealTimeTradingDashboard";
import { WebSocketManager } from "@/components/WebSocketManager";
import { MarketAnalysis } from "@/components/MarketAnalysis";
import { TradingDashboard } from "@/components/TradingDashboard";
import { PortfolioOverview } from "@/components/PortfolioOverview";
import { RiskManagement } from "@/components/RiskManagement";
import { NotificationCenter } from "@/components/NotificationCenter";
import { RealTimeMetrics } from "@/components/RealTimeMetrics";
import { BasicNotifications } from "@/components/BasicNotifications";
import { GlobalCommandPalette } from "@/components/GlobalCommandPalette";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/hooks/useAuth";
import { usePerformanceMonitor } from "@/hooks/usePerformanceMonitor";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingUp, BarChart3, Shield, Bell, Activity, Settings, Zap, Key } from "lucide-react";
import { APIKeyManager } from '@/components/APIKeyManager';
import { SecurityMonitor } from '@/components/SecurityMonitor';

// Lazy load heavy components for better performance
const AdvancedNotifications = lazy(() => import("@/components/AdvancedNotifications").then(module => ({ default: module.AdvancedNotifications })));
const PerformanceOptimizer = lazy(() => import("@/components/PerformanceOptimizer").then(module => ({ default: module.PerformanceOptimizer })));

const Index = () => {
  const { user, signOut } = useAuth();
  const [selectedPlatform, setSelectedPlatform] = useState("bybit");
  const { performanceData, markMilestone } = usePerformanceMonitor();

  // Mark performance milestone when component mounts
  React.useEffect(() => {
    markMilestone('index-page-load');
  }, [markMilestone]);

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <CardTitle className="flex items-center justify-center gap-2">
              <TrendingUp className="h-6 w-6" />
              Cloud Atlas Trading
            </CardTitle>
            <CardDescription>
              Advanced AI-powered trading platform with real-time market data
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-center text-muted-foreground">
              Please sign in to access the trading dashboard
            </p>
            <Button 
              className="w-full" 
              onClick={() => window.location.href = '/auth'}
            >
              Sign In
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <GlobalCommandPalette />
      
      <div className="border-b">
        <div className="flex h-16 items-center px-4">
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2">
              <TrendingUp className="h-6 w-6" />
              <h1 className="text-xl font-bold">Cloud Atlas Trading</h1>
            </div>
          </div>
          <div className="ml-auto flex items-center space-x-4">
            <span className="text-sm text-muted-foreground">
              Welcome, {user.email}
            </span>
            <Button variant="outline" size="sm" onClick={signOut}>
              Sign Out
            </Button>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-6">
        <Tabs defaultValue="dashboard" className="w-full">
          <TabsList className="grid w-full grid-cols-9">
            <TabsTrigger value="dashboard" className="flex items-center gap-2">
              <Activity className="h-4 w-4" />
              Dashboard
            </TabsTrigger>
            <TabsTrigger value="metrics" className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4" />
              Metrics
            </TabsTrigger>
            <TabsTrigger value="trading" className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              Trading
            </TabsTrigger>
            <TabsTrigger value="analysis" className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4" />
              Analysis
            </TabsTrigger>
            <TabsTrigger value="portfolio" className="flex items-center gap-2">
              <Shield className="h-4 w-4" />
              Portfolio
            </TabsTrigger>
            <TabsTrigger value="risk" className="flex items-center gap-2">
              <Shield className="h-4 w-4" />
              Risk
            </TabsTrigger>
            <TabsTrigger value="notifications" className="flex items-center gap-2">
              <Bell className="h-4 w-4" />
              Alerts
            </TabsTrigger>
            <TabsTrigger value="performance" className="flex items-center gap-2">
              <Zap className="h-4 w-4" />
              Performance
            </TabsTrigger>
            <TabsTrigger value="security" className="flex items-center gap-2">
              <Key className="h-4 w-4" />
              Security
            </TabsTrigger>
          </TabsList>

          <TabsContent value="dashboard" className="space-y-4">
            <RealTimeTradingDashboard />
            <WebSocketManager />
          </TabsContent>

          <TabsContent value="metrics" className="space-y-4">
            <RealTimeMetrics />
          </TabsContent>

          <TabsContent value="trading" className="space-y-4">
            <TradingDashboard />
          </TabsContent>

          <TabsContent value="analysis" className="space-y-4">
            <MarketAnalysis platform={selectedPlatform} />
          </TabsContent>

          <TabsContent value="portfolio" className="space-y-4">
            <PortfolioOverview />
          </TabsContent>

          <TabsContent value="risk" className="space-y-4">
            <RiskManagement />
          </TabsContent>

          <TabsContent value="notifications" className="space-y-4">
            <BasicNotifications />
            <NotificationCenter />
            <Suspense fallback={
              <Card>
                <CardContent className="p-6">
                  <div className="animate-pulse space-y-4">
                    <div className="h-4 bg-gray-200 rounded w-3/4"></div>
                    <div className="h-4 bg-gray-200 rounded w-1/2"></div>
                  </div>
                </CardContent>
              </Card>
            }>
              <AdvancedNotifications />
            </Suspense>
          </TabsContent>

          <TabsContent value="performance" className="space-y-4">
            <Suspense fallback={
              <Card>
                <CardContent className="p-6">
                  <div className="animate-pulse space-y-4">
                    <div className="h-4 bg-gray-200 rounded w-3/4"></div>
                    <div className="h-4 bg-gray-200 rounded w-1/2"></div>
                  </div>
                </CardContent>
              </Card>
            }>
              <PerformanceOptimizer />
            </Suspense>
          </TabsContent>

          <TabsContent value="security" className="space-y-4">
            <SecurityMonitor />
            <APIKeyManager />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default Index;
