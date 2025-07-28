import { EventEmitter } from 'events';
import { logger } from '../utils/logger';

export interface EarningsCall {
  id: string;
  symbol: string;
  companyName: string;
  quarter: string; // e.g., 'Q3 2024'
  fiscalYear: number;
  callDate: number;
  callTime: string; // e.g., '4:30 PM ET'
  callDuration: number; // minutes
  participantCount: number;
  analystCount: number;
  status: 'scheduled' | 'live' | 'completed' | 'cancelled';
  webcastUrl?: string;
  transcript?: string;
  keyMetrics: {
    revenue: number;
    revenueGrowth: number;
    eps: number;
    epsGrowth: number;
    margin: number;
    guidance?: {
      q4Revenue?: { low: number; high: number };
      q4Eps?: { low: number; high: number };
      fyRevenue?: { low: number; high: number };
      fyEps?: { low: number; high: number };
    };
  };
}

export interface SentimentAnalysis {
  callId: string;
  symbol: string;
  overallSentiment: 'very_positive' | 'positive' | 'neutral' | 'negative' | 'very_negative';
  sentimentScore: number; // -1 to 1
  confidence: number; // 0 to 1
  managementTone: {
    confidence: number; // 0-1
    optimism: number; // 0-1
    uncertainty: number; // 0-1
    defensiveness: number; // 0-1
  };
  analystSentiment: {
    bullish: number; // percentage
    neutral: number; // percentage
    bearish: number; // percentage
    questionCount: number;
    followUpQuestions: number;
  };
  keyThemes: {
    theme: string;
    sentiment: number; // -1 to 1
    mentions: number;
    importance: number; // 0-1
  }[];
  riskFactors: string[];
  opportunities: string[];
  guidance: {
    tone: 'raised' | 'maintained' | 'lowered' | 'unclear';
    confidence: number; // 0-1
    specificity: number; // 0-1 how specific the guidance is
  };
  linguisticMetrics: {
    wordsPerMinute: number;
    pauseFrequency: number; // pauses per minute
    hedgeWords: number; // uncertainty indicators
    certaintyWords: number; // confidence indicators
    futureOriented: number; // forward-looking statements
  };
  marketReaction: {
    premarketMove?: number; // % change before market open
    afterhoursMove?: number; // % change after hours
    nextDayMove?: number; // % change next trading day
    volumeSpike: number; // volume vs average
  };
  analysisTimestamp: number;
}

export interface EarningsAlert {
  id: string;
  type: 'call_scheduled' | 'sentiment_change' | 'guidance_update' | 'unusual_tone';
  severity: 'low' | 'medium' | 'high' | 'critical';
  symbol: string;
  title: string;
  message: string;
  timestamp: number;
  callId?: string;
  actionRequired: boolean;
  marketImplication: string;
  acknowledged: boolean;
}

export interface EarningsCalendar {
  date: string; // YYYY-MM-DD
  calls: {
    symbol: string;
    companyName: string;
    time: string;
    quarter: string;
    consensus: {
      epsEstimate: number;
      revenueEstimate: number;
    };
    importance: 'low' | 'medium' | 'high' | 'market_moving';
    lastReported?: {
      eps: number;
      revenue: number;
      surpriseHistory: number[]; // last 4 quarters
    };
  }[];
}

export interface ExecutiveMoodProfile {
  symbol: string;
  executive: string;
  role: string; // CEO, CFO, COO, etc.
  historicalTone: {
    averageConfidence: number;
    averageOptimism: number;
    consistency: number; // how consistent their tone is
    accuracyScore: number; // how often their optimism translates to results
  };
  recentCalls: {
    date: number;
    confidence: number;
    optimism: number;
    keyMessages: string[];
  }[];
  communicationStyle: {
    verbosity: number; // words per minute
    directness: number; // how direct their answers are
    transparency: number; // how open they are about challenges
    technicality: number; // how technical their language is
  };
  credibilityScore: number; // 0-1 based on historical accuracy
  lastUpdated: number;
}

export class EarningsSentimentService extends EventEmitter {
  private earningsCalls: Map<string, EarningsCall> = new Map();
  private sentimentAnalyses: Map<string, SentimentAnalysis> = new Map();
  private alerts: Map<string, EarningsAlert> = new Map();
  private earningsCalendar: Map<string, EarningsCalendar> = new Map();
  private executiveProfiles: Map<string, ExecutiveMoodProfile> = new Map();

  // Mock earnings calls for major companies
  private readonly UPCOMING_CALLS: Omit<EarningsCall, 'id' | 'callDate' | 'status' | 'transcript' | 'keyMetrics'>[] = [
    {
      symbol: 'AAPL',
      companyName: 'Apple Inc.',
      quarter: 'Q1 2024',
      fiscalYear: 2024,
      callTime: '5:00 PM ET',
      callDuration: 60,
      participantCount: 12,
      analystCount: 25,
      webcastUrl: 'https://investor.apple.com/webcast'
    },
    {
      symbol: 'GOOGL',
      companyName: 'Alphabet Inc.',
      quarter: 'Q4 2023',
      fiscalYear: 2023,
      callTime: '4:30 PM ET',
      callDuration: 75,
      participantCount: 15,
      analystCount: 30,
      webcastUrl: 'https://abc.xyz/investor/webcast'
    },
    {
      symbol: 'MSFT',
      companyName: 'Microsoft Corporation',
      quarter: 'Q2 2024',
      fiscalYear: 2024,
      callTime: '5:30 PM ET',
      callDuration: 55,
      participantCount: 10,
      analystCount: 22,
      webcastUrl: 'https://microsoft.com/investor/webcast'
    },
    {
      symbol: 'AMZN',
      companyName: 'Amazon.com Inc.',
      quarter: 'Q4 2023',
      fiscalYear: 2023,
      callTime: '5:00 PM ET',
      callDuration: 45,
      participantCount: 8,
      analystCount: 28,
      webcastUrl: 'https://amazon.com/ir/webcast'
    },
    {
      symbol: 'TSLA',
      companyName: 'Tesla Inc.',
      quarter: 'Q4 2023',
      fiscalYear: 2023,
      callTime: '6:30 PM ET',
      callDuration: 90,
      participantCount: 6,
      analystCount: 20,
      webcastUrl: 'https://ir.tesla.com/webcast'
    },
    {
      symbol: 'META',
      companyName: 'Meta Platforms Inc.',
      quarter: 'Q4 2023',
      fiscalYear: 2023,
      callTime: '5:00 PM ET',
      callDuration: 60,
      participantCount: 9,
      analystCount: 24,
      webcastUrl: 'https://investor.fb.com/webcast'
    },
    {
      symbol: 'NVDA',
      companyName: 'NVIDIA Corporation',
      quarter: 'Q4 2024',
      fiscalYear: 2024,
      callTime: '5:00 PM ET',
      callDuration: 65,
      participantCount: 7,
      analystCount: 26,
      webcastUrl: 'https://investor.nvidia.com/webcast'
    }
  ];

  constructor() {
    super();
    this.initializeEarningsCalls();
    this.generateSentimentAnalyses();
    this.generateExecutiveProfiles();
    this.generateEarningsCalendar();
    this.generateAlerts();
    logger.info(`Earnings Sentiment Service initialized with ${this.earningsCalls.size} earnings calls`);
  }

  /**
   * Initialize earnings calls with mock data
   */
  private initializeEarningsCalls(): void {
    const now = Date.now();
    
    this.UPCOMING_CALLS.forEach((call, index) => {
      // Generate calls for past 30 days and next 60 days
      const daysOffset = (index - 4) * 7; // Spread calls across different weeks
      const callDate = now + (daysOffset * 24 * 60 * 60 * 1000);
      
      const status: EarningsCall['status'] = 
        callDate < now - 24 * 60 * 60 * 1000 ? 'completed' :
        callDate < now ? 'live' :
        Math.abs(callDate - now) < 24 * 60 * 60 * 1000 ? 'scheduled' : 'scheduled';
      
      // Generate realistic earnings metrics
      const revenue = (Math.random() * 50 + 20) * 1000000000; // $20B-$70B
      const eps = Math.random() * 5 + 1; // $1-$6 EPS
      
      const earningsCall: EarningsCall = {
        ...call,
        id: `${call.symbol}_${call.quarter.replace(' ', '_').toLowerCase()}`,
        callDate,
        status,
        transcript: status === 'completed' ? this.generateMockTranscript(call.symbol) : undefined,
        keyMetrics: {
          revenue,
          revenueGrowth: (Math.random() - 0.3) * 30, // -30% to 20% growth
          eps,
          epsGrowth: (Math.random() - 0.2) * 40, // -20% to 20% growth
          margin: 15 + Math.random() * 20, // 15-35% margin
          guidance: {
            q4Revenue: { low: revenue * 0.95, high: revenue * 1.1 },
            q4Eps: { low: eps * 0.9, high: eps * 1.15 },
            fyRevenue: { low: revenue * 3.8, high: revenue * 4.2 },
            fyEps: { low: eps * 3.5, high: eps * 4.1 }
          }
        }
      };
      
      this.earningsCalls.set(earningsCall.id, earningsCall);
    });
  }

  /**
   * Generate mock transcript for completed calls
   */
  private generateMockTranscript(symbol: string): string {
    const openingRemarks = [
      "Thank you for joining us today. We're pleased to report another strong quarter.",
      "Good afternoon everyone. We delivered solid results this quarter despite challenging market conditions.",
      "Welcome to our earnings call. We continue to execute on our strategic priorities.",
      "Thank you for your time today. We're excited to share our quarterly results with you."
    ];
    
    const businessUpdates = [
      "Our core business continues to show resilience with strong user engagement and revenue growth.",
      "We're seeing positive momentum across all our key product lines and geographic markets.",
      "Innovation remains at the heart of our strategy, and we continue to invest in future growth opportunities.",
      "We're pleased with our operational efficiency improvements and margin expansion this quarter."
    ];
    
    const challenges = [
      "We did face some headwinds from foreign exchange and supply chain constraints.",
      "The macro environment remains uncertain, but we're well-positioned to navigate these challenges.",
      "We continue to monitor inflation impacts and supply chain dynamics closely.",
      "Market volatility has created some near-term pressures, but our long-term outlook remains positive."
    ];
    
    const outlook = [
      "Looking ahead, we remain optimistic about our growth prospects and competitive positioning.",
      "We're raising our full-year guidance based on strong underlying business trends.",
      "While we expect some near-term volatility, our long-term fundamentals remain strong.",
      "We're confident in our ability to deliver sustainable growth and shareholder value."
    ];
    
    return [
      openingRemarks[Math.floor(Math.random() * openingRemarks.length)],
      businessUpdates[Math.floor(Math.random() * businessUpdates.length)],
      challenges[Math.floor(Math.random() * challenges.length)],
      outlook[Math.floor(Math.random() * outlook.length)]
    ].join(' ');
  }

  /**
   * Generate sentiment analyses for completed calls
   */
  private generateSentimentAnalyses(): void {
    const completedCalls = Array.from(this.earningsCalls.values())
      .filter(call => call.status === 'completed');
    
    completedCalls.forEach(call => {
      // Generate sentiment based on earnings performance
      const revenueGrowth = call.keyMetrics.revenueGrowth;
      const epsGrowth = call.keyMetrics.epsGrowth;
      
      // Base sentiment on financial performance
      let baseSentiment = 0;
      if (revenueGrowth > 10 && epsGrowth > 15) baseSentiment = 0.7;
      else if (revenueGrowth > 5 && epsGrowth > 5) baseSentiment = 0.3;
      else if (revenueGrowth > 0 && epsGrowth > 0) baseSentiment = 0.1;
      else if (revenueGrowth > -5 && epsGrowth > -10) baseSentiment = -0.2;
      else baseSentiment = -0.6;
      
      // Add some randomness for management tone
      const sentimentScore = Math.max(-1, Math.min(1, baseSentiment + (Math.random() - 0.5) * 0.4));
      
      let overallSentiment: SentimentAnalysis['overallSentiment'];
      if (sentimentScore > 0.6) overallSentiment = 'very_positive';
      else if (sentimentScore > 0.2) overallSentiment = 'positive';
      else if (sentimentScore > -0.2) overallSentiment = 'neutral';
      else if (sentimentScore > -0.6) overallSentiment = 'negative';
      else overallSentiment = 'very_negative';
      
      const analysis: SentimentAnalysis = {
        callId: call.id,
        symbol: call.symbol,
        overallSentiment,
        sentimentScore,
        confidence: 0.7 + Math.random() * 0.25,
        managementTone: {
          confidence: Math.max(0, sentimentScore + 0.5 + Math.random() * 0.3),
          optimism: Math.max(0, sentimentScore + 0.4 + Math.random() * 0.4),
          uncertainty: Math.max(0, -sentimentScore + 0.3 + Math.random() * 0.3),
          defensiveness: Math.max(0, -sentimentScore * 0.5 + Math.random() * 0.3)
        },
        analystSentiment: {
          bullish: sentimentScore > 0 ? 60 + Math.random() * 30 : 20 + Math.random() * 30,
          neutral: 20 + Math.random() * 20,
          bearish: sentimentScore < 0 ? 50 + Math.random() * 30 : 10 + Math.random() * 20,
          questionCount: 15 + Math.floor(Math.random() * 10),
          followUpQuestions: 3 + Math.floor(Math.random() * 5)
        },
        keyThemes: this.generateKeyThemes(call.symbol, sentimentScore),
        riskFactors: this.generateRiskFactors(call.symbol),
        opportunities: this.generateOpportunities(call.symbol),
        guidance: {
          tone: this.determineGuidanceTone(call.keyMetrics.revenueGrowth, call.keyMetrics.epsGrowth),
          confidence: 0.6 + Math.random() * 0.3,
          specificity: 0.5 + Math.random() * 0.4
        },
        linguisticMetrics: {
          wordsPerMinute: 150 + Math.random() * 50,
          pauseFrequency: 2 + Math.random() * 3,
          hedgeWords: Math.max(0, -sentimentScore * 10 + Math.random() * 5),
          certaintyWords: Math.max(0, sentimentScore * 8 + Math.random() * 4),
          futureOriented: 15 + Math.random() * 10
        },
        marketReaction: {
          afterhoursMove: sentimentScore * 5 + (Math.random() - 0.5) * 8,
          nextDayMove: sentimentScore * 3 + (Math.random() - 0.5) * 6,
          volumeSpike: 1.5 + Math.random() * 2
        },
        analysisTimestamp: Date.now()
      };
      
      // Normalize analyst sentiment to 100%
      const total = analysis.analystSentiment.bullish + analysis.analystSentiment.neutral + analysis.analystSentiment.bearish;
      analysis.analystSentiment.bullish = (analysis.analystSentiment.bullish / total) * 100;
      analysis.analystSentiment.neutral = (analysis.analystSentiment.neutral / total) * 100;
      analysis.analystSentiment.bearish = (analysis.analystSentiment.bearish / total) * 100;
      
      this.sentimentAnalyses.set(call.id, analysis);
    });
  }

  /**
   * Generate key themes for earnings call
   */
  private generateKeyThemes(symbol: string, sentiment: number): SentimentAnalysis['keyThemes'] {
    const allThemes = [
      'Revenue Growth', 'Margin Expansion', 'Market Share', 'Innovation', 'Customer Acquisition',
      'Operating Efficiency', 'Supply Chain', 'Competitive Position', 'Digital Transformation',
      'International Expansion', 'Product Development', 'Cost Management', 'Regulatory Environment',
      'Market Conditions', 'Strategic Partnerships', 'Talent Acquisition', 'Sustainability',
      'AI and Technology', 'Cloud Services', 'Data Analytics'
    ];
    
    // Select 5-8 random themes
    const selectedThemes = allThemes
      .sort(() => Math.random() - 0.5)
      .slice(0, 5 + Math.floor(Math.random() * 4));
    
    return selectedThemes.map(theme => ({
      theme,
      sentiment: sentiment + (Math.random() - 0.5) * 0.6, // Theme sentiment around overall sentiment
      mentions: 3 + Math.floor(Math.random() * 8),
      importance: Math.random()
    })).sort((a, b) => b.importance - a.importance);
  }

  /**
   * Generate risk factors
   */
  private generateRiskFactors(symbol: string): string[] {
    const riskFactors = [
      'Macroeconomic uncertainty and inflation pressures',
      'Increased competition in core markets',
      'Supply chain disruptions and cost inflation',
      'Regulatory changes and compliance requirements',
      'Currency exchange rate fluctuations',
      'Cybersecurity and data privacy risks',
      'Talent acquisition and retention challenges',
      'Technology disruption and innovation risks',
      'Environmental and sustainability pressures',
      'Geopolitical tensions and trade restrictions'
    ];
    
    return riskFactors
      .sort(() => Math.random() - 0.5)
      .slice(0, 3 + Math.floor(Math.random() * 3));
  }

  /**
   * Generate opportunities
   */
  private generateOpportunities(symbol: string): string[] {
    const opportunities = [
      'Artificial intelligence and automation adoption',
      'Expansion into emerging markets',
      'Strategic acquisitions and partnerships',
      'Digital transformation acceleration',
      'Sustainability and ESG initiatives',
      'New product development and innovation',
      'Market share gains from competitors',
      'Operational efficiency improvements',
      'Customer experience enhancement',
      'Cloud services and SaaS growth'
    ];
    
    return opportunities
      .sort(() => Math.random() - 0.5)
      .slice(0, 2 + Math.floor(Math.random() * 3));
  }

  /**
   * Determine guidance tone
   */
  private determineGuidanceTone(revenueGrowth: number, epsGrowth: number): SentimentAnalysis['guidance']['tone'] {
    const avgGrowth = (revenueGrowth + epsGrowth) / 2;
    
    if (avgGrowth > 10) return 'raised';
    else if (avgGrowth > 0) return 'maintained';
    else if (avgGrowth > -10) return 'lowered';
    else return 'unclear';
  }

  /**
   * Generate executive mood profiles
   */
  private generateExecutiveProfiles(): void {
    const executives = [
      { symbol: 'AAPL', name: 'Tim Cook', role: 'CEO' },
      { symbol: 'AAPL', name: 'Luca Maestri', role: 'CFO' },
      { symbol: 'GOOGL', name: 'Sundar Pichai', role: 'CEO' },
      { symbol: 'GOOGL', name: 'Ruth Porat', role: 'CFO' },
      { symbol: 'MSFT', name: 'Satya Nadella', role: 'CEO' },
      { symbol: 'MSFT', name: 'Amy Hood', role: 'CFO' },
      { symbol: 'AMZN', name: 'Andy Jassy', role: 'CEO' },
      { symbol: 'AMZN', name: 'Brian Olsavsky', role: 'CFO' },
      { symbol: 'TSLA', name: 'Elon Musk', role: 'CEO' },
      { symbol: 'TSLA', name: 'Zachary Kirkhorn', role: 'CFO' },
      { symbol: 'META', name: 'Mark Zuckerberg', role: 'CEO' },
      { symbol: 'META', name: 'Susan Li', role: 'CFO' }
    ];
    
    executives.forEach(exec => {
      const profileId = `${exec.symbol}_${exec.name.replace(' ', '_').toLowerCase()}`;
      
      // Generate historical calls
      const recentCalls = [];
      for (let i = 0; i < 4; i++) {
        recentCalls.push({
          date: Date.now() - (i * 90 * 24 * 60 * 60 * 1000), // Quarterly calls
          confidence: 0.3 + Math.random() * 0.6,
          optimism: 0.2 + Math.random() * 0.7,
          keyMessages: [
            'Strong execution on strategic priorities',
            'Continued investment in innovation',
            'Positive market momentum',
            'Focus on operational excellence'
          ].slice(0, 2 + Math.floor(Math.random() * 3))
        });
      }
      
      const profile: ExecutiveMoodProfile = {
        symbol: exec.symbol,
        executive: exec.name,
        role: exec.role,
        historicalTone: {
          averageConfidence: recentCalls.reduce((sum, call) => sum + call.confidence, 0) / recentCalls.length,
          averageOptimism: recentCalls.reduce((sum, call) => sum + call.optimism, 0) / recentCalls.length,
          consistency: 0.6 + Math.random() * 0.3, // How consistent their tone is
          accuracyScore: 0.5 + Math.random() * 0.4 // How often their optimism translates to results
        },
        recentCalls,
        communicationStyle: {
          verbosity: exec.role === 'CEO' ? 180 + Math.random() * 40 : 150 + Math.random() * 30,
          directness: exec.role === 'CFO' ? 0.7 + Math.random() * 0.25 : 0.5 + Math.random() * 0.4,
          transparency: 0.4 + Math.random() * 0.5,
          technicality: exec.role === 'CFO' ? 0.7 + Math.random() * 0.25 : 0.4 + Math.random() * 0.4
        },
        credibilityScore: 0.6 + Math.random() * 0.35,
        lastUpdated: Date.now()
      };
      
      this.executiveProfiles.set(profileId, profile);
    });
  }

  /**
   * Generate earnings calendar
   */
  private generateEarningsCalendar(): void {
    // Generate calendar for next 30 days
    for (let days = 0; days < 30; days++) {
      const date = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
      const dateStr = date.toISOString().split('T')[0];
      
      // Check if any calls are scheduled for this date
      const callsForDate = Array.from(this.earningsCalls.values())
        .filter(call => {
          const callDate = new Date(call.callDate).toISOString().split('T')[0];
          return callDate === dateStr;
        });
      
      if (callsForDate.length > 0 || Math.random() < 0.15) { // 15% chance of additional calls
        const calls = callsForDate.map(call => ({
          symbol: call.symbol,
          companyName: call.companyName,
          time: call.callTime,
          quarter: call.quarter,
          consensus: {
            epsEstimate: call.keyMetrics.eps * (0.95 + Math.random() * 0.1),
            revenueEstimate: call.keyMetrics.revenue * (0.98 + Math.random() * 0.04)
          },
          importance: call.symbol.length === 4 ? 'high' : Math.random() > 0.5 ? 'medium' : 'low' as any,
          lastReported: {
            eps: call.keyMetrics.eps * (0.9 + Math.random() * 0.2),
            revenue: call.keyMetrics.revenue * (0.95 + Math.random() * 0.1),
            surpriseHistory: [
              (Math.random() - 0.5) * 20, // Q-1
              (Math.random() - 0.5) * 25, // Q-2
              (Math.random() - 0.5) * 15, // Q-3
              (Math.random() - 0.5) * 30  // Q-4
            ]
          }
        }));
        
        this.earningsCalendar.set(dateStr, { date: dateStr, calls });
      }
    }
  }

  /**
   * Generate earnings alerts
   */
  private generateAlerts(): void {
    const alerts: Omit<EarningsAlert, 'timestamp'>[] = [
      {
        id: 'aapl_guidance_raised',
        type: 'guidance_update',
        severity: 'high',
        symbol: 'AAPL',
        title: 'Apple Raises Q4 Guidance',
        message: 'Apple management raised Q4 revenue guidance above consensus estimates',
        callId: 'aapl_q1_2024',
        actionRequired: false,
        marketImplication: 'Positive for AAPL stock, may lift tech sector',
        acknowledged: false
      },
      {
        id: 'tsla_defensive_tone',
        type: 'unusual_tone',
        severity: 'medium',
        symbol: 'TSLA',
        title: 'Tesla Management Defensive on Production',
        message: 'Unusual defensive tone detected when discussing production targets',
        callId: 'tsla_q4_2023',
        actionRequired: true,
        marketImplication: 'May indicate production challenges ahead',
        acknowledged: false
      },
      {
        id: 'meta_sentiment_surge',
        type: 'sentiment_change',
        severity: 'high',
        symbol: 'META',
        title: 'Meta Sentiment Significantly Improved',
        message: 'Analyst sentiment shifted from neutral to very positive during call',
        callId: 'meta_q4_2023',
        actionRequired: false,
        marketImplication: 'Strong buy momentum expected',
        acknowledged: false
      }
    ];
    
    alerts.forEach(alert => {
      this.alerts.set(alert.id, { ...alert, timestamp: Date.now() });
    });
  }

  /**
   * Get all earnings calls
   */
  getAllEarningsCalls(): EarningsCall[] {
    return Array.from(this.earningsCalls.values())
      .sort((a, b) => b.callDate - a.callDate);
  }

  /**
   * Get earnings calls by status
   */
  getEarningsCallsByStatus(status: EarningsCall['status']): EarningsCall[] {
    return Array.from(this.earningsCalls.values())
      .filter(call => call.status === status)
      .sort((a, b) => a.callDate - b.callDate);
  }

  /**
   * Get earnings call by ID
   */
  getEarningsCall(callId: string): EarningsCall | null {
    return this.earningsCalls.get(callId) || null;
  }

  /**
   * Get sentiment analysis for a call
   */
  getSentimentAnalysis(callId: string): SentimentAnalysis | null {
    return this.sentimentAnalyses.get(callId) || null;
  }

  /**
   * Get all sentiment analyses
   */
  getAllSentimentAnalyses(): SentimentAnalysis[] {
    return Array.from(this.sentimentAnalyses.values())
      .sort((a, b) => b.analysisTimestamp - a.analysisTimestamp);
  }

  /**
   * Get sentiment analyses by symbol
   */
  getSentimentAnalysesBySymbol(symbol: string): SentimentAnalysis[] {
    return Array.from(this.sentimentAnalyses.values())
      .filter(analysis => analysis.symbol === symbol)
      .sort((a, b) => b.analysisTimestamp - a.analysisTimestamp);
  }

  /**
   * Get earnings alerts
   */
  getEarningsAlerts(acknowledged?: boolean): EarningsAlert[] {
    const allAlerts = Array.from(this.alerts.values());
    return acknowledged !== undefined ? 
      allAlerts.filter(alert => alert.acknowledged === acknowledged) : 
      allAlerts;
  }

  /**
   * Get earnings calendar
   */
  getEarningsCalendar(days: number = 7): EarningsCalendar[] {
    const calendars: EarningsCalendar[] = [];
    
    for (let i = 0; i < days; i++) {
      const date = new Date(Date.now() + i * 24 * 60 * 60 * 1000);
      const dateStr = date.toISOString().split('T')[0];
      const calendar = this.earningsCalendar.get(dateStr);
      
      if (calendar) {
        calendars.push(calendar);
      }
    }
    
    return calendars;
  }

  /**
   * Get executive mood profiles
   */
  getExecutiveProfiles(symbol?: string): ExecutiveMoodProfile[] {
    const allProfiles = Array.from(this.executiveProfiles.values());
    return symbol ? allProfiles.filter(profile => profile.symbol === symbol) : allProfiles;
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
   * Start real-time earnings sentiment updates
   */
  startRealTimeUpdates(intervalMs: number = 300000): void { // 5 minutes default
    logger.info('Starting real-time earnings sentiment updates');
    
    const updateEarningsData = () => {
      try {
        // Update sentiment analyses for completed calls
        const completedCalls = Array.from(this.earningsCalls.values())
          .filter(call => call.status === 'completed');
        
        // Occasionally update sentiment scores with small changes
        completedCalls.forEach(call => {
          const analysis = this.sentimentAnalyses.get(call.id);
          if (analysis && Math.random() < 0.1) { // 10% chance to update
            // Small adjustment to sentiment based on continued analysis
            const adjustment = (Math.random() - 0.5) * 0.1;
            analysis.sentimentScore = Math.max(-1, Math.min(1, analysis.sentimentScore + adjustment));
            analysis.confidence = Math.max(0.5, Math.min(1, analysis.confidence + (Math.random() - 0.5) * 0.05));
          }
        });
        
        // Generate new alerts occasionally
        if (Math.random() < 0.02) { // 2% chance
          this.generateNewAlert();
        }
        
        // Update executive profiles occasionally
        if (Math.random() < 0.05) { // 5% chance
          this.updateExecutiveProfiles();
        }
        
        // Emit update event
        this.emit('earnings-updated', {
          timestamp: Date.now(),
          callsCount: this.earningsCalls.size,
          analysesCount: this.sentimentAnalyses.size,
          alertsCount: this.alerts.size
        });
        
        logger.info('Earnings sentiment data updated');
        
      } catch (error) {
        logger.error('Error updating earnings sentiment:', error);
      }
    };
    
    // Initial update
    updateEarningsData();
    
    // Set up interval
    setInterval(updateEarningsData, intervalMs);
  }

  /**
   * Generate new alert
   */
  private generateNewAlert(): void {
    const alertTypes: EarningsAlert['type'][] = ['sentiment_change', 'unusual_tone', 'guidance_update'];
    const type = alertTypes[Math.floor(Math.random() * alertTypes.length)];
    const symbols = ['AAPL', 'GOOGL', 'MSFT', 'AMZN', 'TSLA', 'META', 'NVDA'];
    const symbol = symbols[Math.floor(Math.random() * symbols.length)];
    
    const alertId = `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const alert: EarningsAlert = {
      id: alertId,
      type,
      severity: 'medium',
      symbol,
      title: `${symbol} Earnings Alert`,
      message: `New development detected in ${symbol} earnings analysis`,
      timestamp: Date.now(),
      actionRequired: Math.random() > 0.7,
      marketImplication: 'Monitor for potential trading opportunities',
      acknowledged: false
    };
    
    this.alerts.set(alertId, alert);
  }

  /**
   * Update executive profiles with latest data
   */
  private updateExecutiveProfiles(): void {
    this.executiveProfiles.forEach((profile, profileId) => {
      // Slightly adjust historical metrics based on recent performance
      const adjustment = (Math.random() - 0.5) * 0.05;
      profile.historicalTone.averageConfidence = Math.max(0, Math.min(1, 
        profile.historicalTone.averageConfidence + adjustment
      ));
      profile.historicalTone.averageOptimism = Math.max(0, Math.min(1, 
        profile.historicalTone.averageOptimism + adjustment
      ));
      profile.lastUpdated = Date.now();
    });
  }
}