import React from 'react';
import { MarketDataRegimeDetection } from './MarketDataRegimeDetection';

interface MarketAnalysisProps {
  platform: string;
}

export const MarketAnalysis: React.FC<MarketAnalysisProps> = ({ platform }) => {
  return <MarketDataRegimeDetection />;
};