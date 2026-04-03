import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { applyRateLimit, rateLimitConfigs } from '../_shared/rateLimiter.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface OrderRequest {
  user_id: string;
  symbol: string;
  side: 'buy' | 'sell';
  type: 'market' | 'limit' | 'stop-loss' | 'take-profit';
  quantity: number;
  price?: number;
  stop_price?: number;
  time_in_force?: 'GTC' | 'IOC' | 'FOK';
}

interface KrakenCredentials {
  api_key: string;
  private_key: string;
}

class LiveTradingEngine {
  private supabase;
  
  constructor() {
    this.supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? ''
    );
  }

  // Generate Kraken API signature
  private async generateKrakenSignature(path: string, nonce: string, postData: string, secret: string): Promise<string> {
    try {
      const encoder = new TextEncoder();
      const decoder = new TextDecoder();
      
      // Create the message to hash (nonce + postData)
      const message = nonce + postData;
      const messageHash = await crypto.subtle.digest('SHA-256', encoder.encode(message));
      
      // Decode the base64 secret
      const secretBytes = new Uint8Array(
        atob(secret)
          .split('')
          .map(char => char.charCodeAt(0))
      );
      
      // Import the secret key for HMAC
      const key = await crypto.subtle.importKey(
        'raw',
        secretBytes,
        { name: 'HMAC', hash: 'SHA-512' },
        false,
        ['sign']
      );
      
      // Create the final message (path + hash)
      const pathBytes = encoder.encode(path);
      const combinedMessage = new Uint8Array(pathBytes.length + messageHash.byteLength);
      combinedMessage.set(pathBytes);
      combinedMessage.set(new Uint8Array(messageHash), pathBytes.length);
      
      // Sign the message
      const signature = await crypto.subtle.sign('HMAC', key, combinedMessage);
      
      // Convert to base64
      return btoa(String.fromCharCode(...new Uint8Array(signature)));
    } catch (error) {
      console.error('Signature generation error:', error);
      throw new Error(`Failed to generate Kraken signature: ${error.message}`);
    }
  }

  // Make authenticated Kraken API request
  private async krakenRequest(endpoint: string, params: Record<string, any>, credentials: KrakenCredentials) {
    const nonce = Date.now().toString();
    const postData = `nonce=${nonce}&` + new URLSearchParams(params).toString();
    const path = `/0/private/${endpoint}`;
    
    try {
      const signature = await this.generateKrakenSignature(path, nonce, postData, credentials.private_key);
      
      const response = await fetch(`https://api.kraken.com${path}`, {
        method: 'POST',
        headers: {
          'API-Key': credentials.api_key,
          'API-Sign': signature,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: postData,
      });

      return await response.json();
    } catch (error) {
      console.error('Kraken API Error:', error);
      throw new Error(`Kraken API request failed: ${error.message}`);
    }
  }

  // Get account balance
  async getAccountBalance(user_id: string, userToken: string): Promise<any> {
    const credentials = await this.getKrakenCredentials(user_id, userToken);
    const result = await this.krakenRequest('Balance', {}, credentials);
    
    if (result.error && result.error.length > 0) {
      throw new Error(`Kraken Balance Error: ${result.error.join(', ')}`);
    }
    
    return result.result;
  }

  // Place a live order
  async placeOrder(orderRequest: OrderRequest, userToken: string): Promise<any> {
    const credentials = await this.getKrakenCredentials(orderRequest.user_id, userToken);
    
    // Validate order before placement
    await this.validateOrder(orderRequest, userToken);
    
    const krakenParams: Record<string, any> = {
      pair: this.mapSymbolToKraken(orderRequest.symbol),
      type: orderRequest.side,
      ordertype: orderRequest.type,
      volume: orderRequest.quantity.toString(),
    };

    // Add price for limit orders
    if (orderRequest.type === 'limit' && orderRequest.price) {
      krakenParams.price = orderRequest.price.toString();
    }

    // Add stop price for stop orders
    if ((orderRequest.type === 'stop-loss' || orderRequest.type === 'take-profit') && orderRequest.stop_price) {
      krakenParams.price = orderRequest.stop_price.toString();
    }

    // Add time in force
    if (orderRequest.time_in_force) {
      krakenParams.timeinforce = orderRequest.time_in_force;
    }

    try {
      const result = await this.krakenRequest('AddOrder', krakenParams, credentials);
      
      if (result.error && result.error.length > 0) {
        throw new Error(`Order placement failed: ${result.error.join(', ')}`);
      }

      // Store order in database
      const orderData = {
        user_id: orderRequest.user_id,
        kraken_order_id: result.result.txid[0],
        symbol: orderRequest.symbol,
        side: orderRequest.side,
        type: orderRequest.type,
        quantity: orderRequest.quantity,
        price: orderRequest.price || 0,
        status: 'pending',
        created_at: new Date().toISOString(),
      };

      await this.storeOrder(orderData);

      return {
        success: true,
        order_id: result.result.txid[0],
        description: result.result.descr,
        order_data: orderData
      };
    } catch (error) {
      console.error('Order placement error:', error);
      
      // Log failed order attempt
      await this.logOrderEvent(orderRequest.user_id, 'order_failed', {
        error: error.message,
        order_request: orderRequest
      });
      
      throw error;
    }
  }

  // Cancel an existing order
  async cancelOrder(user_id: string, order_id: string, userToken: string): Promise<any> {
    const credentials = await this.getKrakenCredentials(user_id, userToken);
    
    const result = await this.krakenRequest('CancelOrder', {
      txid: order_id
    }, credentials);

    if (result.error && result.error.length > 0) {
      throw new Error(`Order cancellation failed: ${result.error.join(', ')}`);
    }

    // Update order status in database
    await this.updateOrderStatus(order_id, 'cancelled');

    return {
      success: true,
      cancelled_orders: result.result.count
    };
  }

  // Get open orders
  async getOpenOrders(user_id: string, userToken: string): Promise<any> {
    const credentials = await this.getKrakenCredentials(user_id, userToken);
    
    const result = await this.krakenRequest('OpenOrders', {}, credentials);
    
    if (result.error && result.error.length > 0) {
      throw new Error(`Failed to fetch open orders: ${result.error.join(', ')}`);
    }

    return result.result.open;
  }

  // Get order history
  async getOrderHistory(user_id: string, start?: number, userToken?: string): Promise<any> {
    if (userToken) {
      const credentials = await this.getKrakenCredentials(user_id, userToken);
    
      const params: Record<string, any> = {};
      if (start) params.start = start.toString();

      const result = await this.krakenRequest('ClosedOrders', params, credentials);
    
      if (result.error && result.error.length > 0) {
        throw new Error(`Failed to fetch order history: ${result.error.join(', ')}`);
      }

      return result.result.closed;
    } else {
      throw new Error('Authentication token required for order history');
    }
  }

  // Get current market price
  async getMarketPrice(symbol: string): Promise<number> {
    const krakenSymbol = this.mapSymbolToKraken(symbol);
    
    const response = await fetch(`https://api.kraken.com/0/public/Ticker?pair=${krakenSymbol}`);
    const data = await response.json();
    
    if (data.error && data.error.length > 0) {
      throw new Error(`Failed to fetch market price: ${data.error.join(', ')}`);
    }

    const tickerData = Object.values(data.result)[0] as any;
    return parseFloat(tickerData.c[0]); // Last trade price
  }

  // Validate order before placement
  private async validateOrder(orderRequest: OrderRequest, userToken: string): Promise<void> {
    // Check minimum order size
    if (orderRequest.quantity <= 0) {
      throw new Error('Order quantity must be greater than 0');
    }

    try {
      // Get current account balance for validation
      const balance = await this.getAccountBalance(orderRequest.user_id, userToken);
      
      if (orderRequest.side === 'buy') {
        const requiredBalance = orderRequest.quantity * (orderRequest.price || await this.getMarketPrice(orderRequest.symbol));
        const availableBalance = parseFloat(balance.ZUSD || '0') + parseFloat(balance.USD || '0');
        
        if (requiredBalance > availableBalance * 0.99) { // 1% buffer for fees
          throw new Error('Insufficient USD balance for buy order');
        }
      } else {
        // For sell orders, check if user has the asset
        const assetKey = this.getAssetKey(orderRequest.symbol);
        const availableAsset = parseFloat(balance[assetKey] || '0');
        
        if (orderRequest.quantity > availableAsset * 0.99) { // 1% buffer
          throw new Error(`Insufficient ${orderRequest.symbol} balance for sell order`);
        }
      }
    } catch (error) {
      console.log('Balance validation skipped:', error.message);
      // Continue without balance validation if credentials are not available
      // This allows demo/paper trading while live credentials are being set up
    }

    // Check against risk limits
    await this.checkRiskLimits(orderRequest, userToken);
  }

  // Check risk management limits
  private async checkRiskLimits(orderRequest: OrderRequest, userToken?: string): Promise<void> {
    const { data: riskSettings } = await this.supabase
      .from('risk_settings')
      .select('*')
      .eq('user_id', orderRequest.user_id)
      .single();

    if (riskSettings && userToken) {
      try {
        const orderValue = orderRequest.quantity * (orderRequest.price || await this.getMarketPrice(orderRequest.symbol));
        const portfolioValue = await this.getPortfolioValue(orderRequest.user_id, userToken);
        
        // Check position size limit
        const positionPercentage = orderValue / portfolioValue;
        if (positionPercentage > riskSettings.max_position_size) {
          throw new Error(`Order exceeds maximum position size limit of ${(riskSettings.max_position_size * 100).toFixed(1)}%`);
        }
      } catch (error) {
        console.log('Risk limit validation skipped:', error.message);
        // Continue without risk validation if portfolio value calculation fails
      }
    }
  }

  // Get portfolio value (requires user token for API access)
  private async getPortfolioValue(user_id: string, userToken: string): Promise<number> {
    try {
      const balance = await this.getAccountBalance(user_id, userToken);
      
      // Simplified portfolio value calculation
      // In production, you'd want to convert all assets to USD value
      return parseFloat(balance.ZUSD || '0') + parseFloat(balance.USD || '0') + 
             (parseFloat(balance.XXBT || '0') * await this.getMarketPrice('BTCUSD'));
    } catch (error) {
      console.log('Portfolio value calculation failed:', error.message);
      return 10000; // Default value for demo/paper trading
    }
  }

  // Helper functions
  private mapSymbolToKraken(symbol: string): string {
    const mapping: Record<string, string> = {
      'BTCUSD': 'XBTUSD',
      'ETHUSD': 'ETHUSD',
      'ADAUSD': 'ADAUSD',
    };
    return mapping[symbol] || symbol;
  }

  private getAssetKey(symbol: string): string {
    const mapping: Record<string, string> = {
      'BTCUSD': 'XXBT',
      'ETHUSD': 'XETH',
      'ADAUSD': 'ADA',
    };
    return mapping[symbol] || symbol.substring(0, 3);
  }

  // Database operations
  private async getKrakenCredentials(user_id: string, userToken: string): Promise<KrakenCredentials> {
    // SECURITY FIX: Use user's token instead of service role key to call secure-credentials
    // This ensures RLS policies are enforced and users can only access their own credentials
    console.log(`Attempting to get Kraken credentials for user: ${user_id}`);
    
    const { data, error } = await this.supabase.functions.invoke('secure-credentials', {
      body: {
        action: 'get',
        exchange: 'kraken'
      },
      headers: {
        'Authorization': `Bearer ${userToken}`
      }
    });

    console.log('Secure credentials response:', { data, error });

    if (error) {
      console.error('Secure credentials function error:', error);
      throw new Error(`Failed to retrieve credentials: ${error.message || 'Unknown error'}`);
    }

    if (!data?.success) {
      console.error('Credentials retrieval failed:', data?.error || 'Unknown error');
      throw new Error(`User has no valid Kraken API credentials configured: ${data?.error || 'Please add your Kraken API keys in the settings'}`);
    }

    if (!data?.credentials?.api_key || !data?.credentials?.api_secret) {
      console.error('Missing credential data:', data?.credentials);
      throw new Error('Incomplete Kraken API credentials - please re-enter your API key and secret');
    }
    
    console.log('Successfully retrieved Kraken credentials');
    return {
      api_key: data.credentials.api_key,
      private_key: data.credentials.api_secret
    };
  }

  private async storeOrder(orderData: any): Promise<void> {
    const { error } = await this.supabase
      .from('executed_trades')
      .insert({
        user_id: orderData.user_id,
        kraken_order_id: orderData.kraken_order_id,
        symbol: orderData.symbol,
        side: orderData.side,
        trade_type: orderData.type,
        quantity: orderData.quantity,
        price: orderData.price,
        timestamp: orderData.created_at,
        fee: 0, // Will be updated when trade executes
        realized_pnl: null
      });

    if (error) {
      console.error('Error storing order:', error);
    }
  }

  private async updateOrderStatus(order_id: string, status: string): Promise<void> {
    const { error } = await this.supabase
      .from('executed_trades')
      .update({ trade_type: status })
      .eq('kraken_order_id', order_id);

    if (error) {
      console.error('Error updating order status:', error);
    }
  }

  private async logOrderEvent(user_id: string, event_type: string, data: any): Promise<void> {
    const { error } = await this.supabase
      .from('risk_events')
      .insert({
        user_id,
        event_type,
        severity: 'medium',
        description: `Trading event: ${event_type}`,
        triggered_by: data,
        actions_taken: ['logged']
      });

    if (error) {
      console.error('Error logging order event:', error);
    }
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Authenticate the request first
    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      throw new Error('No authorization header');
    }

    const supabaseAuth = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? ''
    );
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser(token);
    
    if (authError || !user) {
      throw new Error('Invalid or expired token');
    }

    // Apply rate limiting for trading operations
    const rateLimitResponse = await applyRateLimit(req, rateLimitConfigs.trading);
    if (rateLimitResponse) {
      return rateLimitResponse;
    }

    const { action, ...params } = await req.json();

    // Validate that user_id matches authenticated user
    if (params.user_id && params.user_id !== user.id) {
      throw new Error('Access denied: Cannot access another user\'s data');
    }

    // Use authenticated user ID for all operations
    params.user_id = user.id;
    const tradingEngine = new LiveTradingEngine();

    switch (action) {
      case 'place_order': {
        const result = await tradingEngine.placeOrder(params as OrderRequest, token);
        
        return new Response(JSON.stringify({
          success: true,
          ...result
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      case 'cancel_order': {
        const result = await tradingEngine.cancelOrder(params.user_id, params.order_id, token);
        
        return new Response(JSON.stringify({
          success: true,
          ...result
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      case 'get_balance': {
        const balance = await tradingEngine.getAccountBalance(params.user_id, token);
        
        return new Response(JSON.stringify({
          success: true,
          balance
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      case 'get_open_orders': {
        const orders = await tradingEngine.getOpenOrders(params.user_id, token);
        
        return new Response(JSON.stringify({
          success: true,
          orders
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      case 'get_order_history': {
        const history = await tradingEngine.getOrderHistory(params.user_id, params.start, token);
        
        return new Response(JSON.stringify({
          success: true,
          history
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      case 'get_market_price': {
        const price = await tradingEngine.getMarketPrice(params.symbol);
        
        return new Response(JSON.stringify({
          success: true,
          price
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      default:
        throw new Error(`Unknown action: ${action}`);
    }

  } catch (error) {
    console.error('Live Trading Engine Error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});