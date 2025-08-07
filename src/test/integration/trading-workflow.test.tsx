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

  it('completes full trading workflow', async () => {
    const user = userEvent.setup();
    render(<CloudAtlasBot />);
    
    // Step 1: Navigate to Enhanced Trading tab
    const tradingTab = screen.getByText('Enhanced Trading');
    await user.click(tradingTab);
    
    await waitFor(() => {
      expect(screen.getByText('Enhanced Trading Interface')).toBeInTheDocument();
    });
    
    // Step 2: Configure a trade
    const symbolSelect = screen.getByRole('combobox');
    await user.click(symbolSelect);
    
    await waitFor(async () => {
      const btcOption = screen.getByText('BTC/USD');
      await user.click(btcOption);
    });
    
    // Step 3: Set quantity and risk
    const quantityInput = screen.getByPlaceholderText('Enter quantity');
    await user.clear(quantityInput);
    await user.type(quantityInput, '0.1');
    
    const riskInput = screen.getByPlaceholderText('Risk amount');
    await user.clear(riskInput);
    await user.type(riskInput, '100');
    
    // Step 4: Place order
    const placeOrderButton = screen.getByText('Place Order');
    await user.click(placeOrderButton);
    
    // Step 5: Verify order placement
    await waitFor(() => {
      expect(screen.getByText(/Order placed successfully/)).toBeInTheDocument();
    }, { timeout: 3000 });
  });

  it('handles risk management validation', async () => {
    const user = userEvent.setup();
    render(<CloudAtlasBot />);
    
    // Navigate to Enhanced Trading
    const tradingTab = screen.getByText('Enhanced Trading');
    await user.click(tradingTab);
    
    await waitFor(() => {
      expect(screen.getByText('Enhanced Trading Interface')).toBeInTheDocument();
    });
    
    // Try to place order with excessive risk
    const riskInput = screen.getByPlaceholderText('Risk amount');
    await user.clear(riskInput);
    await user.type(riskInput, '10000'); // Exceeds daily limit
    
    const quantityInput = screen.getByPlaceholderText('Enter quantity');
    await user.clear(quantityInput);
    await user.type(quantityInput, '1');
    
    const placeOrderButton = screen.getByText('Place Order');
    await user.click(placeOrderButton);
    
    // Should show risk validation error
    await waitFor(() => {
      expect(screen.getByText(/Risk amount exceeds/)).toBeInTheDocument();
    });
  });

  it('generates and displays trading signals', async () => {
    const user = userEvent.setup();
    render(<CloudAtlasBot />);
    
    // Navigate to Engines tab
    const enginesTab = screen.getByText('Engines');
    await user.click(enginesTab);
    
    await waitFor(() => {
      expect(screen.getByText('Trading Engines & ML')).toBeInTheDocument();
    });
    
    // Generate a signal
    const generateSignalButton = screen.getByText('Generate Signal');
    await user.click(generateSignalButton);
    
    // Verify signal generation
    await waitFor(() => {
      expect(screen.getByText(/Signal generated/)).toBeInTheDocument();
    });
  });

  it('monitors and displays system health', async () => {
    const user = userEvent.setup();
    render(<CloudAtlasBot />);
    
    // Navigate to Analytics tab  
    const analyticsTab = screen.getByText('Analysis');
    await user.click(analyticsTab);
    
    await waitFor(() => {
      expect(screen.getByText('AI-Powered Market Analysis')).toBeInTheDocument();
    });
    
    // Run market analysis
    const analysisButton = screen.getByText('Deep Analysis');
    await user.click(analysisButton);
    
    // Verify analysis completion
    await waitFor(() => {
      expect(screen.getByText(/Market Analysis Complete/)).toBeInTheDocument();
    });
  });
});