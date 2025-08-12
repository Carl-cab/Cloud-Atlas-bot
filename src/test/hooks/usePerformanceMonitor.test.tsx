import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { usePerformanceMonitor } from '@/hooks/usePerformanceMonitor';

// Mock performance API
const mockPerformance = {
  now: vi.fn(() => 100),
  getEntriesByType: vi.fn(() => []),
  mark: vi.fn(),
  measure: vi.fn(),
  getEntriesByName: vi.fn(() => [{ duration: 50 }]),
  memory: {
    usedJSHeapSize: 10000000,
    totalJSHeapSize: 50000000
  }
};

Object.defineProperty(global, 'performance', {
  value: mockPerformance,
  writable: true
});

// Mock PerformanceObserver
global.PerformanceObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  disconnect: vi.fn()
})) as any;

(global.PerformanceObserver as any).supportedEntryTypes = ['navigation', 'resource'];

describe('usePerformanceMonitor', () => {
  it('provides performance monitoring functions', () => {
    const { result } = renderHook(() => usePerformanceMonitor());

    expect(result.current).toHaveProperty('performanceData');
    expect(result.current).toHaveProperty('isMonitoring');
    expect(result.current).toHaveProperty('startMonitoring');
    expect(result.current).toHaveProperty('stopMonitoring');
    expect(result.current).toHaveProperty('trackRenderTime');
    expect(result.current).toHaveProperty('getPerformanceInsights');
    expect(result.current).toHaveProperty('markMilestone');
    expect(result.current).toHaveProperty('measureBetween');
  });

  it('tracks render time correctly', () => {
    const { result } = renderHook(() => usePerformanceMonitor());

    result.current.trackRenderTime('TestComponent', 50);

    expect(result.current.performanceData.renderTime).toBeGreaterThan(0);
  });

  it('provides performance insights', () => {
    const { result } = renderHook(() => usePerformanceMonitor());

    const insights = result.current.getPerformanceInsights();
    expect(Array.isArray(insights)).toBe(true);
  });

  it('marks performance milestones', () => {
    const { result } = renderHook(() => usePerformanceMonitor());

    result.current.markMilestone('test-milestone');
    expect(mockPerformance.mark).toHaveBeenCalledWith('test-milestone');
  });
});