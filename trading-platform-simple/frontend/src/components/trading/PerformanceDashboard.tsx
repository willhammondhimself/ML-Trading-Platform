import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, BarChart, Bar, Legend
} from 'recharts';
import { TrendingUp, TrendingDown, DollarSign, Target, Shield, Activity } from 'lucide-react';

interface PerformanceMetrics {
  totalReturn: number;
  annualizedReturn: number;
  volatility: number;
  sharpeRatio: number;
  sortinoRatio: number;
  maxDrawdown: number;
  calmarRatio: number;
  winRate: number;
  averageWin: number;
  averageLoss: number;
  profitFactor: number;
  var95: number;
  cvar95: number;
}

interface AttributionAnalysis {
  totalPortfolioReturn: number;
  benchmarkReturn: number;
  totalAlpha: number;
  selections: {
    security: number;
    sector: number;
    interaction: number;
  };
  allocations: {
    asset: number;
    sector: number;
    security: number;
  };
  factorExposure: {
    market: number;
    size: number;
    value: number;
    momentum: number;
    quality: number;
    lowVolatility: number;
  };
}

interface RiskMetrics {
  trackingError: number;
  informationRatio: number;
  beta: number;
  correlationWithBenchmark: number;
  activeShare: number;
  concentrationRisk: number;
  sectorExposure: Record<string, number>;
}

interface PortfolioPosition {
  symbol: string;
  weight: number;
  pnl: number;
  sector: string;
}

interface PerformanceData {
  metrics: PerformanceMetrics;
  attribution: AttributionAnalysis;
  riskMetrics: RiskMetrics;
  portfolio: {
    totalValue: number;
    positionCount: number;
    topPositions: PortfolioPosition[];
    sectorAllocation: Record<string, number>;
  };
  timeSeries: {
    data: Array<{
      date: string;
      portfolioValue: number;
      benchmarkValue: number;
      portfolioReturn: number;
      benchmarkReturn: number;
      alpha: number;
      drawdown: number;
    }>;
    latest: any;
  };
}

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8', '#82CA9D'];

export const PerformanceDashboard: React.FC = () => {
  const [performanceData, setPerformanceData] = useState<PerformanceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState('1Y');
  const [benchmark, setBenchmark] = useState('SPY');

  useEffect(() => {
    fetchPerformanceData();
  }, [period, benchmark]);

  const fetchPerformanceData = async () => {
    try {
      setLoading(true);
      const response = await fetch(
        `http://localhost:8001/api/performance/dashboard?period=${period}&benchmark=${benchmark}`
      );
      const data = await response.json();
      setPerformanceData(data);
    } catch (error) {
      console.error('Error fetching performance data:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  const formatPercent = (value: number, decimals = 2) => {
    return `${value.toFixed(decimals)}%`;
  };

  const formatNumber = (value: number, decimals = 2) => {
    return value.toFixed(decimals);
  };

  const getMetricColor = (value: number, threshold = 0) => {
    return value >= threshold ? 'text-green-600' : 'text-red-600';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!performanceData) {
    return <div>Error loading performance data</div>;
  }

  const { metrics, attribution, riskMetrics, portfolio, timeSeries } = performanceData;

  const sectorData = Object.entries(portfolio.sectorAllocation).map(([sector, weight]) => ({
    name: sector,
    value: weight
  }));

  const factorData = Object.entries(attribution.factorExposure).map(([factor, exposure]) => ({
    name: factor.charAt(0).toUpperCase() + factor.slice(1),
    exposure: exposure
  }));

  const performanceChartData = timeSeries.data.map(item => ({
    date: new Date(item.date).toLocaleDateString(),
    portfolio: ((item.portfolioValue - 500000) / 500000) * 100,
    benchmark: ((item.benchmarkValue - 500000) / 500000) * 100,
    alpha: item.alpha * 100
  }));

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Performance Attribution</h1>
          <p className="text-gray-600">Comprehensive portfolio performance analysis</p>
        </div>
        <div className="flex gap-4">
          <Select value={period} onValueChange={setPeriod}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1M">1 Month</SelectItem>
              <SelectItem value="3M">3 Months</SelectItem>
              <SelectItem value="6M">6 Months</SelectItem>
              <SelectItem value="1Y">1 Year</SelectItem>
            </SelectContent>
          </Select>
          <Select value={benchmark} onValueChange={setBenchmark}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="SPY">S&P 500</SelectItem>
              <SelectItem value="QQQ">NASDAQ-100</SelectItem>
              <SelectItem value="XLK">Tech Sector</SelectItem>
            </SelectContent>
          </Select>
          <Button onClick={fetchPerformanceData} variant="outline">
            Refresh
          </Button>
        </div>
      </div>

      {/* Key Metrics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Return</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${getMetricColor(metrics.totalReturn)}`}>
              {formatPercent(metrics.totalReturn)}
            </div>
            <p className="text-xs text-muted-foreground">
              vs {formatPercent(attribution.benchmarkReturn)} benchmark
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Alpha Generated</CardTitle>
            <Target className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${getMetricColor(attribution.totalAlpha)}`}>
              {formatPercent(attribution.totalAlpha)}
            </div>
            <p className="text-xs text-muted-foreground">
              Excess return vs benchmark
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Sharpe Ratio</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${getMetricColor(metrics.sharpeRatio)}`}>
              {formatNumber(metrics.sharpeRatio)}
            </div>
            <p className="text-xs text-muted-foreground">
              Risk-adjusted return
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Max Drawdown</CardTitle>
            <Shield className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${getMetricColor(-Math.abs(metrics.maxDrawdown))}`}>
              {formatPercent(metrics.maxDrawdown)}
            </div>
            <p className="text-xs text-muted-foreground">
              Largest peak-to-trough decline
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Main Content Tabs */}
      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="attribution">Attribution</TabsTrigger>
          <TabsTrigger value="risk">Risk Analysis</TabsTrigger>
          <TabsTrigger value="holdings">Holdings</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Performance vs Benchmark</CardTitle>
                <CardDescription>Portfolio performance compared to {benchmark}</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={performanceChartData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" />
                    <YAxis />
                    <Tooltip 
                      formatter={(value: number) => [formatPercent(value), '']}
                      labelFormatter={(label) => `Date: ${label}`}
                    />
                    <Legend />
                    <Line 
                      type="monotone" 
                      dataKey="portfolio" 
                      stroke="#0088FE" 
                      name="Portfolio"
                      strokeWidth={2}
                    />
                    <Line 
                      type="monotone" 
                      dataKey="benchmark" 
                      stroke="#00C49F" 
                      name="Benchmark"
                      strokeWidth={2}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Key Performance Metrics</CardTitle>
                <CardDescription>Comprehensive risk and return analysis</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-gray-600">Annualized Return</p>
                    <p className={`font-semibold ${getMetricColor(metrics.annualizedReturn)}`}>
                      {formatPercent(metrics.annualizedReturn)}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Volatility</p>
                    <p className="font-semibold">{formatPercent(metrics.volatility)}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Sortino Ratio</p>
                    <p className={`font-semibold ${getMetricColor(metrics.sortinoRatio)}`}>
                      {formatNumber(metrics.sortinoRatio)}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Calmar Ratio</p>
                    <p className={`font-semibold ${getMetricColor(metrics.calmarRatio)}`}>
                      {formatNumber(metrics.calmarRatio)}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Win Rate</p>
                    <p className="font-semibold">{formatPercent(metrics.winRate)}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Profit Factor</p>
                    <p className={`font-semibold ${getMetricColor(metrics.profitFactor - 1)}`}>
                      {formatNumber(metrics.profitFactor)}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="attribution" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Attribution Analysis</CardTitle>
                <CardDescription>Sources of excess return vs benchmark</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-gray-600">Security Selection</p>
                      <p className={`font-semibold ${getMetricColor(attribution.selections.security)}`}>
                        {formatPercent(attribution.selections.security)}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-600">Sector Allocation</p>
                      <p className={`font-semibold ${getMetricColor(attribution.selections.sector)}`}>
                        {formatPercent(attribution.selections.sector)}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-600">Interaction Effect</p>
                      <p className={`font-semibold ${getMetricColor(attribution.selections.interaction)}`}>
                        {formatPercent(attribution.selections.interaction)}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-600">Total Alpha</p>
                      <p className={`font-semibold ${getMetricColor(attribution.totalAlpha)}`}>
                        {formatPercent(attribution.totalAlpha)}
                      </p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Factor Exposure</CardTitle>
                <CardDescription>Portfolio exposures to systematic risk factors</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={factorData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" />
                    <YAxis />
                    <Tooltip formatter={(value: number) => [formatNumber(value), 'Exposure']} />
                    <Bar dataKey="exposure" fill="#0088FE" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="risk" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Risk Metrics</CardTitle>
                <CardDescription>Portfolio risk characteristics vs benchmark</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-gray-600">Beta</p>
                    <p className="font-semibold">{formatNumber(riskMetrics.beta)}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Tracking Error</p>
                    <p className="font-semibold">{formatPercent(riskMetrics.trackingError)}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Information Ratio</p>
                    <p className={`font-semibold ${getMetricColor(riskMetrics.informationRatio)}`}>
                      {formatNumber(riskMetrics.informationRatio)}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Correlation</p>
                    <p className="font-semibold">{formatNumber(riskMetrics.correlationWithBenchmark)}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Active Share</p>
                    <p className="font-semibold">{formatPercent(riskMetrics.activeShare * 100)}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Concentration Risk</p>
                    <p className="font-semibold">{formatNumber(riskMetrics.concentrationRisk)}</p>
                  </div>
                </div>
                <div className="pt-4">
                  <h4 className="font-medium mb-2">Value at Risk (95%)</h4>
                  <p className="text-red-600 font-semibold">{formatPercent(metrics.var95)}</p>
                  <p className="text-sm text-gray-600 mt-1">
                    CVaR: {formatPercent(metrics.cvar95)}
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Sector Allocation</CardTitle>
                <CardDescription>Portfolio allocation by sector</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={sectorData}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ name, value }) => `${name}: ${value.toFixed(1)}%`}
                      outerRadius={80}
                      fill="#8884d8"
                      dataKey="value"
                    >
                      {sectorData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value: number) => [formatPercent(value), 'Weight']} />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="holdings" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Top Holdings</CardTitle>
                <CardDescription>Largest positions by weight</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {portfolio.topPositions.map((position, index) => (
                    <div key={position.symbol} className="flex items-center justify-between p-3 bg-gray-50 rounded">
                      <div className="flex items-center gap-3">
                        <Badge variant="outline">{index + 1}</Badge>
                        <div>
                          <p className="font-medium">{position.symbol}</p>
                          <p className="text-sm text-gray-600">{position.sector}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="font-medium">{formatPercent(position.weight)}</p>
                        <p className={`text-sm ${getMetricColor(position.pnl)}`}>
                          {formatCurrency(position.pnl)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Portfolio Summary</CardTitle>
                <CardDescription>Overall portfolio statistics</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-gray-600">Total Value</p>
                    <p className="text-2xl font-bold">{formatCurrency(portfolio.totalValue)}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Positions</p>
                    <p className="text-2xl font-bold">{portfolio.positionCount}</p>
                  </div>
                </div>
                <div className="pt-4">
                  <h4 className="font-medium mb-2">Performance Period: {period}</h4>
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-sm text-gray-600">Portfolio Return</span>
                      <span className={`font-medium ${getMetricColor(attribution.totalPortfolioReturn)}`}>
                        {formatPercent(attribution.totalPortfolioReturn)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-gray-600">Benchmark Return</span>
                      <span className="font-medium">{formatPercent(attribution.benchmarkReturn)}</span>
                    </div>
                    <div className="flex justify-between border-t pt-2">
                      <span className="text-sm font-medium">Excess Return</span>
                      <span className={`font-bold ${getMetricColor(attribution.totalAlpha)}`}>
                        {formatPercent(attribution.totalAlpha)}
                      </span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default PerformanceDashboard;