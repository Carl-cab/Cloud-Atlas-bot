import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PerformanceOptimizer } from '@/components/PerformanceOptimizer';

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

describe('PerformanceOptimizer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders performance overview', () => {
    render(<PerformanceOptimizer />);
    
    expect(screen.getByText('Performance Overview')).toBeInTheDocument();
    expect(screen.getByText('Performance Score')).toBeInTheDocument();
    expect(screen.getByText('Optimize Now')).toBeInTheDocument();
  });

  it('displays performance metrics tabs', () => {
    render(<PerformanceOptimizer />);
    
    expect(screen.getByText('Metrics')).toBeInTheDocument();
    expect(screen.getByText('Recommendations')).toBeInTheDocument();
    expect(screen.getByText('Settings')).toBeInTheDocument();
  });

  it('shows metric cards with performance data', () => {
    render(<PerformanceOptimizer />);
    
    expect(screen.getByText('Response Time')).toBeInTheDocument();
    expect(screen.getByText('Memory Usage')).toBeInTheDocument();
    expect(screen.getByText('Cache Hit Rate')).toBeInTheDocument();
    expect(screen.getByText('Network Latency')).toBeInTheDocument();
  });
});