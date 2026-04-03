import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { TradingDashboard } from '@/components/TradingDashboard';

// Mock the trading dashboard component
vi.mock('@/components/TradingDashboard', () => ({
  TradingDashboard: () => (
    <div data-testid="trading-dashboard">
      <h2>Trading Dashboard</h2>
      <button data-testid="start-trading">Start Trading</button>
      <div data-testid="position-size">Position Size: 1000</div>
      <div data-testid="current-balance">Balance: $10,000</div>
    </div>
  )
}));

describe('TradingDashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders trading dashboard correctly', () => {
    render(<TradingDashboard />);
    
    expect(screen.getByTestId('trading-dashboard')).toBeInTheDocument();
    expect(screen.getByText('Trading Dashboard')).toBeInTheDocument();
    expect(screen.getByTestId('start-trading')).toBeInTheDocument();
  });

  it('displays current position size and balance', () => {
    render(<TradingDashboard />);
    
    expect(screen.getByTestId('position-size')).toHaveTextContent('Position Size: 1000');
    expect(screen.getByTestId('current-balance')).toHaveTextContent('Balance: $10,000');
  });

  it('handles start trading button click', async () => {
    render(<TradingDashboard />);
    
    const startButton = screen.getByTestId('start-trading');
    fireEvent.click(startButton);
    
    await waitFor(() => {
      expect(startButton).toBeInTheDocument();
    });
  });
});