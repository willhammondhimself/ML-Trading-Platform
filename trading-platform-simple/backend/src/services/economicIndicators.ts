import { EventEmitter } from 'events';
import { logger } from '../utils/logger';

export interface EconomicIndicator {
  id: string;
  name: string;
  category: 'monetary' | 'fiscal' | 'employment' | 'inflation' | 'growth' | 'consumer' | 'housing' | 'trade';
  frequency: 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'annual';
  value: number;
  previousValue: number;
  change: number;
  changePercent: number;
  timestamp: number;
  releaseDate: number;
  nextRelease?: number;
  importance: 'low' | 'medium' | 'high' | 'critical';
  marketImpact: 'positive' | 'negative' | 'neutral';
  impactMagnitude: number; // 0-1 expected market reaction
  description: string;
  source: string;
  unit: string;
  forecast?: number;
  surprise?: number; // actual vs forecast
}

export interface MacroTrend {
  category: string;
  direction: 'bullish' | 'bearish' | 'neutral';
  strength: number; // 0-1
  confidence: number; // 0-1
  timeframe: '1w' | '1m' | '3m' | '6m' | '1y';
  keyIndicators: string[];
  reasoning: string;
  lastUpdated: number;
}

export interface EconomicAlert {
  id: string;
  type: 'indicator_release' | 'threshold_breach' | 'trend_change' | 'surprise';
  severity: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  message: string;
  indicatorId: string;
  timestamp: number;
  acknowledged: boolean;
  marketImplication: string;
  actionRequired: boolean;
}

export interface EconomicCalendar {
  date: string; // YYYY-MM-DD
  events: {
    time: string; // HH:MM
    indicator: string;
    importance: 'low' | 'medium' | 'high' | 'critical';
    country: string;
    forecast?: number;
    previous?: number;
    currency: string;
    description: string;
  }[];
}

export interface EconomicSummary {
  overallHealth: 'strong' | 'moderate' | 'weak' | 'recession';
  gdpGrowth: number;
  inflationTrend: 'rising' | 'falling' | 'stable';
  employmentHealth: 'strong' | 'moderate' | 'weak';
  consumerConfidence: 'high' | 'moderate' | 'low';
  marketSentiment: 'bullish' | 'bearish' | 'neutral';
  keyRisks: string[];
  keyOpportunities: string[];
  fedPolicy: 'dovish' | 'hawkish' | 'neutral';
  lastUpdated: number;
}

export class EconomicIndicatorsService extends EventEmitter {
  private indicators: Map<string, EconomicIndicator> = new Map();
  private macroTrends: Map<string, MacroTrend> = new Map();
  private alerts: Map<string, EconomicAlert> = new Map();
  private economicCalendar: Map<string, EconomicCalendar> = new Map();
  private historicalData: Map<string, EconomicIndicator[]> = new Map();

  // Core economic indicators with realistic current values
  private readonly CORE_INDICATORS: Omit<EconomicIndicator, 'timestamp' | 'change' | 'changePercent' | 'marketImpact' | 'impactMagnitude' | 'surprise'>[] = [
    {
      id: 'fed_funds_rate',
      name: 'Federal Funds Rate',
      category: 'monetary',
      frequency: 'monthly',
      value: 5.25,
      previousValue: 5.00,
      releaseDate: Date.now() - 2 * 24 * 60 * 60 * 1000,
      nextRelease: Date.now() + 28 * 24 * 60 * 60 * 1000,
      importance: 'critical',
      description: 'The interest rate at which banks lend to each other overnight',
      source: 'Federal Reserve',
      unit: '%',
      forecast: 5.50
    },
    {
      id: 'unemployment_rate',
      name: 'Unemployment Rate',
      category: 'employment',
      frequency: 'monthly',
      value: 3.7,
      previousValue: 3.9,
      releaseDate: Date.now() - 5 * 24 * 60 * 60 * 1000,
      nextRelease: Date.now() + 25 * 24 * 60 * 60 * 1000,
      importance: 'high',
      description: 'Percentage of labor force that is unemployed',
      source: 'Bureau of Labor Statistics',
      unit: '%',
      forecast: 3.8
    },
    {
      id: 'cpi_yoy',
      name: 'Consumer Price Index (YoY)',
      category: 'inflation',
      frequency: 'monthly',
      value: 3.2,
      previousValue: 3.7,
      releaseDate: Date.now() - 10 * 24 * 60 * 60 * 1000,
      nextRelease: Date.now() + 20 * 24 * 60 * 60 * 1000,
      importance: 'critical',
      description: 'Annual inflation rate based on consumer prices',
      source: 'Bureau of Labor Statistics',
      unit: '%',
      forecast: 3.0
    },
    {
      id: 'gdp_growth',
      name: 'GDP Growth Rate (QoQ)',
      category: 'growth',
      frequency: 'quarterly',
      value: 2.1,
      previousValue: 1.8,
      releaseDate: Date.now() - 15 * 24 * 60 * 60 * 1000,
      nextRelease: Date.now() + 75 * 24 * 60 * 60 * 1000,
      importance: 'critical',
      description: 'Quarterly gross domestic product growth rate',
      source: 'Bureau of Economic Analysis',
      unit: '%',
      forecast: 2.3
    },
    {
      id: 'nonfarm_payrolls',
      name: 'Non-Farm Payrolls',
      category: 'employment',
      frequency: 'monthly',
      value: 187000,
      previousValue: 209000,
      releaseDate: Date.now() - 5 * 24 * 60 * 60 * 1000,
      nextRelease: Date.now() + 25 * 24 * 60 * 60 * 1000,
      importance: 'high',
      description: 'Monthly change in number of employed persons',
      source: 'Bureau of Labor Statistics',
      unit: 'thousands',
      forecast: 200000
    },
    {
      id: 'consumer_confidence',
      name: 'Consumer Confidence Index',
      category: 'consumer',
      frequency: 'monthly',
      value: 102.5,
      previousValue: 98.2,
      releaseDate: Date.now() - 8 * 24 * 60 * 60 * 1000,
      nextRelease: Date.now() + 22 * 24 * 60 * 60 * 1000,
      importance: 'medium',
      description: 'Measure of consumer optimism about economic conditions',
      source: 'Conference Board',
      unit: 'index',
      forecast: 104.0
    },
    {
      id: 'retail_sales',
      name: 'Retail Sales (MoM)',
      category: 'consumer',
      frequency: 'monthly',
      value: 0.7,
      previousValue: 0.3,
      releaseDate: Date.now() - 12 * 24 * 60 * 60 * 1000,
      nextRelease: Date.now() + 18 * 24 * 60 * 60 * 1000,
      importance: 'high',
      description: 'Monthly change in retail sales',
      source: 'Census Bureau',
      unit: '%',
      forecast: 0.5
    },
    {
      id: 'housing_starts',
      name: 'Housing Starts',
      category: 'housing',
      frequency: 'monthly',
      value: 1.35,
      previousValue: 1.28,
      releaseDate: Date.now() - 6 * 24 * 60 * 60 * 1000,
      nextRelease: Date.now() + 24 * 24 * 60 * 60 * 1000,
      importance: 'medium',
      description: 'Number of new residential construction projects',
      source: 'Census Bureau',
      unit: 'millions',
      forecast: 1.32
    },
    {
      id: 'pmi_manufacturing',
      name: 'ISM Manufacturing PMI',
      category: 'growth',
      frequency: 'monthly',
      value: 49.2,
      previousValue: 50.1,
      releaseDate: Date.now() - 3 * 24 * 60 * 60 * 1000,
      nextRelease: Date.now() + 27 * 24 * 60 * 60 * 1000,
      importance: 'high',
      description: 'Purchasing Managers Index for manufacturing sector',
      source: 'Institute for Supply Management',
      unit: 'index',
      forecast: 49.8
    },
    {
      id: 'initial_claims',
      name: 'Initial Jobless Claims',
      category: 'employment',
      frequency: 'weekly',
      value: 230000,
      previousValue: 245000,
      releaseDate: Date.now() - 2 * 24 * 60 * 60 * 1000,
      nextRelease: Date.now() + 5 * 24 * 60 * 60 * 1000,
      importance: 'medium',
      description: 'Number of new unemployment insurance claims',
      source: 'Department of Labor',
      unit: 'thousands',
      forecast: 235000
    },
    {
      id: 'dxy',
      name: 'US Dollar Index',
      category: 'trade',
      frequency: 'daily',
      value: 103.25,
      previousValue: 102.80,
      releaseDate: Date.now() - 1 * 24 * 60 * 60 * 1000,
      nextRelease: Date.now() + 1 * 24 * 60 * 60 * 1000,
      importance: 'high',
      description: 'Measure of US dollar strength against basket of currencies',
      source: 'ICE',
      unit: 'index',
      forecast: 103.50
    },
    {
      id: 'yield_10y',
      name: '10-Year Treasury Yield',
      category: 'monetary',
      frequency: 'daily',
      value: 4.35,
      previousValue: 4.28,
      releaseDate: Date.now() - 1 * 24 * 60 * 60 * 1000,
      nextRelease: Date.now() + 1 * 24 * 60 * 60 * 1000,
      importance: 'critical',
      description: 'Yield on 10-year US Treasury bond',
      source: 'US Treasury',
      unit: '%',
      forecast: 4.40
    }
  ];

  constructor() {
    super();
    this.initializeIndicators();
    this.generateMacroTrends();
    this.generateEconomicCalendar();
    this.generateAlerts();
    logger.info(`Economic Indicators Service initialized with ${this.indicators.size} indicators`);
  }

  /**
   * Initialize economic indicators with calculated fields
   */
  private initializeIndicators(): void {
    this.CORE_INDICATORS.forEach(indicator => {
      const change = indicator.value - indicator.previousValue;
      const changePercent = (change / indicator.previousValue) * 100;
      
      // Calculate market impact
      let marketImpact: 'positive' | 'negative' | 'neutral';
      let impactMagnitude: number;
      
      // Determine if change is positive or negative for markets
      if (indicator.category === 'inflation' && indicator.id !== 'cpi_yoy') {
        marketImpact = change > 0 ? 'negative' : 'positive'; // High inflation generally negative
      } else if (indicator.category === 'employment' && indicator.id === 'unemployment_rate') {
        marketImpact = change > 0 ? 'negative' : 'positive'; // Lower unemployment positive
      } else if (indicator.category === 'employment' && indicator.id === 'initial_claims') {
        marketImpact = change > 0 ? 'negative' : 'positive'; // Lower claims positive
      } else {
        marketImpact = change > 0 ? 'positive' : change < 0 ? 'negative' : 'neutral';
      }
      
      // Calculate impact magnitude based on change size and importance
      const importanceMultiplier = {
        'low': 0.2,
        'medium': 0.5,
        'high': 0.8,
        'critical': 1.0
      };
      
      impactMagnitude = Math.min(1.0, Math.abs(changePercent) / 10 * importanceMultiplier[indicator.importance]);
      
      // Calculate surprise if forecast exists
      let surprise: number | undefined;
      if (indicator.forecast) {
        surprise = ((indicator.value - indicator.forecast) / indicator.forecast) * 100;
      }

      const fullIndicator: EconomicIndicator = {
        ...indicator,
        change,
        changePercent,
        marketImpact,
        impactMagnitude,
        surprise,
        timestamp: Date.now()
      };

      this.indicators.set(indicator.id, fullIndicator);
      
      // Initialize historical data
      this.historicalData.set(indicator.id, [fullIndicator]);
    });
  }

  /**
   * Generate macro trend analysis
   */
  private generateMacroTrends(): void {
    const categories = ['monetary', 'employment', 'inflation', 'growth', 'consumer', 'housing'];
    
    categories.forEach(category => {
      const categoryIndicators = Array.from(this.indicators.values())
        .filter(ind => ind.category === category);
      
      if (categoryIndicators.length === 0) return;
      
      // Calculate overall direction for category
      const positiveIndicators = categoryIndicators.filter(ind => ind.marketImpact === 'positive').length;
      const negativeIndicators = categoryIndicators.filter(ind => ind.marketImpact === 'negative').length;
      
      let direction: 'bullish' | 'bearish' | 'neutral';
      let strength: number;
      
      if (positiveIndicators > negativeIndicators * 1.5) {
        direction = 'bullish';
        strength = Math.min(1.0, positiveIndicators / categoryIndicators.length * 1.5);
      } else if (negativeIndicators > positiveIndicators * 1.5) {
        direction = 'bearish';
        strength = Math.min(1.0, negativeIndicators / categoryIndicators.length * 1.5);
      } else {
        direction = 'neutral';
        strength = 0.3 + Math.random() * 0.4;
      }
      
      // Calculate confidence based on data recency and importance
      const avgImportance = categoryIndicators.reduce((sum, ind) => {
        const importanceScore = { 'low': 1, 'medium': 2, 'high': 3, 'critical': 4 };
        return sum + importanceScore[ind.importance];
      }, 0) / categoryIndicators.length;
      
      const confidence = Math.min(1.0, avgImportance / 4 * 0.8 + categoryIndicators.length / 10 * 0.2);
      
      // Generate reasoning
      const reasoning = this.generateTrendReasoning(category, categoryIndicators, direction);
      
      const trend: MacroTrend = {
        category,
        direction,
        strength,
        confidence,
        timeframe: '3m',
        keyIndicators: categoryIndicators.slice(0, 3).map(ind => ind.name),
        reasoning,
        lastUpdated: Date.now()
      };
      
      this.macroTrends.set(category, trend);
    });
  }

  /**
   * Generate reasoning for macro trends
   */
  private generateTrendReasoning(category: string, indicators: EconomicIndicator[], direction: string): string {
    const strongestIndicator = indicators.reduce((strongest, current) => 
      Math.abs(current.changePercent) > Math.abs(strongest.changePercent) ? current : strongest
    );
    
    const reasoningTemplates = {
      'bullish': {
        'monetary': `Favorable monetary conditions with ${strongestIndicator.name} at ${strongestIndicator.value}${strongestIndicator.unit}`,
        'employment': `Strong employment indicators led by ${strongestIndicator.name} improvement`,
        'inflation': `Inflation trends moderating with ${strongestIndicator.name} showing positive movement`,
        'growth': `Economic growth momentum with ${strongestIndicator.name} at ${strongestIndicator.value}${strongestIndicator.unit}`,
        'consumer': `Consumer strength evident in ${strongestIndicator.name} reaching ${strongestIndicator.value}`,
        'housing': `Housing market resilience with ${strongestIndicator.name} growth`
      },
      'bearish': {
        'monetary': `Tightening monetary conditions as ${strongestIndicator.name} reaches ${strongestIndicator.value}${strongestIndicator.unit}`,
        'employment': `Employment concerns with ${strongestIndicator.name} deteriorating`,
        'inflation': `Inflationary pressures from ${strongestIndicator.name} at elevated levels`,
        'growth': `Growth headwinds with ${strongestIndicator.name} showing weakness`,
        'consumer': `Consumer stress indicated by ${strongestIndicator.name} decline`,
        'housing': `Housing market pressures with ${strongestIndicator.name} softening`
      },
      'neutral': {
        'default': `Mixed signals in ${category} indicators with ${strongestIndicator.name} showing modest change`
      }
    };
    
    return reasoningTemplates[direction as keyof typeof reasoningTemplates]?.[category] || 
           reasoningTemplates['neutral']['default'];
  }

  /**
   * Generate economic calendar
   */
  private generateEconomicCalendar(): void {
    // Generate calendar for next 30 days
    for (let days = 0; days < 30; days++) {
      const date = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
      const dateStr = date.toISOString().split('T')[0];
      
      // Determine if this date has releases
      const hasReleases = Math.random() < 0.3; // 30% chance of releases
      if (!hasReleases && days > 7) continue; // Always show next 7 days
      
      const events = this.generateCalendarEvents(date);
      
      if (events.length > 0) {
        this.economicCalendar.set(dateStr, { date: dateStr, events });
      }
    }
  }

  /**
   * Generate calendar events for a date
   */
  private generateCalendarEvents(date: Date): EconomicCalendar['events'] {
    const events: EconomicCalendar['events'] = [];
    const dayOfWeek = date.getDay();
    
    // Weekly events (typically Thursdays)
    if (dayOfWeek === 4) { // Thursday
      events.push({
        time: '08:30',
        indicator: 'Initial Jobless Claims',
        importance: 'medium',
        country: 'US',
        previous: 245000,
        forecast: 235000,
        currency: 'USD',
        description: 'Weekly unemployment insurance claims'
      });
    }
    
    // Monthly events (various days)
    const dayOfMonth = date.getDate();
    if (dayOfMonth === 1) {
      events.push({
        time: '10:00',
        indicator: 'ISM Manufacturing PMI',
        importance: 'high',
        country: 'US',
        previous: 50.1,
        forecast: 49.8,
        currency: 'USD',
        description: 'Manufacturing sector health index'
      });
    }
    
    if (dayOfMonth === 8) {
      events.push({
        time: '08:30',
        indicator: 'Non-Farm Payrolls',
        importance: 'high',
        country: 'US',
        previous: 209000,
        forecast: 200000,
        currency: 'USD',
        description: 'Monthly employment change'
      });
    }
    
    if (dayOfMonth === 15) {
      events.push({
        time: '08:30',
        indicator: 'Consumer Price Index',
        importance: 'critical',
        country: 'US',
        previous: 3.7,
        forecast: 3.0,
        currency: 'USD',
        description: 'Monthly inflation measure'
      });
    }
    
    // Random additional events
    if (Math.random() < 0.2) {
      events.push({
        time: '14:00',
        indicator: 'FOMC Meeting Minutes',
        importance: 'critical',
        country: 'US',
        currency: 'USD',
        description: 'Federal Reserve meeting minutes release'
      });
    }
    
    return events;
  }

  /**
   * Generate economic alerts
   */
  private generateAlerts(): void {
    const alerts: Omit<EconomicAlert, 'timestamp'>[] = [
      {
        id: 'cpi_surprise',
        type: 'surprise',
        severity: 'high',
        title: 'CPI Surprise',
        message: 'Consumer Price Index came in higher than expected at 3.2% vs forecast 3.0%',
        indicatorId: 'cpi_yoy',
        acknowledged: false,
        marketImplication: 'May prompt more aggressive Fed policy',
        actionRequired: true
      },
      {
        id: 'fed_decision_pending',
        type: 'indicator_release',
        severity: 'critical',
        title: 'Fed Decision Tomorrow',
        message: 'Federal Reserve interest rate decision scheduled for tomorrow',
        indicatorId: 'fed_funds_rate',
        acknowledged: false,
        marketImplication: 'Expected 25bp rate hike could impact equity markets',
        actionRequired: false
      },
      {
        id: 'unemployment_trend',
        type: 'trend_change',
        severity: 'medium',
        title: 'Unemployment Trending Lower',
        message: 'Unemployment rate has declined for 3 consecutive months',
        indicatorId: 'unemployment_rate',
        acknowledged: false,
        marketImplication: 'Strong labor market supports consumer spending',
        actionRequired: false
      }
    ];
    
    alerts.forEach(alert => {
      this.alerts.set(alert.id, { ...alert, timestamp: Date.now() });
    });
  }

  /**
   * Get all economic indicators
   */
  getAllIndicators(): EconomicIndicator[] {
    return Array.from(this.indicators.values())
      .sort((a, b) => {
        const importanceOrder = { 'critical': 4, 'high': 3, 'medium': 2, 'low': 1 };
        return importanceOrder[b.importance] - importanceOrder[a.importance];
      });
  }

  /**
   * Get indicators by category
   */
  getIndicatorsByCategory(category: string): EconomicIndicator[] {
    return Array.from(this.indicators.values())
      .filter(indicator => indicator.category === category)
      .sort((a, b) => b.impactMagnitude - a.impactMagnitude);
  }

  /**
   * Get specific indicator
   */
  getIndicator(id: string): EconomicIndicator | null {
    return this.indicators.get(id) || null;
  }

  /**
   * Get macro trends
   */
  getMacroTrends(): MacroTrend[] {
    return Array.from(this.macroTrends.values())
      .sort((a, b) => b.strength - a.strength);
  }

  /**
   * Get economic alerts
   */
  getAlerts(acknowledged?: boolean): EconomicAlert[] {
    const allAlerts = Array.from(this.alerts.values());
    return acknowledged !== undefined ? 
      allAlerts.filter(alert => alert.acknowledged === acknowledged) : 
      allAlerts;
  }

  /**
   * Get economic calendar
   */
  getEconomicCalendar(days: number = 7): EconomicCalendar[] {
    const calendars: EconomicCalendar[] = [];
    
    for (let i = 0; i < days; i++) {
      const date = new Date(Date.now() + i * 24 * 60 * 60 * 1000);
      const dateStr = date.toISOString().split('T')[0];
      const calendar = this.economicCalendar.get(dateStr);
      
      if (calendar) {
        calendars.push(calendar);
      }
    }
    
    return calendars;
  }

  /**
   * Generate economic summary
   */
  generateEconomicSummary(): EconomicSummary {
    const gdpIndicator = this.indicators.get('gdp_growth');
    const inflationIndicator = this.indicators.get('cpi_yoy');
    const unemploymentIndicator = this.indicators.get('unemployment_rate');
    const confidenceIndicator = this.indicators.get('consumer_confidence');
    
    // Determine overall health
    let overallHealth: 'strong' | 'moderate' | 'weak' | 'recession';
    const gdpGrowth = gdpIndicator?.value || 2.0;
    const unemploymentRate = unemploymentIndicator?.value || 4.0;
    
    if (gdpGrowth > 2.5 && unemploymentRate < 4.0) {
      overallHealth = 'strong';
    } else if (gdpGrowth < 0) {
      overallHealth = 'recession';
    } else if (gdpGrowth < 1.0 || unemploymentRate > 6.0) {
      overallHealth = 'weak';
    } else {
      overallHealth = 'moderate';
    }
    
    // Determine inflation trend
    let inflationTrend: 'rising' | 'falling' | 'stable';
    const inflationChange = inflationIndicator?.changePercent || 0;
    if (Math.abs(inflationChange) < 5) {
      inflationTrend = 'stable';
    } else {
      inflationTrend = inflationChange > 0 ? 'rising' : 'falling';
    }
    
    // Determine employment health
    let employmentHealth: 'strong' | 'moderate' | 'weak';
    if (unemploymentRate < 4.0) employmentHealth = 'strong';
    else if (unemploymentRate < 6.0) employmentHealth = 'moderate';
    else employmentHealth = 'weak';
    
    // Determine consumer confidence
    let consumerConfidence: 'high' | 'moderate' | 'low';
    const confidenceValue = confidenceIndicator?.value || 100;
    if (confidenceValue > 110) consumerConfidence = 'high';
    else if (confidenceValue > 90) consumerConfidence = 'moderate';
    else consumerConfidence = 'low';
    
    // Market sentiment based on trends
    const bullishTrends = Array.from(this.macroTrends.values()).filter(t => t.direction === 'bullish').length;
    const bearishTrends = Array.from(this.macroTrends.values()).filter(t => t.direction === 'bearish').length;
    
    let marketSentiment: 'bullish' | 'bearish' | 'neutral';
    if (bullishTrends > bearishTrends * 1.2) marketSentiment = 'bullish';
    else if (bearishTrends > bullishTrends * 1.2) marketSentiment = 'bearish';
    else marketSentiment = 'neutral';
    
    // Key risks and opportunities
    const keyRisks = [
      'Federal Reserve policy tightening',
      'Inflation persistence above target',
      'Geopolitical tensions',
      'Supply chain disruptions'
    ];
    
    const keyOpportunities = [
      'Strong labor market resilience',
      'Consumer spending stability',
      'Technological innovation growth',
      'Infrastructure investment expansion'
    ];
    
    // Fed policy stance
    const fedRate = this.indicators.get('fed_funds_rate')?.value || 5.0;
    const fedPolicy = fedRate > 5.0 ? 'hawkish' : fedRate < 3.0 ? 'dovish' : 'neutral';
    
    return {
      overallHealth,
      gdpGrowth,
      inflationTrend,
      employmentHealth,
      consumerConfidence,
      marketSentiment,
      keyRisks,
      keyOpportunities,
      fedPolicy,
      lastUpdated: Date.now()
    };
  }

  /**
   * Acknowledge alert
   */
  acknowledgeAlert(alertId: string): boolean {
    const alert = this.alerts.get(alertId);
    if (alert) {
      alert.acknowledged = true;
      return true;
    }
    return false;
  }

  /**
   * Start real-time economic data updates
   */
  startRealTimeUpdates(intervalMs: number = 300000): void { // 5 minutes default
    logger.info('Starting real-time economic indicators updates');
    
    const updateEconomicData = () => {
      try {
        // Update indicator values with small random changes
        this.indicators.forEach((indicator, id) => {
          // Update less frequently based on frequency
          const updateProbability = {
            'daily': 0.8,
            'weekly': 0.1,
            'monthly': 0.05,
            'quarterly': 0.01,
            'annual': 0.005
          };
          
          if (Math.random() < updateProbability[indicator.frequency]) {
            const oldValue = indicator.value;
            const maxChange = indicator.importance === 'critical' ? 0.02 : 0.05;
            const change = (Math.random() - 0.5) * maxChange * oldValue;
            
            indicator.previousValue = oldValue;
            indicator.value = Math.max(0, oldValue + change);
            indicator.change = indicator.value - indicator.previousValue;
            indicator.changePercent = (indicator.change / indicator.previousValue) * 100;
            indicator.timestamp = Date.now();
            
            // Update historical data
            const history = this.historicalData.get(id) || [];
            history.unshift(indicator);
            if (history.length > 100) history.splice(100); // Keep last 100 points
            this.historicalData.set(id, history);
          }
        });
        
        // Regenerate trends occasionally
        if (Math.random() < 0.1) {
          this.generateMacroTrends();
        }
        
        // Generate new alerts occasionally
        if (Math.random() < 0.05) {
          this.generateNewAlert();
        }
        
        // Emit update event
        this.emit('indicators-updated', {
          timestamp: Date.now(),
          indicatorsCount: this.indicators.size,
          trendsCount: this.macroTrends.size,
          alertsCount: this.alerts.size
        });
        
        logger.info('Economic indicators updated');
        
      } catch (error) {
        logger.error('Error updating economic indicators:', error);
      }
    };
    
    // Initial update
    updateEconomicData();
    
    // Set up interval
    setInterval(updateEconomicData, intervalMs);
  }

  /**
   * Generate new alert
   */
  private generateNewAlert(): void {
    const alertTypes = ['threshold_breach', 'trend_change', 'surprise'];
    const type = alertTypes[Math.floor(Math.random() * alertTypes.length)];
    const indicators = Array.from(this.indicators.values());
    const indicator = indicators[Math.floor(Math.random() * indicators.length)];
    
    const alertId = `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const alert: EconomicAlert = {
      id: alertId,
      type: type as any,
      severity: 'medium',
      title: `${indicator.name} Alert`,
      message: `${indicator.name} has shown significant movement`,
      indicatorId: indicator.id,
      timestamp: Date.now(),
      acknowledged: false,
      marketImplication: 'Monitor for potential market impact',
      actionRequired: false
    };
    
    this.alerts.set(alertId, alert);
  }
}