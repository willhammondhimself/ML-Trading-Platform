import { EventEmitter } from 'events';
import { logger } from '../utils/logger';

export interface SatelliteLocation {
  id: string;
  name: string;
  symbol: string; // Associated stock symbol
  latitude: number;
  longitude: number;
  type: 'retail_store' | 'warehouse' | 'factory' | 'office' | 'restaurant';
  importance: number; // 0-1 weighting for revenue impact
}

export interface FootTrafficData {
  locationId: string;
  timestamp: number;
  vehicleCount: number;
  parkingOccupancy: number; // 0-1 (percentage full)
  trafficDensity: number; // vehicles per hectare
  seasonalAdjustment: number; // adjustment factor for seasonality
  weatherAdjustment: number; // adjustment factor for weather
  confidence: number; // 0-1 confidence in measurement
  rawImageUrl?: string; // URL to satellite image (in real system)
}

export interface LocationInsight {
  locationId: string;
  symbol: string;
  name: string;
  currentActivity: 'low' | 'normal' | 'high' | 'peak';
  activityScore: number; // 0-100 normalized activity level
  trend: 'increasing' | 'decreasing' | 'stable';
  trendStrength: number; // 0-1 strength of trend
  weekOverWeekChange: number; // percentage change vs last week
  seasonalExpected: number; // expected activity for this time
  anomalyScore: number; // 0-1 how unusual current activity is
  revenueImpact: 'positive' | 'negative' | 'neutral';
  impactMagnitude: number; // 0-1 expected impact on earnings
  lastUpdated: number;
}

export interface SatelliteAnalysisReport {
  symbol: string;
  analysisDate: number;
  locations: LocationInsight[];
  aggregateMetrics: {
    totalLocations: number;
    averageActivity: number;
    positiveLocations: number;
    negativeLocations: number;
    overallTrend: 'bullish' | 'bearish' | 'neutral';
    confidenceLevel: number;
  };
  keyInsights: string[];
  tradingSignal: {
    signal: 'buy' | 'sell' | 'hold';
    strength: number; // 0-1
    timeframe: '1d' | '1w' | '1m';
    reasoning: string;
  };
  historicalComparison: {
    vsLastWeek: number;
    vsLastMonth: number;
    vsLastQuarter: number;
    seasonalPercentile: number; // percentile vs historical seasonal data
  };
}

export interface MacroEconomicIndicator {
  indicator: string;
  value: number;
  previousValue: number;
  change: number;
  changePercent: number;
  timestamp: number;
  impact: 'positive' | 'negative' | 'neutral';
  description: string;
}

export class SatelliteAnalysisService extends EventEmitter {
  private locations: Map<string, SatelliteLocation> = new Map();
  private footTrafficHistory: Map<string, FootTrafficData[]> = new Map();
  private locationInsights: Map<string, LocationInsight> = new Map();
  private analysisReports: Map<string, SatelliteAnalysisReport> = new Map();
  private macroIndicators: Map<string, MacroEconomicIndicator> = new Map();

  // Retail locations for major companies
  private readonly RETAIL_LOCATIONS: SatelliteLocation[] = [
    // Apple Stores
    { id: 'aapl_fifth_ave', name: 'Apple Fifth Avenue', symbol: 'AAPL', latitude: 40.7638, longitude: -73.9735, type: 'retail_store', importance: 0.95 },
    { id: 'aapl_grove', name: 'Apple The Grove', symbol: 'AAPL', latitude: 34.0728, longitude: -118.3561, type: 'retail_store', importance: 0.85 },
    { id: 'aapl_michigan_ave', name: 'Apple Michigan Avenue', symbol: 'AAPL', latitude: 41.8968, longitude: -87.6242, type: 'retail_store', importance: 0.80 },
    
    // Tesla Showrooms & Superchargers
    { id: 'tsla_fremont', name: 'Tesla Fremont Factory', symbol: 'TSLA', latitude: 37.4937, longitude: -121.9440, type: 'factory', importance: 1.0 },
    { id: 'tsla_manhattan', name: 'Tesla Manhattan', symbol: 'TSLA', latitude: 40.7521, longitude: -73.9876, type: 'retail_store', importance: 0.75 },
    { id: 'tsla_beverly_hills', name: 'Tesla Beverly Hills', symbol: 'TSLA', latitude: 34.0736, longitude: -118.3994, type: 'retail_store', importance: 0.70 },
    
    // Amazon Warehouses
    { id: 'amzn_tracy', name: 'Amazon Tracy Fulfillment', symbol: 'AMZN', latitude: 37.7272, longitude: -121.4269, type: 'warehouse', importance: 0.90 },
    { id: 'amzn_staten_island', name: 'Amazon Staten Island', symbol: 'AMZN', latitude: 40.6176, longitude: -74.1559, type: 'warehouse', importance: 0.85 },
    
    // Starbucks Flagship Stores
    { id: 'sbux_pike_place', name: 'Starbucks Pike Place', symbol: 'SBUX', latitude: 47.6097, longitude: -122.3432, type: 'restaurant', importance: 0.95 },
    { id: 'sbux_reserve_roastery', name: 'Starbucks Reserve NYC', symbol: 'SBUX', latitude: 40.7410, longitude: -73.9897, type: 'restaurant', importance: 0.90 },
    
    // McDonald's High-Traffic Locations
    { id: 'mcd_times_square', name: 'McDonalds Times Square', symbol: 'MCD', latitude: 40.7580, longitude: -73.9855, type: 'restaurant', importance: 0.85 },
    { id: 'mcd_las_vegas', name: 'McDonalds Las Vegas Strip', symbol: 'MCD', latitude: 36.1147, longitude: -115.1728, type: 'restaurant', importance: 0.80 },
    
    // Walmart Supercenters
    { id: 'wmt_bentonville', name: 'Walmart Supercenter Bentonville', symbol: 'WMT', latitude: 36.3729, longitude: -94.2088, type: 'retail_store', importance: 0.95 },
    { id: 'wmt_murphy', name: 'Walmart Supercenter Murphy', symbol: 'WMT', latitude: 33.0137, longitude: -96.6131, type: 'retail_store', importance: 0.75 }
  ];

  constructor() {
    super();
    this.initializeLocations();
    this.generateMockFootTrafficData();
    this.generateLocationInsights();
    this.generateMacroIndicators();
    logger.info(`Satellite Analysis Service initialized with ${this.locations.size} monitored locations`);
  }

  /**
   * Initialize monitored locations
   */
  private initializeLocations(): void {
    this.RETAIL_LOCATIONS.forEach(location => {
      this.locations.set(location.id, location);
    });
  }

  /**
   * Generate mock satellite foot traffic data
   */
  private generateMockFootTrafficData(): void {
    const now = Date.now();
    
    // Generate 30 days of historical data for each location
    for (const location of this.locations.values()) {
      const history: FootTrafficData[] = [];
      
      for (let days = 30; days >= 0; days--) {
        for (let hour = 8; hour <= 22; hour += 2) { // Data every 2 hours during business hours
          const timestamp = now - (days * 24 * 60 * 60 * 1000) + (hour * 60 * 60 * 1000);
          
          // Generate realistic patterns based on location type and time
          const baseActivity = this.getBaseActivityLevel(location, hour, days);
          const seasonalFactor = this.getSeasonalFactor(timestamp);
          const weatherFactor = 0.85 + Math.random() * 0.3; // Random weather impact
          const randomVariation = 0.8 + Math.random() * 0.4;
          
          const activity = baseActivity * seasonalFactor * weatherFactor * randomVariation;
          
          const footTraffic: FootTrafficData = {
            locationId: location.id,
            timestamp,
            vehicleCount: Math.round(activity * (location.type === 'warehouse' ? 150 : location.type === 'factory' ? 200 : 80)),
            parkingOccupancy: Math.min(0.95, activity * (0.6 + Math.random() * 0.3)),
            trafficDensity: activity * (10 + Math.random() * 5),
            seasonalAdjustment: seasonalFactor,
            weatherAdjustment: weatherFactor,
            confidence: 0.85 + Math.random() * 0.1,
            rawImageUrl: `https://satellite-api.example.com/images/${location.id}/${timestamp}.jpg`
          };
          
          history.push(footTraffic);
        }
      }
      
      this.footTrafficHistory.set(location.id, history);
    }
  }

  /**
   * Get base activity level for a location based on type and time
   */
  private getBaseActivityLevel(location: SatelliteLocation, hour: number, daysAgo: number): number {
    const dayOfWeek = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000).getDay();
    
    // Base activity by location type
    let baseActivity = location.importance;
    
    // Adjust for day of week
    if (location.type === 'retail_store' || location.type === 'restaurant') {
      // Retail/restaurants busier on weekends
      if (dayOfWeek === 0 || dayOfWeek === 6) baseActivity *= 1.3; // Sunday/Saturday
      else if (dayOfWeek === 5) baseActivity *= 1.1; // Friday
      else if (dayOfWeek === 1) baseActivity *= 0.8; // Monday
    } else if (location.type === 'warehouse' || location.type === 'factory') {
      // Industrial locations busier on weekdays
      if (dayOfWeek === 0 || dayOfWeek === 6) baseActivity *= 0.3; // Weekend
      else baseActivity *= 1.0;
    }
    
    // Adjust for hour of day
    if (location.type === 'retail_store') {
      if (hour >= 10 && hour <= 14) baseActivity *= 1.2; // Lunch rush
      else if (hour >= 17 && hour <= 20) baseActivity *= 1.4; // Evening rush
      else if (hour <= 9 || hour >= 21) baseActivity *= 0.6; // Early/late
    } else if (location.type === 'restaurant') {
      if (hour >= 11 && hour <= 13) baseActivity *= 1.5; // Lunch
      else if (hour >= 17 && hour <= 20) baseActivity *= 1.6; // Dinner
      else if (hour <= 10 || hour >= 21) baseActivity *= 0.4; // Off hours
    } else if (location.type === 'warehouse' || location.type === 'factory') {
      if (hour >= 8 && hour <= 17) baseActivity *= 1.0; // Business hours
      else baseActivity *= 0.2; // After hours
    }
    
    return Math.max(0.1, Math.min(1.0, baseActivity));
  }

  /**
   * Get seasonal adjustment factor
   */
  private getSeasonalFactor(timestamp: number): number {
    const date = new Date(timestamp);
    const month = date.getMonth();
    const day = date.getDate();
    
    // Holiday seasons
    if ((month === 10 && day >= 20) || (month === 11)) return 1.4; // Black Friday/Holiday shopping
    if (month === 0 && day <= 7) return 0.7; // Post-holiday lull
    if (month === 6 || month === 7) return 1.2; // Summer activity
    if (month === 2 && day >= 15) return 1.1; // Spring pickup
    
    return 1.0; // Normal seasonal activity
  }

  /**
   * Generate location insights from foot traffic data
   */
  private generateLocationInsights(): void {
    for (const location of this.locations.values()) {
      const history = this.footTrafficHistory.get(location.id) || [];
      if (history.length === 0) continue;
      
      // Get recent data (last 7 days)
      const recentData = history.filter(d => d.timestamp > Date.now() - 7 * 24 * 60 * 60 * 1000);
      const lastWeekData = history.filter(d => 
        d.timestamp > Date.now() - 14 * 24 * 60 * 60 * 1000 && 
        d.timestamp <= Date.now() - 7 * 24 * 60 * 60 * 1000
      );
      
      if (recentData.length === 0) continue;
      
      // Calculate current activity metrics
      const avgActivity = recentData.reduce((sum, d) => sum + d.parkingOccupancy, 0) / recentData.length;
      const lastWeekAvg = lastWeekData.reduce((sum, d) => sum + d.parkingOccupancy, 0) / lastWeekData.length;
      const weekOverWeekChange = lastWeekAvg > 0 ? ((avgActivity - lastWeekAvg) / lastWeekAvg) * 100 : 0;
      
      // Determine activity level
      let currentActivity: 'low' | 'normal' | 'high' | 'peak';
      if (avgActivity > 0.8) currentActivity = 'peak';
      else if (avgActivity > 0.6) currentActivity = 'high';
      else if (avgActivity > 0.3) currentActivity = 'normal';
      else currentActivity = 'low';
      
      // Determine trend
      const recentTrend = this.calculateTrend(recentData.map(d => d.parkingOccupancy));
      let trend: 'increasing' | 'decreasing' | 'stable';
      let trendStrength: number;
      
      if (Math.abs(recentTrend) < 0.02) {
        trend = 'stable';
        trendStrength = 0.1;
      } else if (recentTrend > 0) {
        trend = 'increasing';
        trendStrength = Math.min(1.0, Math.abs(recentTrend) * 10);
      } else {
        trend = 'decreasing';
        trendStrength = Math.min(1.0, Math.abs(recentTrend) * 10);
      }
      
      // Calculate anomaly score (how unusual is current activity)
      const seasonalExpected = this.getSeasonalFactor(Date.now()) * location.importance * 0.6;
      const anomalyScore = Math.abs(avgActivity - seasonalExpected) / seasonalExpected;
      
      // Determine revenue impact
      let revenueImpact: 'positive' | 'negative' | 'neutral';
      let impactMagnitude: number;
      
      if (weekOverWeekChange > 5 || anomalyScore > 0.3) {
        revenueImpact = weekOverWeekChange > 0 ? 'positive' : 'negative';
        impactMagnitude = Math.min(1.0, (Math.abs(weekOverWeekChange) / 20 + anomalyScore) / 2);
      } else {
        revenueImpact = 'neutral';
        impactMagnitude = 0.1;
      }
      
      const insight: LocationInsight = {
        locationId: location.id,
        symbol: location.symbol,
        name: location.name,
        currentActivity,
        activityScore: Math.round(avgActivity * 100),
        trend,
        trendStrength,
        weekOverWeekChange,
        seasonalExpected: seasonalExpected * 100,
        anomalyScore: Math.min(1.0, anomalyScore),
        revenueImpact,
        impactMagnitude,
        lastUpdated: Date.now()
      };
      
      this.locationInsights.set(location.id, insight);
    }
  }

  /**
   * Calculate trend from time series data
   */
  private calculateTrend(values: number[]): number {
    if (values.length < 2) return 0;
    
    const n = values.length;
    let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
    
    for (let i = 0; i < n; i++) {
      sumX += i;
      sumY += values[i];
      sumXY += i * values[i];
      sumXX += i * i;
    }
    
    const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
    return slope;
  }

  /**
   * Generate macro economic indicators
   */
  private generateMacroIndicators(): void {
    const indicators = [
      {
        indicator: 'Consumer Confidence Index',
        value: 102.5,
        previousValue: 98.2,
        description: 'Measures consumer optimism about the economy'
      },
      {
        indicator: 'Retail Sales Growth',
        value: 3.2,
        previousValue: 2.8,
        description: 'Month-over-month retail sales growth rate'
      },
      {
        indicator: 'Unemployment Rate',
        value: 3.7,
        previousValue: 3.9,
        description: 'National unemployment rate'
      },
      {
        indicator: 'GDP Growth Rate',
        value: 2.1,
        previousValue: 1.8,
        description: 'Quarterly GDP growth rate (annualized)'
      },
      {
        indicator: 'Vehicle Miles Traveled',
        value: 285.2,
        previousValue: 282.1,
        description: 'Billions of vehicle miles traveled (monthly)'
      },
      {
        indicator: 'E-commerce Penetration',
        value: 15.8,
        previousValue: 15.2,
        description: 'E-commerce as % of total retail sales'
      }
    ];
    
    indicators.forEach(ind => {
      const change = ind.value - ind.previousValue;
      const changePercent = (change / ind.previousValue) * 100;
      let impact: 'positive' | 'negative' | 'neutral';
      
      if (ind.indicator === 'Unemployment Rate') {
        impact = change < 0 ? 'positive' : change > 0 ? 'negative' : 'neutral';
      } else {
        impact = change > 0 ? 'positive' : change < 0 ? 'negative' : 'neutral';
      }
      
      const macro: MacroEconomicIndicator = {
        indicator: ind.indicator,
        value: ind.value,
        previousValue: ind.previousValue,
        change,
        changePercent,
        timestamp: Date.now(),
        impact,
        description: ind.description
      };
      
      this.macroIndicators.set(ind.indicator, macro);
    });
  }

  /**
   * Generate satellite analysis report for a symbol
   */
  generateAnalysisReport(symbol: string): SatelliteAnalysisReport | null {
    // Get all locations for this symbol
    const symbolLocations = Array.from(this.locations.values()).filter(loc => loc.symbol === symbol);
    if (symbolLocations.length === 0) return null;
    
    // Get insights for these locations
    const locationInsights = symbolLocations.map(loc => this.locationInsights.get(loc.id)).filter(Boolean) as LocationInsight[];
    if (locationInsights.length === 0) return null;
    
    // Calculate aggregate metrics
    const totalLocations = locationInsights.length;
    const averageActivity = locationInsights.reduce((sum, ins) => sum + ins.activityScore, 0) / totalLocations;
    const positiveLocations = locationInsights.filter(ins => ins.revenueImpact === 'positive').length;
    const negativeLocations = locationInsights.filter(ins => ins.revenueImpact === 'negative').length;
    
    // Determine overall trend
    const positiveWeight = locationInsights
      .filter(ins => ins.revenueImpact === 'positive')
      .reduce((sum, ins) => sum + ins.impactMagnitude * this.locations.get(ins.locationId)!.importance, 0);
    const negativeWeight = locationInsights
      .filter(ins => ins.revenueImpact === 'negative')
      .reduce((sum, ins) => sum + ins.impactMagnitude * this.locations.get(ins.locationId)!.importance, 0);
    
    let overallTrend: 'bullish' | 'bearish' | 'neutral';
    if (positiveWeight > negativeWeight * 1.2) overallTrend = 'bullish';
    else if (negativeWeight > positiveWeight * 1.2) overallTrend = 'bearish';
    else overallTrend = 'neutral';
    
    // Generate key insights
    const keyInsights = this.generateKeyInsights(symbol, locationInsights);
    
    // Generate trading signal
    const tradingSignal = this.generateTradingSignal(symbol, locationInsights, overallTrend);
    
    // Calculate historical comparisons
    const historicalComparison = {
      vsLastWeek: locationInsights.reduce((sum, ins) => sum + ins.weekOverWeekChange, 0) / totalLocations,
      vsLastMonth: -2.1 + Math.random() * 8.4, // Mock data
      vsLastQuarter: 1.8 + Math.random() * 6.4, // Mock data
      seasonalPercentile: 45 + Math.random() * 40 // Mock seasonal percentile
    };
    
    const report: SatelliteAnalysisReport = {
      symbol,
      analysisDate: Date.now(),
      locations: locationInsights,
      aggregateMetrics: {
        totalLocations,
        averageActivity,
        positiveLocations,
        negativeLocations,
        overallTrend,
        confidenceLevel: Math.min(0.95, 0.7 + (totalLocations / 10) * 0.2) // More locations = higher confidence
      },
      keyInsights,
      tradingSignal,
      historicalComparison
    };
    
    this.analysisReports.set(symbol, report);
    return report;
  }

  /**
   * Generate key insights from location data
   */
  private generateKeyInsights(symbol: string, insights: LocationInsight[]): string[] {
    const keyInsights: string[] = [];
    
    // Activity level insights
    const highActivityLocations = insights.filter(ins => ins.currentActivity === 'high' || ins.currentActivity === 'peak');
    if (highActivityLocations.length > insights.length * 0.6) {
      keyInsights.push(`Strong foot traffic across ${highActivityLocations.length}/${insights.length} locations indicates robust consumer demand`);
    }
    
    // Trend insights
    const increasingLocations = insights.filter(ins => ins.trend === 'increasing' && ins.trendStrength > 0.5);
    if (increasingLocations.length > insights.length * 0.5) {
      keyInsights.push(`${increasingLocations.length} locations show increasing traffic trends, suggesting momentum building`);
    }
    
    // Anomaly insights
    const anomalousLocations = insights.filter(ins => ins.anomalyScore > 0.5);
    if (anomalousLocations.length > 0) {
      keyInsights.push(`${anomalousLocations.length} locations showing unusual activity patterns warrant closer monitoring`);
    }
    
    // Week-over-week insights
    const avgWoWChange = insights.reduce((sum, ins) => sum + ins.weekOverWeekChange, 0) / insights.length;
    if (Math.abs(avgWoWChange) > 3) {
      keyInsights.push(`Average ${avgWoWChange > 0 ? 'increase' : 'decrease'} of ${Math.abs(avgWoWChange).toFixed(1)}% in foot traffic vs last week`);
    }
    
    // Location-specific insights
    const topPerformer = insights.reduce((best, current) => 
      current.activityScore > best.activityScore ? current : best
    );
    keyInsights.push(`${topPerformer.name} showing strongest activity at ${topPerformer.activityScore}% capacity`);
    
    return keyInsights.slice(0, 5); // Return top 5 insights
  }

  /**
   * Generate trading signal based on satellite analysis
   */
  private generateTradingSignal(symbol: string, insights: LocationInsight[], overallTrend: string): {
    signal: 'buy' | 'sell' | 'hold';
    strength: number;
    timeframe: '1d' | '1w' | '1m';
    reasoning: string;
  } {
    // Calculate composite score
    const avgActivity = insights.reduce((sum, ins) => sum + ins.activityScore, 0) / insights.length;
    const avgWoWChange = insights.reduce((sum, ins) => sum + ins.weekOverWeekChange, 0) / insights.length;
    const positiveMomentum = insights.filter(ins => ins.trend === 'increasing').length / insights.length;
    
    // Weighted signal strength calculation
    let signalStrength = (
      (avgActivity - 50) / 50 * 0.3 +  // Activity level impact
      avgWoWChange / 10 * 0.4 +         // Week-over-week momentum
      (positiveMomentum - 0.5) * 0.3    // Trend momentum
    );
    
    // Determine signal and strength
    let signal: 'buy' | 'sell' | 'hold';
    let strength: number;
    let timeframe: '1d' | '1w' | '1m';
    
    if (signalStrength > 0.15) {
      signal = 'buy';
      strength = Math.min(0.95, signalStrength * 2);
      timeframe = signalStrength > 0.3 ? '1w' : '1d';
    } else if (signalStrength < -0.15) {
      signal = 'sell';
      strength = Math.min(0.95, Math.abs(signalStrength) * 2);
      timeframe = signalStrength < -0.3 ? '1w' : '1d';
    } else {
      signal = 'hold';
      strength = 0.1 + Math.random() * 0.2;
      timeframe = '1d';
    }
    
    // Generate reasoning
    let reasoning = '';
    if (signal === 'buy') {
      reasoning = `Satellite data shows ${avgActivity.toFixed(0)}% average foot traffic with ${avgWoWChange > 0 ? '+' : ''}${avgWoWChange.toFixed(1)}% week-over-week growth. ${Math.round(positiveMomentum * 100)}% of locations trending upward.`;
    } else if (signal === 'sell') {
      reasoning = `Declining foot traffic at ${avgActivity.toFixed(0)}% capacity with ${avgWoWChange.toFixed(1)}% weekly decline. Negative momentum across multiple locations suggests weakening fundamentals.`;
    } else {
      reasoning = `Mixed signals from satellite data with ${avgActivity.toFixed(0)}% average activity. No clear directional bias warranting position changes.`;
    }
    
    return { signal, strength, timeframe, reasoning };
  }

  /**
   * Get all analysis reports
   */
  getAllAnalysisReports(): SatelliteAnalysisReport[] {
    // Generate reports for all symbols with locations
    const symbols = [...new Set(Array.from(this.locations.values()).map(loc => loc.symbol))];
    
    return symbols.map(symbol => {
      const existing = this.analysisReports.get(symbol);
      if (existing && Date.now() - existing.analysisDate < 6 * 60 * 60 * 1000) { // Use cached if < 6 hours old
        return existing;
      }
      return this.generateAnalysisReport(symbol)!;
    }).filter(Boolean);
  }

  /**
   * Get foot traffic data for a location
   */
  getFootTrafficData(locationId: string, days: number = 7): FootTrafficData[] {
    const history = this.footTrafficHistory.get(locationId) || [];
    const since = Date.now() - days * 24 * 60 * 60 * 1000;
    return history.filter(data => data.timestamp >= since);
  }

  /**
   * Get location insights
   */
  getLocationInsights(symbol?: string): LocationInsight[] {
    const allInsights = Array.from(this.locationInsights.values());
    return symbol ? allInsights.filter(insight => insight.symbol === symbol) : allInsights;
  }

  /**
   * Get macro economic indicators
   */
  getMacroIndicators(): MacroEconomicIndicator[] {
    return Array.from(this.macroIndicators.values());
  }

  /**
   * Get monitored locations
   */
  getMonitoredLocations(symbol?: string): SatelliteLocation[] {
    const allLocations = Array.from(this.locations.values());
    return symbol ? allLocations.filter(loc => loc.symbol === symbol) : allLocations;
  }

  /**
   * Start real-time satellite analysis updates
   */
  startRealTimeUpdates(intervalMs: number = 300000): void { // 5 minutes default
    logger.info('Starting real-time satellite analysis updates');
    
    const updateAnalysis = () => {
      try {
        // Update location insights
        this.generateLocationInsights();
        
        // Generate fresh analysis reports
        const symbols = [...new Set(Array.from(this.locations.values()).map(loc => loc.symbol))];
        symbols.forEach(symbol => {
          const report = this.generateAnalysisReport(symbol);
          if (report) {
            this.emit('analysis-updated', { symbol, report });
          }
        });
        
        // Update macro indicators (less frequently)
        if (Math.random() < 0.1) { // 10% chance to update macro indicators
          this.generateMacroIndicators();
          this.emit('macro-updated', this.getMacroIndicators());
        }
        
        logger.info('Satellite analysis data updated');
        
      } catch (error) {
        logger.error('Error updating satellite analysis:', error);
      }
    };
    
    // Initial update
    updateAnalysis();
    
    // Set up interval
    setInterval(updateAnalysis, intervalMs);
  }
}