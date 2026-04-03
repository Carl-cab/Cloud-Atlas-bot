import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NotificationCenter } from '@/components/NotificationCenter';

// Mock BotStateProvider context
vi.mock('@/context/BotStateProvider', () => ({
  useBotState: () => ({
    botStatus: { isActive: false, mode: 'paper', balance: 10000, totalPnL: 0, dailyPnL: 0, winRate: 0, activeTrades: 0, riskUsed: 0, maxPositions: 3, riskPerTrade: 1, dailyStopLoss: 5 },
    setBotStatus: vi.fn()
  }),
  BotStateProvider: ({ children }: { children: React.ReactNode }) => children
}));

// Mock the supabase client
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      getUser: vi.fn()
    },
    from: vi.fn(),
    channel: vi.fn(() => ({
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn()
    })),
    removeChannel: vi.fn()
  }
}));

describe('NotificationCenter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders notification settings correctly', async () => {
    // Mock the Supabase client
    const { supabase } = await import('@/integrations/supabase/client');
    vi.mocked(supabase.auth.getUser).mockResolvedValue({
      data: { 
        user: { 
          id: 'test-user-id', 
          email: 'test@example.com',
          app_metadata: {},
          user_metadata: {},
          aud: 'authenticated',
          created_at: new Date().toISOString()
        } 
      },
      error: null
    });

    vi.mocked(supabase.from).mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null })
    } as any);

    render(<NotificationCenter />);
    
    await waitFor(() => {
      expect(screen.getByText('Notification Settings')).toBeInTheDocument();
    });
    
    expect(screen.getByText('Email Notifications')).toBeInTheDocument();
    expect(screen.getByText('Telegram Notifications')).toBeInTheDocument();
  });

  it('saves notification settings', async () => {
    // Mock the Supabase client
    const { supabase } = await import('@/integrations/supabase/client');
    vi.mocked(supabase.auth.getUser).mockResolvedValue({
      data: { 
        user: { 
          id: 'test-user-id', 
          email: 'test@example.com',
          app_metadata: {},
          user_metadata: {},
          aud: 'authenticated',
          created_at: new Date().toISOString()
        } 
      },
      error: null
    });

    vi.mocked(supabase.from).mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      upsert: vi.fn().mockResolvedValue({ data: null, error: null })
    } as any);

    render(<NotificationCenter />);
    
    await waitFor(() => {
      const saveButton = screen.getByText('Save Settings');
      fireEvent.click(saveButton);
    });
  });

  it('displays recent notifications', async () => {
    // Mock the Supabase client
    const { supabase } = await import('@/integrations/supabase/client');
    vi.mocked(supabase.auth.getUser).mockResolvedValue({
      data: { 
        user: { 
          id: 'test-user-id', 
          email: 'test@example.com',
          app_metadata: {},
          user_metadata: {},
          aud: 'authenticated',
          created_at: new Date().toISOString()
        } 
      },
      error: null
    });

    const mockFrom = vi.fn();
    mockFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null })
    });
    mockFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({
        data: [
          {
            id: '1',
            notification_type: 'trade_alert',
            status: 'sent',
            created_at: new Date().toISOString()
          }
        ],
        error: null
      })
    });
    
    vi.mocked(supabase.from).mockImplementation(mockFrom);

    render(<NotificationCenter />);
    
    await waitFor(() => {
      expect(screen.getByText('Recent Notifications')).toBeInTheDocument();
    });
  });
});