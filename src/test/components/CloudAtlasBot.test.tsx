import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CloudAtlasBot } from '@/components/CloudAtlasBot';

// Mock Supabase
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: vi.fn(() => Promise.resolve({ data: null, error: null }))
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
      getSession: vi.fn(() => Promise.resolve({ data: { session: null }, error: null })),
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } }))
    },
    functions: {
      invoke: vi.fn(() => Promise.resolve({ data: null, error: null }))
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

describe('CloudAtlasBot', () => {
  it('renders without crashing', () => {
    render(<CloudAtlasBot />);
    expect(screen.getByText('Cloud Atlas Bot')).toBeInTheDocument();
  });

  it('displays navigation tabs correctly', () => {
    render(<CloudAtlasBot />);
    
    expect(screen.getByText('Dashboard')).toBeInTheDocument();
    expect(screen.getByText('Trading')).toBeInTheDocument();
    expect(screen.getByText('Strategies')).toBeInTheDocument();
    expect(screen.getByText('Analytics')).toBeInTheDocument();
  });

  it('allows tab navigation', async () => {
    const user = userEvent.setup();
    render(<CloudAtlasBot />);
    
    const tradingTab = screen.getByText('Trading');
    await user.click(tradingTab);
    
    await waitFor(() => {
      expect(screen.getByText('Trading Interface')).toBeInTheDocument();
    });
  });

  it('displays trading metrics', () => {
    render(<CloudAtlasBot />);
    
    expect(screen.getByText('Total Portfolio Value')).toBeInTheDocument();
    expect(screen.getByText('Daily P&L')).toBeInTheDocument();
    expect(screen.getByText('Active Positions')).toBeInTheDocument();
  });
});