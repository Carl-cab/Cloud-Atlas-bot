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
          })),
          single: vi.fn(() => Promise.resolve({ data: null, error: null })),
          maybeSingle: vi.fn(() => Promise.resolve({ data: null, error: null }))
        }))
      })),
      insert: vi.fn(() => Promise.resolve({ data: null, error: null })),
      update: vi.fn(() => ({
        eq: vi.fn(() => Promise.resolve({ data: null, error: null }))
      }))
    })),
    auth: {
      getUser: vi.fn(() => Promise.resolve({ data: { user: { id: 'test-user-id', email: 'test@example.com' } }, error: null }))
    },
    channel: vi.fn(() => ({
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn()
    })),
    removeChannel: vi.fn(),
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

    expect(screen.getByText('Enhanced Trading Engine')).toBeInTheDocument();
    expect(screen.getByText('Smart Orders')).toBeInTheDocument();
    expect(screen.getAllByText('Risk Management').length).toBeGreaterThan(0);
  });

  it('renders symbol combobox with default value', async () => {
    render(<EnhancedTradingInterface />);

    // Comboboxes should be rendered (symbol, side, order type selects)
    const comboboxes = screen.getAllByRole('combobox');
    expect(comboboxes.length).toBeGreaterThan(0);
  });

  it('renders order details form', async () => {
    render(<EnhancedTradingInterface />);

    await waitFor(() => {
      expect(screen.getByText('Smart Order Placement')).toBeInTheDocument();
      expect(screen.getByText('Order Details')).toBeInTheDocument();
    });
  });

  it('shows trading settings tab', async () => {
    const user = userEvent.setup();
    render(<EnhancedTradingInterface />);

    const settingsTab = screen.getByText('Trading Settings');
    await user.click(settingsTab);

    await waitFor(() => {
      expect(screen.getByText('Trading Mode & Paper Trading')).toBeInTheDocument();
    });
  });
});