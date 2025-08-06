import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EnhancedTradingInterface } from '@/components/EnhancedTradingInterface';

// Mock Supabase
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          order: vi.fn(() => ({
            limit: vi.fn(() => Promise.resolve({ data: [], error: null }))
          }))
        }))
      })),
      insert: vi.fn(() => Promise.resolve({ data: null, error: null })),
      update: vi.fn(() => ({
        eq: vi.fn(() => Promise.resolve({ data: null, error: null }))
      }))
    })),
    functions: {
      invoke: vi.fn(() => Promise.resolve({ data: { success: true }, error: null }))
    }
  }
}));

// Mock useAuth hook
vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    user: { id: 'test-user-id', email: 'test@example.com' },
    loading: false
  })
}));

describe('EnhancedTradingInterface', () => {
  it('renders trading interface components', () => {
    render(<EnhancedTradingInterface />);
    
    expect(screen.getByText('Enhanced Trading Interface')).toBeInTheDocument();
    expect(screen.getByText('Quick Trade')).toBeInTheDocument();
    expect(screen.getByText('Risk Management')).toBeInTheDocument();
  });

  it('allows symbol selection', async () => {
    const user = userEvent.setup();
    render(<EnhancedTradingInterface />);
    
    const symbolSelect = screen.getByRole('combobox');
    await user.click(symbolSelect);
    
    await waitFor(() => {
      expect(screen.getByText('BTC/USD')).toBeInTheDocument();
      expect(screen.getByText('ETH/USD')).toBeInTheDocument();
    });
  });

  it('validates trade inputs', async () => {
    const user = userEvent.setup();
    render(<EnhancedTradingInterface />);
    
    const quantityInput = screen.getByPlaceholderText('Enter quantity');
    await user.type(quantityInput, '-1');
    
    const submitButton = screen.getByText('Place Order');
    await user.click(submitButton);
    
    await waitFor(() => {
      expect(screen.getByText('Quantity must be greater than 0')).toBeInTheDocument();
    });
  });

  it('calculates position size correctly', async () => {
    const user = userEvent.setup();
    render(<EnhancedTradingInterface />);
    
    const riskInput = screen.getByPlaceholderText('Risk amount');
    await user.type(riskInput, '100');
    
    const priceInput = screen.getByPlaceholderText('Price');
    await user.type(priceInput, '50000');
    
    await waitFor(() => {
      // Should calculate position size based on risk and price
      const calculatedSize = screen.getByText(/Calculated Position Size:/);
      expect(calculatedSize).toBeInTheDocument();
    });
  });
});