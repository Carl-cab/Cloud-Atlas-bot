# Environment Matrix

Two isolated environments. They never share a project ref, and the experiment
flag is enabled in staging only.

| Attribute | **Production (paper validation)** | **Staging (smoke test)** |
|-----------|-----------------------------------|--------------------------|
| Purpose | Phase 3 paper-trading validation | Test the strategy-engine paper wiring |
| Project ref | `ijwxlzwdysvvghmxlrnq` | `STAGING_PROJECT_REF` (you create it) |
| Bot `mode` | `paper` | `paper` |
| Live trading | **Disabled** | **Disabled** |
| `USE_BROKER_ADAPTERS` | `true` | `true` |
| `USE_STRATEGY_ENGINE` | **unset / false** | `true` |
| Real capital | None (paper) | None (paper) |
| Kraken keys | Owner's keys | Read-only test keys |
| Data sensitivity | **Pristine — Phase 3 record** | Disposable |
| Who deploys here | Only after Phase 3 + sign-off | `deploy-staging.sh` |
| Touched by test scripts | **Never** | Yes |

## Hard rules

1. **`deploy-staging.sh` and `run-smoke-tests.sh` refuse to run** if their
   target ref equals `ijwxlzwdysvvghmxlrnq`. No override flag exists.
2. **Production `USE_STRATEGY_ENGINE` stays off** until the release checklist
   is fully satisfied (Phase 3 complete + owner sign-off).
3. **No environment ever runs `mode=live`** during this work. Live trading is
   globally disabled.
4. **Phase 3 continues uninterrupted** in production. Nothing in this workflow
   pauses it, changes its flags, or writes to its tables.

## Flag interaction (both environments, `mode=paper`)

| `USE_BROKER_ADAPTERS` | `USE_STRATEGY_ENGINE` | Behavior |
|:---:|:---:|---|
| true | false | Current production behavior (legacy signal path) |
| true | true  | `analyze_market` also runs the vol-expansion pipeline → writes a paper `buy` signal when it fires (**staging**) |

When `USE_STRATEGY_ENGINE` is false, the wiring is inert and `analyze_market`
behaves byte-for-byte as it does today.

## Promotion direction

```
   staging (flag ON, mode=paper)
        │  smoke tests PASS
        │  + Phase 3 complete
        │  + owner sign-off
        ▼
   production (flag ON, mode=paper)   ← a deliberate, gated step; not part of
                                        this task
```
