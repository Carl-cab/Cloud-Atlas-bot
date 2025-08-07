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
          single: vi.fn(() => Promise.resolve({ data: null, error: null })),
          maybeSingle: vi.fn(() => Promise.resolve({ data: null, error: null }))
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
    expect(screen.getByText('CloudAtlasBot')).toBeInTheDocument();
  });

  it('displays navigation tabs correctly', () => {
    render(<CloudAtlasBot />);
    
    expect(screen.getByText('Enhanced Trading')).toBeInTheDocument();
    expect(screen.getByText('Platform')).toBeInTheDocument();
    expect(screen.getByText('Testing')).toBeInTheDocument();
    expect(screen.getByText('Analysis')).toBeInTheDocument();
  });

  it('allows tab navigation', async () => {
    const user = userEvent.setup();
    render(<CloudAtlasBot />);
    
    const platformTab = screen.getByText('Platform');
    await user.click(platformTab);
    
    await waitFor(() => {
      expect(screen.getByText('Platform Selection System')).toBeInTheDocument();
    });
  });

  it('displays trading metrics', () => {
    render(<CloudAtlasBot />);
    
    expect(screen.getByText('Balance')).toBeInTheDocument();
    expect(screen.getByText('Daily P&L')).toBeInTheDocument();
    expect(screen.getByText('Active Trades')).toBeInTheDocument();
  });
});