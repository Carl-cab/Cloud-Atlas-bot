import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CloudAtlasBot } from '@/components/CloudAtlasBot';

// Mock all external dependencies
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: vi.fn(() => Promise.resolve({ 
            data: { 
              id: 'test-config',
              user_id: 'test-user',
              mode: 'paper',
              is_active: false,
              risk_per_trade: 1.0,
              daily_stop_loss: 5.0,
              max_positions: 3,
              symbols: ['BTCUSD', 'ETHUSD'],
              capital_cad: 10000
            }, 
            error: null 
          })),
          maybeSingle: vi.fn(() => Promise.resolve({ 
            data: { 
              id: 'test-config',
              user_id: 'test-user',
              mode: 'paper',
              is_active: false,
              risk_per_trade: 1.0,
              daily_stop_loss: 5.0,
              max_positions: 3,
              symbols: ['BTCUSD', 'ETHUSD'],
              capital_cad: 10000
            }, 
            error: null 
          }))
        })),
        order: vi.fn(() => ({
          limit: vi.fn(() => Promise.resolve({ data: [], error: null }))
        }))
      })),
      insert: vi.fn(() => Promise.resolve({ data: null, error: null })),
      update: vi.fn(() => ({
        eq: vi.fn(() => Promise.resolve({ data: null, error: null }))
      })),
      upsert: vi.fn(() => Promise.resolve({ data: null, error: null }))
    })),
    auth: {
      getUser: vi.fn(() => Promise.resolve({ data: { user: { id: 'test-user-id', email: 'test@example.com' } }, error: null })),
      getSession: vi.fn(() => Promise.resolve({
        data: {
          session: {
            user: { id: 'test-user-id', email: 'test@example.com' }
          }
        },
        error: null
      })),
      onAuthStateChange: vi.fn(() => ({
        data: {
          subscription: { unsubscribe: vi.fn() }
        }
      }))
    },
    channel: vi.fn(() => ({
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn()
    })),
    removeChannel: vi.fn(),
    functions: {
      invoke: vi.fn(() => Promise.resolve({ 
        data: { 
          success: true, 
          signal: 'buy',
          confidence: 0.8,
          price: 50000
        }, 
        error: null 
      }))
    }
  }
}));

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    user: { id: 'test-user-id', email: 'test@example.com' },
    loading: false
  })
}));

describe('Trading Workflow Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('navigates to Enhanced Trading tab and shows trading engine', async () => {
    const user = userEvent.setup();
    render(<CloudAtlasBot />);

    const tradingTab = screen.getByRole('tab', { name: /Enhanced Trading/ });
    await user.click(tradingTab);

    await waitFor(() => {
      expect(screen.getByText('Enhanced Trading Engine')).toBeInTheDocument();
    });
  });

  it('navigates to Engines tab and shows trading engines section', async () => {
    const user = userEvent.setup();
    render(<CloudAtlasBot />);

    const enginesTab = screen.getByRole('tab', { name: /Engines/ });
    await user.click(enginesTab);

    await waitFor(() => {
      expect(screen.getAllByText(/Trading Engines & ML/).length).toBeGreaterThan(0);
    });
  });

  it('navigates to Analysis tab and shows deep analysis button', async () => {
    const user = userEvent.setup();
    render(<CloudAtlasBot />);

    const analyticsTab = screen.getByRole('tab', { name: /Analysis/ });
    await user.click(analyticsTab);

    await waitFor(() => {
      expect(screen.getAllByText(/AI-Powered Market Analysis/).length).toBeGreaterThan(0);
    });
  });

  it('shows risk management tab content', async () => {
    const user = userEvent.setup();
    render(<CloudAtlasBot />);

    const riskTab = screen.getByRole('tab', { name: /Risk/ });
    await user.click(riskTab);

    await waitFor(() => {
      expect(screen.getAllByText(/Risk Management/).length).toBeGreaterThan(0);
    });
  });
});