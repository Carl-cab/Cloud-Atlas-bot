# Cloud Atlas Trading Bot - API Documentation

## Overview

The Cloud Atlas Trading Bot provides a comprehensive REST API and Edge Functions for integration with external systems and advanced trading operations.

## Base URL

```
https://asxcbnkpflgecqreegdd.supabase.co/functions/v1/
```

## Authentication

All API requests require authentication using Bearer tokens:

```http
Authorization: Bearer YOUR_SUPABASE_ANON_KEY
```

## Rate Limiting

- **Standard Endpoints**: 100 requests per minute
- **Trading Endpoints**: 50 requests per minute
- **Data Endpoints**: 200 requests per minute

Rate limit headers are included in all responses:
```http
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1640995200
```

## Edge Functions

### 1. Trading Bot Engine

**Endpoint**: `POST /trading-bot`

**Description**: Main trading engine for market analysis, signal generation, and trade execution.

#### Request Body

```json
{
  "action": "analyze_market" | "generate_signal" | "execute_trade" | "train_model",
  "symbol": "BTCUSD",
  "strategy": "trend_following" | "mean_reversion" | "ml_hybrid",
  "user_id": "uuid",
  "parameters": {
    "timeframe": "1h",
    "confidence_threshold": 0.7,
    "risk_amount": 100
  }
}
```

#### Response Examples

**Market Analysis**:
```json
{
  "success": true,
  "data": {
    "regime": "trend",
    "confidence": 0.85,
    "volatility": 0.023,
    "trend_strength": 0.72,
    "indicators": {
      "rsi": 65.4,
      "macd": 0.0023,
      "bollinger_bands": {
        "upper": 51500,
        "lower": 49200,
        "middle": 50350
      }
    }
  }
}
```

**Signal Generation**:
```json
{
  "success": true,
  "data": {
    "signal": "buy",
    "confidence": 0.78,
    "entry_price": 50000,
    "stop_loss": 49000,
    "take_profit": 52000,
    "position_size": 0.002,
    "risk_reward_ratio": 2.0
  }
}
```

### 2. Live Trading Engine

**Endpoint**: `POST /live-trading-engine`

**Description**: Handles live order execution and portfolio management.

#### Request Body

```json
{
  "action": "place_order" | "cancel_order" | "get_balance" | "get_orders",
  "user_id": "uuid",
  "order_data": {
    "symbol": "BTCUSD",
    "side": "buy" | "sell",
    "type": "market" | "limit" | "stop",
    "quantity": 0.001,
    "price": 50000,
    "stop_price": 49000
  }
}
```

#### Response

```json
{
  "success": true,
  "data": {
    "order_id": "12345",
    "status": "filled",
    "executed_price": 50025,
    "executed_quantity": 0.001,
    "fees": 0.5,
    "timestamp": "2025-01-06T10:30:00Z"
  }
}
```

### 3. Risk Management Engine

**Endpoint**: `POST /risk-management-engine`

**Description**: Validates trades against risk parameters and calculates position sizes.

#### Request Body

```json
{
  "action": "validate_trade" | "calculate_position",
  "user_id": "uuid",
  "trade_data": {
    "symbol": "BTCUSD",
    "side": "buy",
    "price": 50000,
    "stop_loss": 49000,
    "risk_amount": 100
  }
}
```

#### Response

```json
{
  "success": true,
  "data": {
    "approved": true,
    "position_size": 0.002,
    "risk_score": 0.65,
    "warnings": [],
    "limits_used": {
      "daily_risk": 0.45,
      "position_count": 0.6,
      "correlation_risk": 0.3
    }
  }
}
```

### 4. ML Trading Engine

**Endpoint**: `POST /ml-trading-engine`

**Description**: Machine learning model training and prediction services.

#### Request Body

```json
{
  "action": "train_model" | "predict" | "get_model_info",
  "symbol": "BTCUSD",
  "model_type": "classification" | "regression",
  "features": {
    "technical_indicators": true,
    "market_regime": true,
    "sentiment_data": false
  },
  "training_params": {
    "lookback_days": 30,
    "validation_split": 0.2,
    "epochs": 100
  }
}
```

#### Response

```json
{
  "success": true,
  "data": {
    "model_id": "model_v1.2.3",
    "accuracy": 0.73,
    "precision": 0.71,
    "recall": 0.75,
    "feature_importance": {
      "rsi": 0.23,
      "macd": 0.19,
      "volume": 0.15,
      "volatility": 0.12
    },
    "training_time": "2.5 minutes"
  }
}
```

### 5. Notification Engine

**Endpoint**: `POST /notification-engine`

**Description**: Manages alerts, reports, and communication services.

#### Request Body

```json
{
  "action": "send_test" | "generate_report" | "send_alert",
  "user_id": "uuid",
  "notification_type": "telegram" | "email",
  "content": {
    "title": "Trade Alert",
    "message": "New buy signal generated for BTC/USD",
    "priority": "high" | "medium" | "low",
    "data": {
      "symbol": "BTCUSD",
      "signal": "buy",
      "confidence": 0.85
    }
  }
}
```

#### Response

```json
{
  "success": true,
  "data": {
    "notification_id": "notif_12345",
    "status": "sent",
    "delivery_time": "2025-01-06T10:30:05Z",
    "recipients": ["telegram", "email"]
  }
}
```

### 6. Enhanced ML Engine

**Endpoint**: `POST /enhanced-ml-engine`

**Description**: Advanced machine learning with ensemble models and feature engineering.

#### Request Body

```json
{
  "action": "train_ensemble" | "predict_ensemble" | "feature_analysis",
  "symbol": "BTCUSD",
  "models": ["random_forest", "gradient_boost", "neural_network"],
  "parameters": {
    "ensemble_method": "weighted_average",
    "feature_selection": "auto",
    "cross_validation": 5
  }
}
```

### 7. Security Audit

**Endpoint**: `POST /security-audit`

**Description**: Security monitoring and threat detection.

#### Request Body

```json
{
  "action": "scan_threats" | "check_integrity" | "audit_access",
  "user_id": "uuid",
  "scope": "api_keys" | "transactions" | "system"
}
```

## WebSocket Connections

### Real-time Market Data

**Endpoint**: `wss://asxcbnkpflgecqreegdd.supabase.co/realtime/v1/websocket`

#### Subscription Message

```json
{
  "topic": "market_data:BTCUSD",
  "event": "phx_join",
  "payload": {
    "config": {
      "presence": {
        "key": "market_price"
      }
    }
  },
  "ref": "1"
}
```

#### Market Data Updates

```json
{
  "topic": "market_data:BTCUSD",
  "event": "price_update",
  "payload": {
    "symbol": "BTCUSD",
    "price": 50125.67,
    "bid": 50123.45,
    "ask": 50127.89,
    "volume_24h": 1234.56,
    "change_24h": 2.34,
    "timestamp": "2025-01-06T10:30:00Z"
  }
}
```

## Database REST API

### Bot Configuration

**Get Configuration**:
```http
GET /rest/v1/bot_config?user_id=eq.{user_id}
```

**Update Configuration**:
```http
PATCH /rest/v1/bot_config?user_id=eq.{user_id}
Content-Type: application/json

{
  "mode": "live",
  "risk_per_trade": 1.0,
  "daily_stop_loss": 3.0,
  "max_positions": 5
}
```

### Trading Positions

**Get Positions**:
```http
GET /rest/v1/trading_positions?user_id=eq.{user_id}&status=eq.open
```

**Close Position**:
```http
PATCH /rest/v1/trading_positions?id=eq.{position_id}
Content-Type: application/json

{
  "status": "closed",
  "closed_at": "2025-01-06T10:30:00Z",
  "exit_reason": "take_profit"
}
```

### Order Management

**Create Order**:
```http
POST /rest/v1/order_management
Content-Type: application/json

{
  "user_id": "uuid",
  "symbol": "BTCUSD",
  "side": "buy",
  "order_type": "limit",
  "quantity": 0.001,
  "price": 50000,
  "stop_price": 49000
}
```

**Get Orders**:
```http
GET /rest/v1/order_management?user_id=eq.{user_id}&status=eq.pending
```

## Error Handling

### Error Response Format

```json
{
  "success": false,
  "error": {
    "code": "INVALID_PARAMETERS",
    "message": "Invalid symbol format",
    "details": {
      "field": "symbol",
      "expected": "BTCUSD format",
      "received": "BTC-USD"
    }
  }
}
```

### Common Error Codes

- `AUTHENTICATION_FAILED`: Invalid or expired token
- `RATE_LIMIT_EXCEEDED`: Too many requests
- `INVALID_PARAMETERS`: Request validation failed
- `INSUFFICIENT_BALANCE`: Not enough funds for trade
- `MARKET_CLOSED`: Exchange is not trading
- `SYSTEM_MAINTENANCE`: Temporary service unavailability

## SDK Examples

### JavaScript/TypeScript

```typescript
import { supabase } from '@supabase/supabase-js';

const client = supabase.createClient(
  'https://asxcbnkpflgecqreegdd.supabase.co',
  'YOUR_ANON_KEY'
);

// Generate trading signal
const { data, error } = await client.functions.invoke('trading-bot', {
  body: {
    action: 'generate_signal',
    symbol: 'BTCUSD',
    strategy: 'ml_hybrid',
    user_id: userId
  }
});

// Place order
const { data: order, error: orderError } = await client.functions.invoke('live-trading-engine', {
  body: {
    action: 'place_order',
    user_id: userId,
    order_data: {
      symbol: 'BTCUSD',
      side: 'buy',
      type: 'market',
      quantity: 0.001
    }
  }
});
```

### Python

```python
import requests

BASE_URL = "https://asxcbnkpflgecqreegdd.supabase.co/functions/v1"
HEADERS = {
    "Authorization": "Bearer YOUR_ANON_KEY",
    "Content-Type": "application/json"
}

# Generate signal
response = requests.post(
    f"{BASE_URL}/trading-bot",
    headers=HEADERS,
    json={
        "action": "generate_signal",
        "symbol": "BTCUSD",
        "strategy": "trend_following",
        "user_id": "your-user-id"
    }
)

signal_data = response.json()
```

## Testing & Development

### Test Environment

Use the development endpoint for testing:
```
https://asxcbnkpflgecqreegdd.supabase.co/functions/v1/
```

### Paper Trading Mode

All trading functions support paper trading mode by setting:
```json
{
  "mode": "paper",
  "paper_balance": 10000
}
```

### Webhooks

Configure webhooks for real-time notifications:

```json
{
  "webhook_url": "https://your-server.com/webhook",
  "events": ["trade_executed", "signal_generated", "risk_breach"],
  "secret": "webhook_secret_key"
}
```

Webhook payload example:
```json
{
  "event": "trade_executed",
  "timestamp": "2025-01-06T10:30:00Z",
  "data": {
    "user_id": "uuid",
    "order_id": "12345",
    "symbol": "BTCUSD",
    "side": "buy",
    "quantity": 0.001,
    "price": 50000
  },
  "signature": "sha256_hash"
}
```

---

**API Version**: 2.0.0  
**Last Updated**: January 2025  
**Support**: api-support@cloudatlas.com