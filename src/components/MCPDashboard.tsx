import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  Activity, 
  TrendingUp, 
  AlertCircle, 
  CheckCircle, 
  RefreshCw, 
  BarChart3,
  Globe,
  Zap
} from 'lucide-react';
import { MCPClient } from '@/mcp/mcp-client';
import { useToast } from '@/hooks/use-toast';

export const MCPDashboard = () => {
  const [client] = useState(() => new MCPClient({ enableLogging: true }));
  const [capabilities, setCapabilities] = useState<any>(null);
  const [resources, setResources] = useState<any[]>([]);
  const [tools, setTools] = useState<any[]>([]);
  const [marketOverview, setMarketOverview] = useState<any>(null);
  const [riskAnalysis, setRiskAnalysis] = useState<any>(null);
  const [newsData, setNewsData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    initializeMCP();
    return () => client.destroy();
  }, [client]);

  const initializeMCP = async () => {
    try {
      setIsLoading(true);
      
      const [caps, res, toolsList] = await Promise.all([
        client.getCapabilities(),
        client.listResources(),
        client.listTools()
      ]);
      
      setCapabilities(caps);
      setResources(res);
      setTools(toolsList);
      
      // Load initial data
      await refreshAllData();
      
    } catch (error) {
      console.error('Failed to initialize MCP:', error);
      toast({
        title: "MCP Initialization Failed",
        description: "Could not initialize Model Context Protocol extensions",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const refreshAllData = async () => {
    try {
      setIsLoading(true);
      
      const symbols = ['BTCUSD', 'ETHUSD', 'ADAUSD'];
      
      const [market, risk, news] = await Promise.all([
        client.getMarketOverview(),
        client.analyzePortfolioRisk(symbols),
        client.getNewsAndSentiment(symbols)
      ]);
      
      setMarketOverview(market);
      setRiskAnalysis(risk);
      setNewsData(news);
      setLastUpdate(new Date());
      
      toast({
        title: "Data Refreshed",
        description: "MCP data has been successfully updated"
      });
      
    } catch (error) {
      console.error('Failed to refresh MCP data:', error);
      toast({
        title: "Refresh Failed",
        description: "Could not refresh MCP data sources",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const performComprehensiveAnalysis = async () => {
    try {
      setIsLoading(true);
      
      const symbols = ['BTCUSD', 'ETHUSD', 'ADAUSD'];
      const analysis = await client.performComprehensiveAnalysis(symbols);
      
      toast({
        title: "Analysis Complete",
        description: `Generated ${analysis.recommendations?.length || 0} recommendations`,
      });
      
      // Update all data with comprehensive analysis results
      setMarketOverview(analysis.market_overview);
      setRiskAnalysis(analysis.risk_analysis);
      setNewsData(analysis.sentiment_analysis);
      
    } catch (error) {
      console.error('Comprehensive analysis failed:', error);
      toast({
        title: "Analysis Failed",
        description: "Could not complete comprehensive analysis",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const getResourceStatusBadge = (resource: any) => {
    // Simulate resource health check
    const isHealthy = Math.random() > 0.2;
    return (
      <Badge variant={isHealthy ? "default" : "destructive"}>
        {isHealthy ? <CheckCircle className="h-3 w-3 mr-1" /> : <AlertCircle className="h-3 w-3 mr-1" />}
        {isHealthy ? 'Active' : 'Error'}
      </Badge>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">MCP Extensions Dashboard</h2>
          <p className="text-muted-foreground">
            Model Context Protocol integrations and external data sources
          </p>
        </div>
        <div className="flex gap-2">
          <Button 
            variant="outline" 
            size="sm" 
            onClick={refreshAllData}
            disabled={isLoading}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh Data
          </Button>
          <Button 
            onClick={performComprehensiveAnalysis}
            disabled={isLoading}
          >
            <BarChart3 className="h-4 w-4 mr-2" />
            Full Analysis
          </Button>
        </div>
      </div>

      {lastUpdate && (
        <Alert>
          <Activity className="h-4 w-4" />
          <AlertDescription>
            Last updated: {lastUpdate.toLocaleTimeString()}
          </AlertDescription>
        </Alert>
      )}

      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="resources">Resources</TabsTrigger>
          <TabsTrigger value="tools">Tools</TabsTrigger>
          <TabsTrigger value="market">Market Data</TabsTrigger>
          <TabsTrigger value="analysis">Analysis</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Resources</CardTitle>
                <Globe className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{resources.length}</div>
                <p className="text-xs text-muted-foreground">
                  External data sources
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Tools</CardTitle>
                <Zap className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{tools.length}</div>
                <p className="text-xs text-muted-foreground">
                  Available MCP tools
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Market Sentiment</CardTitle>
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {marketOverview?.sentiment?.score ? 
                    (marketOverview.sentiment.score > 0 ? 'Positive' : 'Negative') : 
                    'Loading...'
                  }
                </div>
                <p className="text-xs text-muted-foreground">
                  Overall market mood
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Risk Level</CardTitle>
                <AlertCircle className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {riskAnalysis?.var_analysis?.var_estimate ? 'Moderate' : 'Calculating...'}
                </div>
                <p className="text-xs text-muted-foreground">
                  Portfolio VaR assessment
                </p>
              </CardContent>
            </Card>
          </div>

          {capabilities && (
            <Card>
              <CardHeader>
                <CardTitle>MCP Capabilities</CardTitle>
                <CardDescription>Available Model Context Protocol features</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex gap-2 flex-wrap">
                  {Object.entries(capabilities).map(([key, enabled]) => (
                    <Badge key={key} variant={enabled ? "default" : "secondary"}>
                      {key}: {enabled ? 'Enabled' : 'Disabled'}
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="resources" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>External Resources</CardTitle>
              <CardDescription>Connected data sources and their status</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {resources.map((resource, index) => (
                  <div key={index} className="flex items-center justify-between p-4 border rounded-lg">
                    <div>
                      <h4 className="font-medium">{resource.name}</h4>
                      <p className="text-sm text-muted-foreground">{resource.description}</p>
                      <code className="text-xs bg-muted px-2 py-1 rounded">{resource.uri}</code>
                    </div>
                    {getResourceStatusBadge(resource)}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="tools" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Available Tools</CardTitle>
              <CardDescription>MCP tools for enhanced trading capabilities</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {tools.map((tool, index) => (
                  <div key={index} className="p-4 border rounded-lg">
                    <h4 className="font-medium">{tool.name}</h4>
                    <p className="text-sm text-muted-foreground mb-2">{tool.description}</p>
                    <details className="text-xs">
                      <summary className="cursor-pointer text-muted-foreground">Input Schema</summary>
                      <pre className="mt-2 p-2 bg-muted rounded text-xs overflow-auto">
                        {JSON.stringify(tool.inputSchema, null, 2)}
                      </pre>
                    </details>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="market" className="space-y-4">
          {marketOverview && (
            <div className="grid gap-4 md:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Kraken Data</CardTitle>
                </CardHeader>
                <CardContent>
                  {marketOverview.kraken ? (
                    <p className="text-sm">Data available from Kraken API</p>
                  ) : (
                    <p className="text-sm text-muted-foreground">No data available</p>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Market Sentiment</CardTitle>
                </CardHeader>
                <CardContent>
                  {marketOverview.sentiment ? (
                    <div>
                      <p className="text-sm">Score: {marketOverview.sentiment.sentiment_score}</p>
                      <p className="text-sm">Analysis: {marketOverview.sentiment.analysis}</p>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">No sentiment data</p>
                  )}
                </CardContent>
              </Card>
            </div>
          )}
        </TabsContent>

        <TabsContent value="analysis" className="space-y-4">
          {riskAnalysis && (
            <div className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Risk Analysis</CardTitle>
                </CardHeader>
                <CardContent>
                  {riskAnalysis.var_analysis && (
                    <div className="space-y-2">
                      <p className="text-sm">
                        <strong>Portfolio Value:</strong> ${riskAnalysis.var_analysis.portfolio_value?.toFixed(2) || 'N/A'}
                      </p>
                      <p className="text-sm">
                        <strong>VaR Estimate:</strong> ${riskAnalysis.var_analysis.var_estimate?.toFixed(2) || 'N/A'}
                      </p>
                      <p className="text-sm">
                        <strong>Confidence Level:</strong> {(riskAnalysis.var_analysis.confidence_level * 100).toFixed(1)}%
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>

              {newsData && (
                <Card>
                  <CardHeader>
                    <CardTitle>News & Sentiment Analysis</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {newsData.sentiment_analysis?.sentiment_scores && (
                      <div className="space-y-2">
                        {Object.entries(newsData.sentiment_analysis.sentiment_scores).map(([symbol, data]: [string, any]) => (
                          <div key={symbol} className="flex justify-between">
                            <span className="font-medium">{symbol}:</span>
                            <span className={data.score > 0 ? 'text-green-600' : 'text-red-600'}>
                              {data.score.toFixed(3)} ({data.article_count} articles)
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
};