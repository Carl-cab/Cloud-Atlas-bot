import React, { useState, useEffect, useCallback } from 'react';

interface PerformanceData {
  loadTime: number;
  renderTime: number;
  memoryUsage: number;
  networkRequests: number;
  errors: number;
}

interface PerformanceConfig {
  trackMemory: boolean;
  trackNetwork: boolean;
  trackErrors: boolean;
  sampleRate: number;
}

export const usePerformanceMonitor = (config: PerformanceConfig = {
  trackMemory: true,
  trackNetwork: true,
  trackErrors: true,
  sampleRate: 1
}) => {
  const [performanceData, setPerformanceData] = useState<PerformanceData>({
    loadTime: 0,
    renderTime: 0,
    memoryUsage: 0,
    networkRequests: 0,
    errors: 0
  });

  const [isMonitoring, setIsMonitoring] = useState(false);

  // Track page load performance
  const trackLoadPerformance = useCallback(() => {
    if (typeof window === 'undefined') return;

    const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
    if (navigation) {
      const loadTime = navigation.loadEventEnd - navigation.fetchStart;
      setPerformanceData(prev => ({ ...prev, loadTime }));
    }
  }, []);

  // Track render performance
  const trackRenderTime = useCallback((componentName: string, startTime: number) => {
    const endTime = performance.now();
    const renderTime = endTime - startTime;
    
    console.log(`${componentName} render time:`, renderTime.toFixed(2), 'ms');
    
    setPerformanceData(prev => ({
      ...prev,
      renderTime: (prev.renderTime + renderTime) / 2 // Moving average
    }));
  }, []);

  // Track memory usage
  const trackMemoryUsage = useCallback(() => {
    if (!config.trackMemory || typeof window === 'undefined') return;

    if ('memory' in performance) {
      const memory = (performance as any).memory;
      const memoryUsage = (memory.usedJSHeapSize / memory.totalJSHeapSize) * 100;
      setPerformanceData(prev => ({ ...prev, memoryUsage }));
    }
  }, [config.trackMemory]);

  // Track network requests
  const trackNetworkRequests = useCallback(() => {
    if (!config.trackNetwork || typeof window === 'undefined') return;

    const networkEntries = performance.getEntriesByType('resource');
    setPerformanceData(prev => ({ ...prev, networkRequests: networkEntries.length }));
  }, [config.trackNetwork]);

  // Track JavaScript errors
  const trackErrors = useCallback(() => {
    if (!config.trackErrors || typeof window === 'undefined') return;

    const errorHandler = (event: ErrorEvent) => {
      setPerformanceData(prev => ({ ...prev, errors: prev.errors + 1 }));
      
      // Log error details
      console.error('Performance Monitor - JavaScript Error:', {
        message: event.message,
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
        error: event.error
      });
    };

    const unhandledRejectionHandler = (event: PromiseRejectionEvent) => {
      setPerformanceData(prev => ({ ...prev, errors: prev.errors + 1 }));
      
      console.error('Performance Monitor - Unhandled Promise Rejection:', event.reason);
    };

    window.addEventListener('error', errorHandler);
    window.addEventListener('unhandledrejection', unhandledRejectionHandler);

    return () => {
      window.removeEventListener('error', errorHandler);
      window.removeEventListener('unhandledrejection', unhandledRejectionHandler);
    };
  }, [config.trackErrors]);

  // Performance observer for monitoring specific metrics
  const setupPerformanceObserver = useCallback(() => {
    if (typeof window === 'undefined' || !('PerformanceObserver' in window)) return;

    const observer = new PerformanceObserver((list) => {
      const entries = list.getEntries();
      
      entries.forEach((entry) => {
        // Track long tasks
        if (entry.entryType === 'longtask') {
          console.warn('Long task detected:', entry.duration, 'ms');
        }
        
        // Track layout shifts
        if (entry.entryType === 'layout-shift' && !(entry as any).hadRecentInput) {
          console.warn('Layout shift detected:', (entry as any).value);
        }
        
        // Track largest contentful paint
        if (entry.entryType === 'largest-contentful-paint') {
          console.log('LCP:', entry.startTime, 'ms');
        }
        
        // Track first input delay
        if (entry.entryType === 'first-input') {
          const fid = (entry as any).processingStart - entry.startTime;
          console.log('FID:', fid, 'ms');
        }
      });
    });

    // Observe different types of performance entries
    try {
      observer.observe({ entryTypes: ['longtask', 'layout-shift', 'largest-contentful-paint', 'first-input'] });
    } catch (error) {
      console.warn('Some performance metrics not supported:', error);
    }

    return () => observer.disconnect();
  }, []);

  // Start monitoring
  const startMonitoring = useCallback(() => {
    if (isMonitoring) return;

    setIsMonitoring(true);
    
    // Initial measurements
    trackLoadPerformance();
    trackMemoryUsage();
    trackNetworkRequests();
    
    // Set up continuous monitoring
    const memoryInterval = setInterval(trackMemoryUsage, 5000);
    const networkInterval = setInterval(trackNetworkRequests, 10000);
    
    // Set up performance observer
    const cleanupObserver = setupPerformanceObserver();
    const cleanupErrors = trackErrors();

    return () => {
      clearInterval(memoryInterval);
      clearInterval(networkInterval);
      cleanupObserver?.();
      cleanupErrors?.();
      setIsMonitoring(false);
    };
  }, [
    isMonitoring,
    trackLoadPerformance,
    trackMemoryUsage,
    trackNetworkRequests,
    setupPerformanceObserver,
    trackErrors
  ]);

  // Stop monitoring
  const stopMonitoring = useCallback(() => {
    setIsMonitoring(false);
  }, []);

  // Get performance insights
  const getPerformanceInsights = useCallback(() => {
    const insights = [];

    if (performanceData.loadTime > 3000) {
      insights.push({
        type: 'warning',
        message: 'Page load time is slow (>3s). Consider optimizing resources.'
      });
    }

    if (performanceData.memoryUsage > 80) {
      insights.push({
        type: 'error',
        message: 'High memory usage detected. Check for memory leaks.'
      });
    }

    if (performanceData.renderTime > 100) {
      insights.push({
        type: 'warning',
        message: 'Slow render times detected. Optimize component rendering.'
      });
    }

    if (performanceData.errors > 0) {
      insights.push({
        type: 'error',
        message: `${performanceData.errors} JavaScript errors detected.`
      });
    }

    return insights;
  }, [performanceData]);

  // Mark performance milestones
  const markMilestone = useCallback((name: string) => {
    if (typeof window !== 'undefined' && 'performance' in window) {
      performance.mark(name);
    }
  }, []);

  // Measure between milestones
  const measureBetween = useCallback((startMark: string, endMark: string, measureName: string) => {
    if (typeof window !== 'undefined' && 'performance' in window) {
      try {
        performance.measure(measureName, startMark, endMark);
        const measure = performance.getEntriesByName(measureName)[0];
        return measure.duration;
      } catch (error) {
        console.warn('Performance measurement failed:', error);
        return 0;
      }
    }
    return 0;
  }, []);

  useEffect(() => {
    if (config.sampleRate > Math.random()) {
      const cleanup = startMonitoring();
      return cleanup;
    }
  }, []); // Remove startMonitoring from dependencies to prevent infinite loop

  return {
    performanceData,
    isMonitoring,
    startMonitoring,
    stopMonitoring,
    trackRenderTime,
    getPerformanceInsights,
    markMilestone,
    measureBetween
  };
};

// HOC for tracking component render performance
export const withPerformanceTracking = <P extends Record<string, any>>(
  WrappedComponent: React.ComponentType<P>,
  componentName: string
) => {
  const PerformanceTrackedComponent = (props: P) => {
    const { trackRenderTime, markMilestone } = usePerformanceMonitor();
    
    React.useEffect(() => {
      markMilestone(`${componentName}-mount-start`);
      const startTime = performance.now();
      
      return () => {
        trackRenderTime(componentName, startTime);
        markMilestone(`${componentName}-unmount`);
      };
    }, [trackRenderTime, markMilestone]);

    const renderStart = performance.now();
    
    React.useEffect(() => {
      const renderEnd = performance.now();
      trackRenderTime(`${componentName}-render`, renderStart);
    });

    return <WrappedComponent {...props} />;
  };

  PerformanceTrackedComponent.displayName = `withPerformanceTracking(${componentName})`;
  
  return PerformanceTrackedComponent;
};