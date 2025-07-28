import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, Legend, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar,
  PieChart, Pie, Cell, AreaChart, Area
} from 'recharts';
import { 
  Shield, AlertTriangle, TrendingUp, TrendingDown, Target, Settings,
  Calculator, Activity, BarChart3, DollarSign, Eye, AlertCircle, CheckCircle,
  Zap, ArrowUp, ArrowDown, Minus, RefreshCw
} from 'lucide-react';

interface PortfolioMetrics {
  totalValue: number;
  totalPnL: number;
  dailyPnL: number;
  unrealizedPnL: number;
  realizedPnL: number;
  drawdown: number;
  maxDrawdown: number;
  leverage: number;
  concentration: Record<string, number>;
  var95: number;
  var99: number;
  expectedShortfall: number;
  sharpeRatio: number;
  volatility: number;
  beta: number;
  riskAdjustedReturn: number;
}

interface RiskLimits {
  maxPositionSize: number;
  maxPortfolioRisk: number;
  maxDrawdown: number;
  maxLeverage: number;
  maxConcentration: number;
  maxDailyLoss: number;
  maxVaR: number;
}

interface RiskAlert {
  id: string;
  type: 'limit_breach' | 'var_breach' | 'drawdown_alert' | 'concentration_alert' | 'margin_alert';
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  symbol?: string;
  currentValue: number;
  limitValue: number;
  timestamp: number;
  acknowledged: boolean;
}

interface Position {
  id: string;
  symbol: string;
  side: 'long' | 'short';
  quantity: number;
  entryPrice: number;
  currentPrice: number;
  stopLoss?: number;
  takeProfit?: number;
  unrealizedPnL: number;
  realizedPnL: number;
  timestamp: number;
  strategyId?: string;
}

interface PositionSizeRecommendation {
  symbol: string;
  recommendedSize: number;
  maxAllowedSize: number;
  riskScore: number;
  kellyFraction: number;
  confidenceLevel: number;
  reasoning: string;
  riskFactors: string[];
}

interface StressTestScenario {
  name: string;
  description: string;
  marketShock: number;
  volatilityMultiplier: number;
  correlationIncrease: number;
  estimatedLoss: number;
  worstCaseDrawdown: number;
}

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8', '#82CA9D'];

export const RiskManagementDashboard: React.FC = () => {
  const [metrics, setMetrics] = useState<PortfolioMetrics | null>(null);
  const [limits, setLimits] = useState<RiskLimits | null>(null);
  const [alerts, setAlerts] = useState<RiskAlert[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);
  const [stressTests, setStressTests] = useState<StressTestScenario[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('overview');

  // Position sizing form
  const [positionSizeForm, setPositionSizeForm] = useState({
    symbol: 'AAPL',
    entryPrice: '',
    stopLoss: '',
    winRate: '0.55',
    avgWin: '1.5',
    avgLoss: '1.0'
  });
  const [positionRecommendation, setPositionRecommendation] = useState<PositionSizeRecommendation | null>(null);

  useEffect(() => {
    fetchDashboardData();
    const interval = setInterval(fetchDashboardData, 30000); // Update every 30 seconds
    return () => clearInterval(interval);
  }, []);

  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      
      // Fetch all risk management data
      const [metricsRes, limitsRes, alertsRes, positionsRes, stressRes] = await Promise.all([
        fetch('http://localhost:8001/api/risk-management/metrics'),
        fetch('http://localhost:8001/api/risk-management/limits'),
        fetch('http://localhost:8001/api/risk-management/alerts'),
        fetch('http://localhost:8001/api/risk-management/positions'),
        fetch('http://localhost:8001/api/risk-management/stress-tests')
      ]);

      const [metricsData, limitsData, alertsData, positionsData, stressData] = await Promise.all([
        metricsRes.json(),
        limitsRes.json(),
        alertsRes.json(),
        positionsRes.json(),
        stressRes.json()
      ]);

      if (metricsData.success) setMetrics(metricsData.metrics);
      if (limitsData.success) setLimits(limitsData.limits);
      if (alertsData.success) setAlerts(alertsData.alerts);
      if (positionsData.success) setPositions(positionsData.positions);
      if (stressData.success) setStressTests(stressData.scenarios);

    } catch (error) {
      console.error('Error fetching risk management data:', error);
    } finally {
      setLoading(false);
    }
  };

  const calculatePositionSize = async () => {
    try {
      const response = await fetch('http://localhost:8001/api/risk-management/position-size', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          symbol: positionSizeForm.symbol,
          entryPrice: parseFloat(positionSizeForm.entryPrice),
          stopLoss: parseFloat(positionSizeForm.stopLoss),
          winRate: parseFloat(positionSizeForm.winRate),
          avgWin: parseFloat(positionSizeForm.avgWin),
          avgLoss: parseFloat(positionSizeForm.avgLoss)
        }),
      });

      const data = await response.json();
      if (data.success) {
        setPositionRecommendation(data.recommendation);
      }
    } catch (error) {
      console.error('Error calculating position size:', error);
    }
  };

  const acknowledgeAlert = async (alertId: string) => {
    try {
      const response = await fetch(`http://localhost:8001/api/risk-management/alerts/${alertId}/acknowledge`, {
        method: 'POST',
      });

      if (response.ok) {
        setAlerts(alerts.map(alert => 
          alert.id === alertId ? { ...alert, acknowledged: true } : alert
        ));
      }
    } catch (error) {
      console.error('Error acknowledging alert:', error);
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
    return `${(value * 100).toFixed(decimals)}%`;
  };

  const formatNumber = (value: number, decimals = 2) => {
    return value.toFixed(decimals);
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical': return 'text-red-600 bg-red-50 border-red-200';
      case 'high': return 'text-orange-600 bg-orange-50 border-orange-200';
      case 'medium': return 'text-yellow-600 bg-yellow-50 border-yellow-200';
      case 'low': return 'text-blue-600 bg-blue-50 border-blue-200';
      default: return 'text-gray-600 bg-gray-50 border-gray-200';
    }
  };

  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case 'critical': return AlertCircle;
      case 'high': return AlertTriangle;
      case 'medium': return Eye;
      case 'low': return CheckCircle;
      default: return Activity;
    }
  };

  if (!metrics || !limits) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex items-center gap-2">
          <RefreshCw className="h-4 w-4 animate-spin" />
          <span>Loading risk management data...</span>
        </div>
      </div>
    );
  }

  // Prepare data for visualizations
  const riskUtilizationData = [
    { metric: 'Leverage', current: metrics.leverage, limit: limits.maxLeverage, utilization: (metrics.leverage / limits.maxLeverage) * 100 },
    { metric: 'Drawdown', current: metrics.drawdown, limit: limits.maxDrawdown, utilization: (metrics.drawdown / limits.maxDrawdown) * 100 },
    { metric: 'VaR 95%', current: metrics.var95, limit: limits.maxVaR, utilization: (metrics.var95 / limits.maxVaR) * 100 },
    { metric: 'Daily Loss', current: Math.abs(metrics.dailyPnL) / metrics.totalValue, limit: limits.maxDailyLoss, utilization: (Math.abs(metrics.dailyPnL) / metrics.totalValue / limits.maxDailyLoss) * 100 }
  ];

  const concentrationData = Object.entries(metrics.concentration).map(([symbol, value]) => ({
    symbol,
    concentration: value * 100,
    limit: limits.maxConcentration * 100
  }));

  const positionPnLData = positions.map(pos => ({
    symbol: pos.symbol,
    unrealizedPnL: pos.unrealizedPnL,
    side: pos.side
  }));

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Shield className="h-8 w-8 text-blue-600" />
            Risk Management
          </h1>
          <p className="text-gray-600">Portfolio risk monitoring and position sizing</p>
        </div>
        <div className="flex gap-4">
          <Button onClick={fetchDashboardData} disabled={loading} size="sm">
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Critical Alerts */}
      {alerts.filter(alert => !alert.acknowledged && alert.severity === 'critical').length > 0 && (
        <Alert className="border-red-200 bg-red-50">
          <AlertCircle className="h-4 w-4 text-red-600" />
          <AlertDescription className="text-red-800">
            <strong>Critical Risk Alert:</strong> {alerts.filter(alert => !alert.acknowledged && alert.severity === 'critical').length} critical risk issues require immediate attention.
          </AlertDescription>
        </Alert>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="positions">Positions</TabsTrigger>
          <TabsTrigger value="alerts">Alerts</TabsTrigger>
          <TabsTrigger value="sizing">Position Sizing</TabsTrigger>
          <TabsTrigger value="stress">Stress Tests</TabsTrigger>
          <TabsTrigger value="limits">Risk Limits</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          {/* Portfolio Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Portfolio Value</CardTitle>
                <DollarSign className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{formatCurrency(metrics.totalValue)}</div>
                <p className={`text-xs ${metrics.totalPnL >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {metrics.totalPnL >= 0 ? '+' : ''}{formatCurrency(metrics.totalPnL)} total P&L
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Daily P&L</CardTitle>
                {metrics.dailyPnL >= 0 ? (
                  <TrendingUp className="h-4 w-4 text-green-600" />
                ) : (
                  <TrendingDown className="h-4 w-4 text-red-600" />
                )}
              </CardHeader>
              <CardContent>
                <div className={`text-2xl font-bold ${metrics.dailyPnL >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {metrics.dailyPnL >= 0 ? '+' : ''}{formatCurrency(metrics.dailyPnL)}
                </div>
                <p className="text-xs text-muted-foreground">
                  {formatPercent(metrics.dailyPnL / metrics.totalValue)} of portfolio
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Current Drawdown</CardTitle>
                <BarChart3 className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-orange-600">
                  {formatPercent(metrics.drawdown)}
                </div>
                <p className="text-xs text-muted-foreground">
                  Max: {formatPercent(metrics.maxDrawdown)}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Portfolio Leverage</CardTitle>
                <Zap className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {formatNumber(metrics.leverage)}x
                </div>
                <p className="text-xs text-muted-foreground">
                  Limit: {formatNumber(limits.maxLeverage)}x
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Risk Utilization and Concentration */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Risk Utilization</CardTitle>
                <CardDescription>Current risk metrics vs limits</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={riskUtilizationData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="metric" />
                    <YAxis />
                    <Tooltip 
                      formatter={(value: number, name: string) => [
                        `${value.toFixed(1)}%`,
                        name === 'utilization' ? 'Utilization' : name
                      ]}
                    />
                    <Bar dataKey="utilization" fill="#0088FE" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Position Concentration</CardTitle>
                <CardDescription>Portfolio allocation by symbol</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={concentrationData}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ symbol, concentration }) => `${symbol}: ${concentration.toFixed(1)}%`}
                      outerRadius={80}
                      fill="#8884d8"
                      dataKey="concentration"
                    >
                      {concentrationData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value: number) => [`${value.toFixed(1)}%`, 'Concentration']} />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          {/* Risk Metrics Summary */}
          <Card>
            <CardHeader>
              <CardTitle>Risk Metrics Summary</CardTitle>
              <CardDescription>Key portfolio risk indicators</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="space-y-2">
                  <div className="text-sm font-medium text-gray-600">Value at Risk (95%)</div>
                  <div className="text-lg font-bold">{formatPercent(metrics.var95)}</div>
                  <Progress value={(metrics.var95 / limits.maxVaR) * 100} className="h-2" />
                </div>
                
                <div className="space-y-2">
                  <div className="text-sm font-medium text-gray-600">Expected Shortfall</div>
                  <div className="text-lg font-bold">{formatPercent(metrics.expectedShortfall)}</div>
                  <div className="text-xs text-gray-500">Tail risk measure</div>
                </div>
                
                <div className="space-y-2">
                  <div className="text-sm font-medium text-gray-600">Sharpe Ratio</div>
                  <div className="text-lg font-bold">{formatNumber(metrics.sharpeRatio)}</div>
                  <div className="text-xs text-gray-500">Risk-adjusted return</div>
                </div>
                
                <div className="space-y-2">
                  <div className="text-sm font-medium text-gray-600">Portfolio Beta</div>
                  <div className="text-lg font-bold">{formatNumber(metrics.beta)}</div>
                  <div className="text-xs text-gray-500">Market sensitivity</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="positions" className="space-y-6">
          {/* Position P&L Chart */}
          <Card>
            <CardHeader>
              <CardTitle>Position P&L Overview</CardTitle>
              <CardDescription>Unrealized P&L by position</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={positionPnLData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="symbol" />
                  <YAxis />
                  <Tooltip formatter={(value: number) => [formatCurrency(value), 'P&L']} />
                  <Bar dataKey="unrealizedPnL" fill="#0088FE" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Positions Table */}
          <Card>
            <CardHeader>
              <CardTitle>Active Positions</CardTitle>
              <CardDescription>Current portfolio positions</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {positions.map((position) => (
                  <div key={position.id} className="flex items-center justify-between p-4 border rounded-lg">
                    <div className="flex items-center gap-4">
                      <Badge variant={position.side === 'long' ? 'default' : 'destructive'}>
                        {position.side.toUpperCase()}
                      </Badge>
                      <div>
                        <div className="font-medium">{position.symbol}</div>
                        <div className="text-sm text-gray-600">
                          {position.quantity} shares @ {formatCurrency(position.entryPrice)}
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-6 text-sm">
                      <div>
                        <div className="text-gray-600">Current</div>
                        <div className="font-medium">{formatCurrency(position.currentPrice)}</div>
                      </div>
                      
                      <div>
                        <div className="text-gray-600">P&L</div>
                        <div className={`font-medium ${position.unrealizedPnL >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {position.unrealizedPnL >= 0 ? '+' : ''}{formatCurrency(position.unrealizedPnL)}
                        </div>
                      </div>
                      
                      {position.stopLoss && (
                        <div>
                          <div className="text-gray-600">Stop Loss</div>
                          <div className="font-medium">{formatCurrency(position.stopLoss)}</div>
                        </div>
                      )}
                      
                      {position.takeProfit && (
                        <div>
                          <div className="text-gray-600">Take Profit</div>
                          <div className="font-medium">{formatCurrency(position.takeProfit)}</div>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
                
                {positions.length === 0 && (
                  <div className="text-center py-8 text-gray-500">
                    No active positions
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="alerts" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Risk Alerts</CardTitle>
              <CardDescription>Active risk warnings and limit breaches</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {alerts.map((alert) => {
                  const IconComponent = getSeverityIcon(alert.severity);
                  return (
                    <div key={alert.id} className={`p-4 rounded-lg border ${getSeverityColor(alert.severity)}`}>
                      <div className="flex items-start justify-between">
                        <div className="flex items-start gap-3">
                          <IconComponent className="h-5 w-5 mt-0.5" />
                          <div>
                            <div className="font-medium">{alert.message}</div>
                            <div className="text-sm mt-1">
                              Current: {formatPercent(alert.currentValue)} | Limit: {formatPercent(alert.limitValue)}
                            </div>
                            <div className="text-xs mt-1 opacity-75">
                              {new Date(alert.timestamp).toLocaleString()}
                            </div>
                          </div>
                        </div>
                        
                        {!alert.acknowledged && (
                          <Button 
                            size="sm" 
                            variant="outline"
                            onClick={() => acknowledgeAlert(alert.id)}
                          >
                            Acknowledge
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
                
                {alerts.length === 0 && (
                  <div className="text-center py-8 text-gray-500">
                    <CheckCircle className="h-12 w-12 mx-auto mb-4 text-green-500" />
                    No active risk alerts
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="sizing" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Position Size Calculator */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Calculator className="h-5 w-5" />
                  Position Size Calculator
                </CardTitle>
                <CardDescription>Kelly Criterion and risk-based position sizing</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="symbol">Symbol</Label>
                    <Select value={positionSizeForm.symbol} onValueChange={(value) => 
                      setPositionSizeForm(prev => ({ ...prev, symbol: value }))
                    }>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {['AAPL', 'GOOGL', 'MSFT', 'AMZN', 'TSLA', 'META', 'NVDA'].map(symbol => (
                          <SelectItem key={symbol} value={symbol}>{symbol}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div>
                    <Label htmlFor="entryPrice">Entry Price</Label>
                    <Input
                      id="entryPrice"
                      type="number"
                      step="0.01"
                      value={positionSizeForm.entryPrice}
                      onChange={(e) => setPositionSizeForm(prev => ({ ...prev, entryPrice: e.target.value }))}
                      placeholder="150.00"
                    />
                  </div>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="stopLoss">Stop Loss</Label>
                    <Input
                      id="stopLoss"
                      type="number"
                      step="0.01"
                      value={positionSizeForm.stopLoss}
                      onChange={(e) => setPositionSizeForm(prev => ({ ...prev, stopLoss: e.target.value }))}
                      placeholder="145.00"
                    />
                  </div>
                  
                  <div>
                    <Label htmlFor="winRate">Win Rate</Label>
                    <Input
                      id="winRate"
                      type="number"
                      step="0.01"
                      min="0"
                      max="1"
                      value={positionSizeForm.winRate}
                      onChange={(e) => setPositionSizeForm(prev => ({ ...prev, winRate: e.target.value }))}
                      placeholder="0.55"
                    />
                  </div>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="avgWin">Average Win Multiple</Label>
                    <Input
                      id="avgWin"
                      type="number"
                      step="0.1"
                      value={positionSizeForm.avgWin}
                      onChange={(e) => setPositionSizeForm(prev => ({ ...prev, avgWin: e.target.value }))}
                      placeholder="1.5"
                    />
                  </div>
                  
                  <div>
                    <Label htmlFor="avgLoss">Average Loss Multiple</Label>
                    <Input
                      id="avgLoss"
                      type="number"
                      step="0.1"
                      value={positionSizeForm.avgLoss}
                      onChange={(e) => setPositionSizeForm(prev => ({ ...prev, avgLoss: e.target.value }))}
                      placeholder="1.0"
                    />
                  </div>
                </div>
                
                <Button onClick={calculatePositionSize} className="w-full">
                  Calculate Position Size
                </Button>
              </CardContent>
            </Card>

            {/* Position Size Recommendation */}
            {positionRecommendation && (
              <Card>
                <CardHeader>
                  <CardTitle>Position Size Recommendation</CardTitle>
                  <CardDescription>Risk-optimized position sizing for {positionRecommendation.symbol}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <div className="text-sm font-medium text-gray-600">Recommended Size</div>
                      <div className="text-2xl font-bold text-blue-600">
                        {positionRecommendation.recommendedSize} shares
                      </div>
                      <div className="text-sm text-gray-500">
                        ${(positionRecommendation.recommendedSize * parseFloat(positionSizeForm.entryPrice || '0')).toLocaleString()}
                      </div>
                    </div>
                    
                    <div>
                      <div className="text-sm font-medium text-gray-600">Max Allowed</div>
                      <div className="text-2xl font-bold text-gray-600">
                        {positionRecommendation.maxAllowedSize} shares
                      </div>
                      <div className="text-sm text-gray-500">
                        Risk limit cap
                      </div>
                    </div>
                  </div>
                  
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">Risk Score</span>
                      <div className="flex items-center gap-2">
                        <Progress value={positionRecommendation.riskScore * 100} className="w-20 h-2" />
                        <span className="text-sm">{formatPercent(positionRecommendation.riskScore)}</span>
                      </div>
                    </div>
                    
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">Kelly Fraction</span>
                      <span className="text-sm">{formatPercent(positionRecommendation.kellyFraction)}</span>
                    </div>
                    
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">Confidence Level</span>
                      <span className="text-sm">{formatPercent(positionRecommendation.confidenceLevel)}</span>
                    </div>
                  </div>
                  
                  <div className="p-3 bg-gray-50 rounded">
                    <div className="text-sm font-medium mb-2">Reasoning</div>
                    <div className="text-sm text-gray-600">{positionRecommendation.reasoning}</div>
                  </div>
                  
                  {positionRecommendation.riskFactors.length > 0 && (
                    <div className="p-3 bg-yellow-50 rounded border border-yellow-200">
                      <div className="text-sm font-medium mb-2 text-yellow-800">Risk Factors</div>
                      <ul className="text-sm text-yellow-700 space-y-1">
                        {positionRecommendation.riskFactors.map((factor, index) => (
                          <li key={index}>• {factor}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>

        <TabsContent value="stress" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Stress Test Scenarios</CardTitle>
              <CardDescription>Portfolio performance under adverse market conditions</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {stressTests.map((scenario, index) => (
                  <div key={scenario.name} className="p-4 border rounded-lg">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <h4 className="font-medium">{scenario.name}</h4>
                        <p className="text-sm text-gray-600 mt-1">{scenario.description}</p>
                        
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-3 text-sm">
                          <div>
                            <div className="text-gray-600">Market Shock</div>
                            <div className="font-medium text-red-600">{formatPercent(scenario.marketShock)}</div>
                          </div>
                          
                          <div>
                            <div className="text-gray-600">Volatility Multiple</div>
                            <div className="font-medium">{scenario.volatilityMultiplier}x</div>
                          </div>
                          
                          <div>
                            <div className="text-gray-600">Estimated Loss</div>
                            <div className="font-medium text-red-600">{formatCurrency(scenario.estimatedLoss)}</div>
                          </div>
                          
                          <div>
                            <div className="text-gray-600">Worst Drawdown</div>
                            <div className="font-medium text-red-600">{formatPercent(scenario.worstCaseDrawdown)}</div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="limits" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Risk Limits Configuration</CardTitle>
              <CardDescription>Portfolio risk constraints and limits</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div>
                    <Label>Max Position Size</Label>
                    <div className="text-2xl font-bold">{formatPercent(limits.maxPositionSize)}</div>
                    <div className="text-sm text-gray-600">Maximum % of portfolio in single position</div>
                  </div>
                  
                  <div>
                    <Label>Max Portfolio Risk</Label>
                    <div className="text-2xl font-bold">{formatPercent(limits.maxPortfolioRisk)}</div>
                    <div className="text-sm text-gray-600">Maximum risk per trade</div>
                  </div>
                  
                  <div>
                    <Label>Max Drawdown</Label>
                    <div className="text-2xl font-bold">{formatPercent(limits.maxDrawdown)}</div>
                    <div className="text-sm text-gray-600">Maximum allowed portfolio drawdown</div>
                  </div>
                </div>
                
                <div className="space-y-4">
                  <div>
                    <Label>Max Leverage</Label>
                    <div className="text-2xl font-bold">{formatNumber(limits.maxLeverage)}x</div>
                    <div className="text-sm text-gray-600">Maximum portfolio leverage</div>
                  </div>
                  
                  <div>
                    <Label>Max Concentration</Label>
                    <div className="text-2xl font-bold">{formatPercent(limits.maxConcentration)}</div>
                    <div className="text-sm text-gray-600">Maximum symbol concentration</div>
                  </div>
                  
                  <div>
                    <Label>Max Daily Loss</Label>
                    <div className="text-2xl font-bold">{formatPercent(limits.maxDailyLoss)}</div>
                    <div className="text-sm text-gray-600">Daily loss circuit breaker</div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default RiskManagementDashboard;