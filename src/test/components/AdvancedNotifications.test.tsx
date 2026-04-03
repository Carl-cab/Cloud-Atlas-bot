import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { AdvancedNotifications } from '@/components/AdvancedNotifications';

// Mock the supabase client
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      getUser: vi.fn()
    }
  }
}));

describe('AdvancedNotifications', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders smart filters section', async () => {
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

    render(<AdvancedNotifications />);

    await waitFor(() => {
      expect(screen.getByText('Smart Notification Filters')).toBeInTheDocument();
      expect(screen.getByText('Duplicate Detection')).toBeInTheDocument();
      expect(screen.getByText('Batch Notifications')).toBeInTheDocument();
    });
  });

  it('allows creating custom notification rules', async () => {
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

    render(<AdvancedNotifications />);

    await waitFor(() => {
      expect(screen.getByText('Custom Notification Rules')).toBeInTheDocument();
      expect(screen.getByText('Create New Rule')).toBeInTheDocument();
      expect(screen.getByText('Create Rule')).toBeInTheDocument();
    });
  });

  it('displays quiet hours configuration', async () => {
    render(<AdvancedNotifications />);

    await waitFor(() => {
      expect(screen.getByText('Quiet Hours')).toBeInTheDocument();
    });
  });
});