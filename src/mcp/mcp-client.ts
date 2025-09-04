/**
 * MCP Client Implementation
 * Integrates MCP capabilities into the trading application
 */

import { MCPServer } from './mcp-server';

export interface MCPClientConfig {
  autoRefresh: boolean;
  refreshInterval: number; // milliseconds
  enableLogging: boolean;
}

export class MCPClient {
  private server: MCPServer;
  private config: MCPClientConfig;
  private refreshTimer?: NodeJS.Timeout;
  private resourceCache: Map<string, { data: any; timestamp: number }> = new Map();
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  constructor(config: Partial<MCPClientConfig> = {}) {
    this.server = new MCPServer();
    this.config = {
      autoRefresh: true,
      refreshInterval: 30000, // 30 seconds
      enableLogging: true,
      ...config
    };

    if (this.config.autoRefresh) {
      this.startAutoRefresh();
    }
  }

  private startAutoRefresh() {
    this.refreshTimer = setInterval(async () => {
      await this.refreshCriticalResources();
    }, this.config.refreshInterval);
  }

  private async refreshCriticalResources() {
    const criticalResources = [
      'mcp://market-data/kraken',
      'mcp://sentiment/social',
      'mcp://blockchain/metrics'
    ];

    for (const uri of criticalResources) {
      try {
        await this.getResource(uri, true); // Force refresh
      } catch (error) {
        if (this.config.enableLogging) {
          console.warn(`Failed to refresh resource ${uri}:`, error);
        }
      }
    }
  }

  async getResource(uri: string, forceRefresh = false): Promise<any> {
    const cached = this.resourceCache.get(uri);
    const now = Date.now();

    if (!forceRefresh && cached && (now - cached.timestamp) < this.CACHE_TTL) {
      return cached.data;
    }

    try {
      const data = await this.server.readResource(uri);
      this.resourceCache.set(uri, { data, timestamp: now });
      return data;
    } catch (error) {
      if (this.config.enableLogging) {
        console.error(`Error fetching resource ${uri}:`, error);
      }
      // Return cached data if available, even if stale
      return cached?.data || null;
    }
  }

  async callTool(name: string, arguments_: any): Promise<any> {
    if (this.config.enableLogging) {
      console.log(`Calling MCP tool: ${name}`, arguments_);
    }

    try {
      const result = await this.server.callTool(name, arguments_);
      
      if (this.config.enableLogging) {
        console.log(`MCP tool ${name} completed successfully`);
      }
      
      return result;
    } catch (error) {
      if (this.config.enableLogging) {
        console.error(`MCP tool ${name} failed:`, error);
      }
      throw error;
    }
  }

  async getCapabilities() {
    return await this.server.getCapabilities();
  }

  async listResources() {
    return await this.server.listResources();
  }

  async listTools() {
    return await this.server.listTools();
  }

  // Convenience methods for common trading operations
  async getMarketOverview(): Promise<any> {
    const [kraken, binance, sentiment] = await Promise.allSettled([
      this.getResource('mcp://market-data/kraken'),
      this.getResource('mcp://market-data/binance'),
      this.getResource('mcp://sentiment/social')
    ]);

    return {
      kraken: kraken.status === 'fulfilled' ? kraken.value : null,
      binance: binance.status === 'fulfilled' ? binance.value : null,
      sentiment: sentiment.status === 'fulfilled' ? sentiment.value : null,
      timestamp: new Date().toISOString()
    };
  }

  async analyzePortfolioRisk(symbols: string[]): Promise<any> {
    const [correlation, var_analysis, onchain] = await Promise.allSettled([
      this.callTool('analyze-correlation', { pairs: symbols, period: 30 }),
      this.callTool('calculate-portfolio-var', { confidence_level: 0.95 }),
      this.callTool('analyze-onchain-metrics', { 
        asset: symbols[0], 
        metrics: ['network_value', 'active_addresses'] 
      })
    ]);

    return {
      correlation: correlation.status === 'fulfilled' ? correlation.value : null,
      var_analysis: var_analysis.status === 'fulfilled' ? var_analysis.value : null,
      onchain_metrics: onchain.status === 'fulfilled' ? onchain.value : null,
      symbols,
      analysis_time: new Date().toISOString()
    };
  }

  async getNewsAndSentiment(symbols: string[]): Promise<any> {
    const [news, sentiment, economic] = await Promise.allSettled([
      this.getResource('mcp://news/crypto'),
      this.callTool('fetch-news-sentiment', { symbols, timeframe: '1d' }),
      this.getResource('mcp://economic/calendar')
    ]);

    return {
      crypto_news: news.status === 'fulfilled' ? news.value : null,
      sentiment_analysis: sentiment.status === 'fulfilled' ? sentiment.value : null,
      economic_events: economic.status === 'fulfilled' ? economic.value : null,
      symbols,
      timestamp: new Date().toISOString()
    };
  }

  async performComprehensiveAnalysis(symbols: string[]): Promise<any> {
    const [market, risk, sentiment] = await Promise.allSettled([
      this.getMarketOverview(),
      this.analyzePortfolioRisk(symbols),
      this.getNewsAndSentiment(symbols)
    ]);

    return {
      market_overview: market.status === 'fulfilled' ? market.value : null,
      risk_analysis: risk.status === 'fulfilled' ? risk.value : null,
      sentiment_analysis: sentiment.status === 'fulfilled' ? sentiment.value : null,
      symbols,
      comprehensive_analysis_time: new Date().toISOString(),
      recommendations: await this.generateRecommendations({
        market: market.status === 'fulfilled' ? market.value : null,
        risk: risk.status === 'fulfilled' ? risk.value : null,
        sentiment: sentiment.status === 'fulfilled' ? sentiment.value : null
      })
    };
  }

  private async generateRecommendations(analysis: any): Promise<string[]> {
    const recommendations = [];

    // Market-based recommendations
    if (analysis.market?.sentiment?.score < -0.5) {
      recommendations.push('Consider reducing position sizes due to negative market sentiment');
    }

    // Risk-based recommendations
    if (analysis.risk?.var_analysis?.var_estimate > 10000) {
      recommendations.push('Portfolio VaR is elevated - consider diversification');
    }

    // Correlation-based recommendations
    if (analysis.risk?.correlation) {
      const highCorrelations = Object.entries(analysis.risk.correlation)
        .filter(([_, corr]: [string, any]) => Math.abs(corr) > 0.8);
      
      if (highCorrelations.length > 0) {
        recommendations.push('High correlations detected - review portfolio diversification');
      }
    }

    // Default recommendation
    if (recommendations.length === 0) {
      recommendations.push('Portfolio analysis looks healthy - maintain current strategy');
    }

    return recommendations;
  }

  destroy() {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
    }
    this.resourceCache.clear();
  }
}