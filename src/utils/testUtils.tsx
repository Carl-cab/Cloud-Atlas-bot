import React from 'react';
import { render as rtlRender, RenderOptions } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '@/hooks/useAuth';
import { Toaster } from '@/components/ui/toaster';
import { vi } from 'vitest';

// Create a custom render function that includes providers
function createTestWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
      },
      mutations: {
        retry: false,
      },
    },
  });

  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        {children}
        <Toaster />
      </AuthProvider>
    </QueryClientProvider>
  );
}

export const render = (
  ui: React.ReactElement,
  options?: Omit<RenderOptions, 'wrapper'>
) => {
  const Wrapper = createTestWrapper();
  return rtlRender(ui, { wrapper: Wrapper, ...options });
};

// Mock data generators for testing
export const mockUser = {
  id: 'test-user-id',
  email: 'test@example.com',
  created_at: new Date().toISOString(),
  user_metadata: {},
  app_metadata: {},
  aud: 'authenticated',
  role: 'authenticated'
};

export const mockSession = {
  access_token: 'mock-access-token',
  refresh_token: 'mock-refresh-token',
  expires_in: 3600,
  token_type: 'bearer',
  user: mockUser
};

export const mockNotification = {
  id: 'test-notification-id',
  user_id: 'test-user-id',
  type: 'trade_alert',
  title: 'Test Notification',
  message: 'This is a test notification',
  priority: 'medium',
  read: false,
  created_at: new Date().toISOString(),
  data: {}
};

export const mockTradingPosition = {
  id: 'test-position-id',
  user_id: 'test-user-id',
  symbol: 'BTCUSD',
  side: 'buy',
  quantity: 0.1,
  entry_price: 65000,
  current_price: 66000,
  unrealized_pnl: 100,
  status: 'open',
  strategy_used: 'ML_SIGNAL',
  risk_amount: 500,
  created_at: new Date().toISOString(),
  opened_at: new Date().toISOString()
};

export const mockMarketData = {
  symbol: 'BTCUSD',
  price: 65000,
  bid: 64950,
  ask: 65050,
  volume_24h: 1000000,
  change_24h: 2.5,
  timestamp: new Date().toISOString()
};

// Utility functions for test setup
export const setupMockSupabase = () => {
  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: mockUser }, error: null }),
      signInWithPassword: vi.fn().mockResolvedValue({ data: { user: mockUser, session: mockSession }, error: null }),
      signUp: vi.fn().mockResolvedValue({ data: { user: mockUser, session: mockSession }, error: null }),
      signOut: vi.fn().mockResolvedValue({ error: null }),
      onAuthStateChange: vi.fn().mockReturnValue({
        data: { subscription: { unsubscribe: vi.fn() } }
      })
    },
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      delete: vi.fn().mockReturnThis(),
      upsert: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      single: vi.fn().mockResolvedValue({ data: null, error: null })
    })),
    functions: {
      invoke: vi.fn().mockResolvedValue({ data: null, error: null })
    },
    channel: vi.fn(() => ({
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn(),
      unsubscribe: vi.fn()
    })),
    removeChannel: vi.fn()
  };
};

// Performance testing utilities
export const measureRenderTime = async (renderFn: () => void) => {
  const start = performance.now();
  renderFn();
  const end = performance.now();
  return end - start;
};

export const expectFastRender = (renderTime: number, threshold = 100) => {
  expect(renderTime).toBeLessThan(threshold);
};

// Accessibility testing helpers
export const checkAccessibility = (container: HTMLElement) => {
  // Check for proper ARIA labels
  const buttons = container.querySelectorAll('button');
  buttons.forEach(button => {
    if (!button.getAttribute('aria-label') && !button.textContent?.trim()) {
      console.warn('Button without accessible text:', button);
    }
  });

  // Check for proper heading hierarchy
  const headings = container.querySelectorAll('h1, h2, h3, h4, h5, h6');
  let lastLevel = 0;
  headings.forEach(heading => {
    const level = parseInt(heading.tagName.slice(1));
    if (level > lastLevel + 1) {
      console.warn('Heading hierarchy skipped:', heading);
    }
    lastLevel = level;
  });

  // Check for alt text on images
  const images = container.querySelectorAll('img');
  images.forEach(img => {
    if (!img.getAttribute('alt')) {
      console.warn('Image without alt text:', img);
    }
  });
};

// Re-export everything from testing library
export * from '@testing-library/react';
export { default as userEvent } from '@testing-library/user-event';