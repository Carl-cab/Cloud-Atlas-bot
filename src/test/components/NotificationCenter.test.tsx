import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NotificationCenter } from '@/components/NotificationCenter';

describe('NotificationCenter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    
    // Mock successful user authentication
    const mockSupabase = vi.mocked(await import('@/integrations/supabase/client')).supabase;
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: 'test-user-id', email: 'test@example.com' } },
      error: null
    });
  });

  it('renders notification settings correctly', async () => {
    render(<NotificationCenter />);
    
    await waitFor(() => {
      expect(screen.getByText('Notification Settings')).toBeInTheDocument();
    });
    
    expect(screen.getByText('Email Notifications')).toBeInTheDocument();
    expect(screen.getByText('Telegram Notifications')).toBeInTheDocument();
  });

  it('toggles email notifications', async () => {
    render(<NotificationCenter />);
    
    await waitFor(() => {
      const emailToggle = screen.getByLabelText('Email Notifications');
      expect(emailToggle).toBeInTheDocument();
      
      fireEvent.click(emailToggle);
    });
  });

  it('saves notification settings', async () => {
    const mockSupabase = vi.mocked(await import('@/integrations/supabase/client')).supabase;
    mockSupabase.from.mockReturnValue({
      upsert: vi.fn().mockResolvedValue({ data: null, error: null })
    } as any);

    render(<NotificationCenter />);
    
    await waitFor(() => {
      const saveButton = screen.getByText('Save Settings');
      fireEvent.click(saveButton);
    });
  });

  it('displays recent notifications', async () => {
    const mockSupabase = vi.mocked(await import('@/integrations/supabase/client')).supabase;
    mockSupabase.from.mockReturnValue({
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
      }),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null })
    } as any);

    render(<NotificationCenter />);
    
    await waitFor(() => {
      expect(screen.getByText('Recent Notifications')).toBeInTheDocument();
    });
  });
});