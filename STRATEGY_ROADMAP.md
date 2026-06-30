# Strategy Engine Roadmap

## Current State: Framework Complete (v0.1.0)

The Strategy Engine framework is built and tested. All components compile and integrate. Skeleton strategies are registered but do not contain sophisticated trading logic.

## Phase 1: Framework (COMPLETE)

- [x] StrategyAdapter interface
- [x] StrategyRegistry (register, discover, enable/disable, priority, weight)
- [x] SignalAggregator (4 methods: majority vote, weighted confidence, priority, consensus)
- [x] StrategyPipeline orchestrator
- [x] 5 skeleton strategies (Momentum, MeanReversion, Breakout, TrendFollowing, AIHybrid)
- [x] Database migration (strategies, strategy_versions, strategy_results, strategy_performance, strategy_metrics)
- [x] Audit integration
- [x] 177 unit tests
- [x] Architecture documentation

## Phase 2: Strategy Logic (NOT STARTED)

Prerequisites: Phase 3 paper trading validation complete (7 days).

- [ ] Implement real indicator calculations (RSI, MACD, ADX, ATR, Bollinger)
- [ ] Implement proper position sizing (Kelly criterion, fixed fractional)
- [ ] Add historical backtesting capability
- [ ] Tune entry/exit thresholds per strategy
- [ ] Add regime-aware strategy selection
- [ ] Validate each strategy against historical data

## Phase 3: AI Integration (NOT STARTED)

Prerequisites: Phase 2 complete, ML infrastructure in place.

- [ ] AIHybridStrategy: real ML model inference
- [ ] Feature engineering pipeline
- [ ] Model training/retraining workflow
- [ ] Ensemble weighting from model performance
- [ ] Confidence calibration
- [ ] Online learning loop

## Phase 4: Multi-Strategy Paper Trading (NOT STARTED)

Prerequisites: Phase 2 complete.

- [ ] Run multiple strategies simultaneously in paper mode
- [ ] Compare strategy performance over 30+ days
- [ ] Auto-disable underperforming strategies
- [ ] Dashboard: strategy comparison view
- [ ] Alert on strategy health degradation

## Phase 5: Production Multi-Strategy (NOT STARTED)

Prerequisites: Phase 4 complete with proven performance.

- [ ] Enable multi-strategy in live mode
- [ ] Dynamic weight adjustment based on performance
- [ ] Strategy marketplace (community strategies)
- [ ] Custom strategy authoring UI
- [ ] Risk-adjusted returns tracking

## Constraints

- Live trading remains disabled until Phase 3 paper trading is complete
- No new broker implementations until strategy framework is validated
- Existing Risk Engine, Trading Engine, and BrokerAdapter are not modified
- All changes are additive only
