import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useAuth, AuthProvider } from '@/hooks/useAuth';

// Mock the supabase client
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      getUser: vi.fn(),
      getSession: vi.fn(),
      signInWithPassword: vi.fn(),
      signUp: vi.fn(),
      signOut: vi.fn(),
      onAuthStateChange: vi.fn()
    }
  }
}));

describe('useAuth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('provides authentication context', () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <AuthProvider>{children}</AuthProvider>
    );

    const { result } = renderHook(() => useAuth(), { wrapper });

    expect(result.current).toHaveProperty('user');
    expect(result.current).toHaveProperty('session');
    expect(result.current).toHaveProperty('loading');
    expect(result.current).toHaveProperty('signIn');
    expect(result.current).toHaveProperty('signUp');
    expect(result.current).toHaveProperty('signOut');
  });

  it('handles sign in', async () => {
    const { supabase } = await import('@/integrations/supabase/client');
    vi.mocked(supabase.auth.signInWithPassword).mockResolvedValue({
      data: { user: null, session: null },
      error: null
    });

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <AuthProvider>{children}</AuthProvider>
    );

    const { result } = renderHook(() => useAuth(), { wrapper });

    await act(async () => {
      const response = await result.current.signIn('test@example.com', 'password');
      expect(response.error).toBe(null);
    });
  });

  it('handles sign up', async () => {
    const { supabase } = await import('@/integrations/supabase/client');
    vi.mocked(supabase.auth.signUp).mockResolvedValue({
      data: { user: null, session: null },
      error: null
    });

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <AuthProvider>{children}</AuthProvider>
    );

    const { result } = renderHook(() => useAuth(), { wrapper });

    await act(async () => {
      const response = await result.current.signUp('test@example.com', 'password', 'Test User');
      expect(response.error).toBe(null);
    });
  });

  it('throws error when used outside AuthProvider', () => {
    expect(() => {
      renderHook(() => useAuth());
    }).toThrow('useAuth must be used within an AuthProvider');
  });
});