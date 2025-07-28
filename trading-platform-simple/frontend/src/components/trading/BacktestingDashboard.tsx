import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, Legend, ScatterChart, Scatter, PieChart, Pie, Cell
} from 'recharts';
import { 
  TrendingUp, TrendingDown, Play, Settings, BarChart3, Calculator,
  Target, Shield, DollarSign, Clock, Zap, Award
} from 'lucide-react';

interface Strategy {
  id: string;
  name: string;
  description: string;
  parameters: Record<string, any>;
}

interface BacktestConfig {
  strategyId: string;
  symbols: string[];
  startDate: string;
  endDate: string;
  initialCapital: number;
  timeframe: string;
  commission: number;
  slippage: number;
  maxPositionSize: number;
  riskFreeRate: number;
  strategyParams: Record<string, any>;
}

interface BacktestResult {
  config: BacktestConfig;
  summary: {
    totalReturn: number;
    annualizedReturn: number;
    volatility: number;
    sharpeRatio: number;
    sortinoRatio: number;
    maxDrawdown: number;
    calmarRatio: number;
    winRate: number;
    profitFactor: number;
    totalTrades: number;
    averageHoldingPeriod: number;
    totalCommissions: number;
    totalSlippage: number;
  };
  trades: Array<{
    id: string;
    symbol: string;
    action: 'BUY' | 'SELL';
    quantity: number;
    price: number;
    timestamp: number;
    commission: number;
    slippage: number;
    pnl?: number;
    holdingPeriod?: number;
  }>;
  equity: Array<{
    timestamp: number;
    equity: number;
    drawdown: number;
    positions: any[];
  }>;
  monthlyReturns: Array<{
    month: string;
    return: number;
  }>;
  metrics: {
    var95: number;
    cvar95: number;
    beta: number;
    alpha: number;
    informationRatio: number;
    treynorRatio: number;
  };
}

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8', '#82CA9D'];

export const BacktestingDashboard: React.FC = () => {
  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [selectedStrategy, setSelectedStrategy] = useState<Strategy | null>(null);
  const [backtestConfig, setBacktestConfig] = useState<BacktestConfig>({
    strategyId: '',
    symbols: ['AAPL'],
    startDate: '2023-01-01',
    endDate: '2024-01-01',
    initialCapital: 100000,
    timeframe: '1d',
    commission: 5,
    slippage: 0.001,
    maxPositionSize: 0.2,
    riskFreeRate: 0.05,
    strategyParams: {}
  });
  const [backtestResult, setBacktestResult] = useState<BacktestResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('config');

  useEffect(() => {
    fetchStrategies();
  }, []);

  const fetchStrategies = async () => {
    try {
      const response = await fetch('http://localhost:8001/api/backtesting/strategies');
      const data = await response.json();
      setStrategies(data.strategies);
      
      if (data.strategies.length > 0) {
        const defaultStrategy = data.strategies[0];
        setSelectedStrategy(defaultStrategy);
        setBacktestConfig(prev => ({
          ...prev,
          strategyId: defaultStrategy.id,
          strategyParams: defaultStrategy.parameters
        }));
      }
    } catch (error) {
      console.error('Error fetching strategies:', error);
    }
  };

  const runBacktest = async () => {
    if (!selectedStrategy) return;

    try {
      setLoading(true);
      const response = await fetch('http://localhost:8001/api/backtesting/run', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(backtestConfig),
      });

      const data = await response.json();
      if (data.success) {
        setBacktestResult(data.result);
        setActiveTab('results');
      }
    } catch (error) {
      console.error('Error running backtest:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleStrategyChange = (strategyId: string) => {
    const strategy = strategies.find(s => s.id === strategyId);
    if (strategy) {
      setSelectedStrategy(strategy);
      setBacktestConfig(prev => ({
        ...prev,
        strategyId: strategy.id,
        strategyParams: strategy.parameters
      }));
    }
  };

  const updateStrategyParam = (paramName: string, value: any) => {
    setBacktestConfig(prev => ({
      ...prev,
      strategyParams: {
        ...prev.strategyParams,
        [paramName]: value
      }
    }));
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

  // Transform equity data for chart
  const equityChartData = backtestResult?.equity.map(point => ({
    date: new Date(point.timestamp).toLocaleDateString(),
    equity: point.equity,
    drawdown: point.drawdown * 100,
    benchmark: backtestResult.config.initialCapital * (1 + 0.08 * 
      ((point.timestamp - backtestResult.equity[0].timestamp) / (365.25 * 24 * 60 * 60 * 1000)))
  })) || [];

  // Transform monthly returns for chart
  const monthlyReturnsData = backtestResult?.monthlyReturns.map(month => ({
    month: month.month,
    return: month.return,
    color: month.return >= 0 ? '#00C49F' : '#FF8042'
  })) || [];

  // Transform trades data for analysis
  const tradesData = backtestResult?.trades.filter(t => t.pnl !== undefined).map(trade => ({
    date: new Date(trade.timestamp).toLocaleDateString(),
    pnl: trade.pnl || 0,
    symbol: trade.symbol,
    action: trade.action
  })) || [];

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Strategy Backtesting</h1>
          <p className="text-gray-600">Test and analyze trading strategies with historical data</p>
        </div>
        <div className="flex gap-4">
          <Button 
            onClick={runBacktest} 
            disabled={loading || !selectedStrategy}
            className="flex items-center gap-2"
          >
            {loading ? (
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
            ) : (
              <Play className="h-4 w-4" />
            )}
            {loading ? 'Running...' : 'Run Backtest'}
          </Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList>
          <TabsTrigger value="config">Configuration</TabsTrigger>
          <TabsTrigger value="results" disabled={!backtestResult}>Results</TabsTrigger>
          <TabsTrigger value="analysis" disabled={!backtestResult}>Analysis</TabsTrigger>
          <TabsTrigger value="trades" disabled={!backtestResult}>Trades</TabsTrigger>
        </TabsList>

        <TabsContent value="config" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Strategy Configuration */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Settings className="h-5 w-5" />
                  Strategy Selection
                </CardTitle>
                <CardDescription>Choose and configure your trading strategy</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="strategy">Trading Strategy</Label>
                  <Select value={backtestConfig.strategyId} onValueChange={handleStrategyChange}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a strategy" />
                    </SelectTrigger>
                    <SelectContent>
                      {strategies.map(strategy => (
                        <SelectItem key={strategy.id} value={strategy.id}>
                          {strategy.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {selectedStrategy && (
                  <div className="space-y-3">
                    <p className="text-sm text-gray-600">{selectedStrategy.description}</p>
                    
                    <div className="space-y-3">
                      <h4 className="font-medium">Strategy Parameters</h4>
                      {Object.entries(selectedStrategy.parameters).map(([key, defaultValue]) => (
                        <div key={key} className="space-y-2">
                          <Label htmlFor={key} className="text-sm capitalize">
                            {key.replace(/([A-Z])/g, ' $1').toLowerCase()}
                          </Label>
                          {typeof defaultValue === 'number' ? (
                            <div className="space-y-2">
                              <Slider
                                value={[backtestConfig.strategyParams[key] || defaultValue]}
                                onValueChange={([value]) => updateStrategyParam(key, value)}
                                min={key.includes('Period') ? 1 : 0}
                                max={key.includes('Period') ? 100 : 1}
                                step={key.includes('Period') ? 1 : 0.01}
                                className="w-full"
                              />
                              <div className="text-sm text-gray-500">
                                Value: {backtestConfig.strategyParams[key] || defaultValue}
                              </div>
                            </div>
                          ) : (
                            <Input
                              id={key}
                              value={backtestConfig.strategyParams[key] || defaultValue}
                              onChange={(e) => updateStrategyParam(key, e.target.value)}
                            />
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Backtest Configuration */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Calculator className="h-5 w-5" />
                  Backtest Settings
                </CardTitle>
                <CardDescription>Configure backtest parameters and constraints</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="startDate">Start Date</Label>
                    <Input
                      id="startDate"
                      type="date"
                      value={backtestConfig.startDate}
                      onChange={(e) => setBacktestConfig(prev => ({
                        ...prev,
                        startDate: e.target.value
                      }))}
                    />
                  </div>
                  <div>
                    <Label htmlFor="endDate">End Date</Label>
                    <Input
                      id="endDate"
                      type="date"
                      value={backtestConfig.endDate}
                      onChange={(e) => setBacktestConfig(prev => ({
                        ...prev,
                        endDate: e.target.value
                      }))}
                    />
                  </div>
                </div>

                <div>
                  <Label htmlFor="symbols">Symbols (comma-separated)</Label>
                  <Input
                    id="symbols"
                    value={backtestConfig.symbols.join(', ')}
                    onChange={(e) => setBacktestConfig(prev => ({
                      ...prev,
                      symbols: e.target.value.split(',').map(s => s.trim().toUpperCase())
                    }))}
                    placeholder="AAPL, GOOGL, MSFT"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="initialCapital">Initial Capital</Label>
                    <Input
                      id="initialCapital"
                      type="number"
                      value={backtestConfig.initialCapital}
                      onChange={(e) => setBacktestConfig(prev => ({
                        ...prev,
                        initialCapital: parseInt(e.target.value)
                      }))}
                    />
                  </div>
                  <div>
                    <Label htmlFor="timeframe">Timeframe</Label>
                    <Select 
                      value={backtestConfig.timeframe} 
                      onValueChange={(value) => setBacktestConfig(prev => ({
                        ...prev,
                        timeframe: value
                      }))}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="1m">1 Minute</SelectItem>
                        <SelectItem value="5m">5 Minutes</SelectItem>
                        <SelectItem value="15m">15 Minutes</SelectItem>
                        <SelectItem value="1h">1 Hour</SelectItem>
                        <SelectItem value="4h">4 Hours</SelectItem>
                        <SelectItem value="1d">1 Day</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="commission">Commission ($)</Label>
                    <Input
                      id="commission"
                      type="number"
                      step="0.01"
                      value={backtestConfig.commission}
                      onChange={(e) => setBacktestConfig(prev => ({
                        ...prev,
                        commission: parseFloat(e.target.value)
                      }))}
                    />
                  </div>
                  <div>
                    <Label htmlFor="slippage">Slippage (%)</Label>
                    <Input
                      id="slippage"
                      type="number"
                      step="0.001"
                      value={backtestConfig.slippage * 100}
                      onChange={(e) => setBacktestConfig(prev => ({
                        ...prev,
                        slippage: parseFloat(e.target.value) / 100
                      }))}
                    />
                  </div>
                </div>

                <div>
                  <Label htmlFor="maxPositionSize">Max Position Size (%)</Label>
                  <Slider
                    value={[backtestConfig.maxPositionSize * 100]}
                    onValueChange={([value]) => setBacktestConfig(prev => ({
                      ...prev,
                      maxPositionSize: value / 100
                    }))}
                    min={1}
                    max={50}
                    step={1}
                    className="w-full"
                  />
                  <div className="text-sm text-gray-500 mt-1">
                    {formatPercent(backtestConfig.maxPositionSize * 100)} of portfolio
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="results" className="space-y-6">
          {backtestResult && (
            <>
              {/* Key Metrics Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Total Return</CardTitle>
                    <TrendingUp className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className={`text-2xl font-bold ${getMetricColor(backtestResult.summary.totalReturn)}`}>
                      {formatPercent(backtestResult.summary.totalReturn)}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Annualized: {formatPercent(backtestResult.summary.annualizedReturn)}
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Sharpe Ratio</CardTitle>
                    <Target className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className={`text-2xl font-bold ${getMetricColor(backtestResult.summary.sharpeRatio)}`}>
                      {formatNumber(backtestResult.summary.sharpeRatio)}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Sortino: {formatNumber(backtestResult.summary.sortinoRatio)}
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Max Drawdown</CardTitle>
                    <Shield className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className={`text-2xl font-bold ${getMetricColor(-Math.abs(backtestResult.summary.maxDrawdown))}`}>
                      {formatPercent(backtestResult.summary.maxDrawdown)}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Calmar: {formatNumber(backtestResult.summary.calmarRatio)}
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Win Rate</CardTitle>
                    <Award className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className={`text-2xl font-bold ${getMetricColor(backtestResult.summary.winRate - 50)}`}>
                      {formatPercent(backtestResult.summary.winRate)}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Profit Factor: {formatNumber(backtestResult.summary.profitFactor)}
                    </p>
                  </CardContent>
                </Card>
              </div>

              {/* Charts */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Equity Curve</CardTitle>
                    <CardDescription>Portfolio value over time</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={300}>
                      <LineChart data={equityChartData}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="date" />
                        <YAxis />
                        <Tooltip 
                          formatter={(value: number, name: string) => [
                            name === 'equity' ? formatCurrency(value) : formatPercent(value),
                            name === 'equity' ? 'Portfolio' : name === 'benchmark' ? 'Benchmark' : 'Drawdown'
                          ]}
                        />
                        <Legend />
                        <Line 
                          type="monotone" 
                          dataKey="equity" 
                          stroke="#0088FE" 
                          name="Portfolio"
                          strokeWidth={2}
                        />
                        <Line 
                          type="monotone" 
                          dataKey="benchmark" 
                          stroke="#00C49F" 
                          name="Benchmark"
                          strokeWidth={1}
                          strokeDasharray="5 5"
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Monthly Returns</CardTitle>
                    <CardDescription>Monthly performance breakdown</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={300}>
                      <BarChart data={monthlyReturnsData}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="month" />
                        <YAxis />
                        <Tooltip formatter={(value: number) => [formatPercent(value), 'Return']} />
                        <Bar dataKey="return">
                          {monthlyReturnsData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              </div>

              {/* Summary Statistics */}
              <Card>
                <CardHeader>
                  <CardTitle>Performance Summary</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div>
                      <p className="text-sm text-gray-600">Volatility</p>
                      <p className="font-semibold">{formatPercent(backtestResult.summary.volatility)}</p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-600">Total Trades</p>
                      <p className="font-semibold">{backtestResult.summary.totalTrades}</p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-600">Avg Holding Period</p>
                      <p className="font-semibold">{formatNumber(backtestResult.summary.averageHoldingPeriod)} days</p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-600">Total Costs</p>
                      <p className="font-semibold">
                        {formatCurrency(backtestResult.summary.totalCommissions + backtestResult.summary.totalSlippage)}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-600">Alpha</p>
                      <p className={`font-semibold ${getMetricColor(backtestResult.metrics.alpha)}`}>
                        {formatPercent(backtestResult.metrics.alpha)}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-600">Beta</p>
                      <p className="font-semibold">{formatNumber(backtestResult.metrics.beta)}</p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-600">Information Ratio</p>
                      <p className={`font-semibold ${getMetricColor(backtestResult.metrics.informationRatio)}`}>
                        {formatNumber(backtestResult.metrics.informationRatio)}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-600">VaR (95%)</p>
                      <p className="font-semibold text-red-600">{formatPercent(backtestResult.metrics.var95)}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>

        <TabsContent value="analysis" className="space-y-6">
          {backtestResult && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle>Drawdown Analysis</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={250}>
                    <LineChart data={equityChartData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="date" />
                      <YAxis />
                      <Tooltip formatter={(value: number) => [formatPercent(value), 'Drawdown']} />
                      <Line 
                        type="monotone" 
                        dataKey="drawdown" 
                        stroke="#FF8042" 
                        fill="#FF8042"
                        strokeWidth={2}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Risk Metrics</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-gray-600">Value at Risk (95%)</p>
                      <p className="text-red-600 font-semibold">{formatPercent(backtestResult.metrics.var95)}</p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-600">Conditional VaR</p>
                      <p className="text-red-600 font-semibold">{formatPercent(backtestResult.metrics.cvar95)}</p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-600">Beta</p>
                      <p className="font-semibold">{formatNumber(backtestResult.metrics.beta)}</p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-600">Treynor Ratio</p>
                      <p className={`font-semibold ${getMetricColor(backtestResult.metrics.treynorRatio)}`}>
                        {formatNumber(backtestResult.metrics.treynorRatio)}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </TabsContent>

        <TabsContent value="trades" className="space-y-6">
          {backtestResult && (
            <Card>
              <CardHeader>
                <CardTitle>Trade History</CardTitle>
                <CardDescription>
                  {backtestResult.summary.totalTrades} trades executed
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b">
                          <th className="text-left p-2">Date</th>
                          <th className="text-left p-2">Symbol</th>
                          <th className="text-left p-2">Action</th>
                          <th className="text-right p-2">Quantity</th>
                          <th className="text-right p-2">Price</th>
                          <th className="text-right p-2">P&L</th>
                          <th className="text-right p-2">Hold Period</th>
                        </tr>
                      </thead>
                      <tbody>
                        {backtestResult.trades.slice(0, 20).map((trade, index) => (
                          <tr key={trade.id} className="border-b hover:bg-gray-50">
                            <td className="p-2">
                              {new Date(trade.timestamp).toLocaleDateString()}
                            </td>
                            <td className="p-2">
                              <Badge variant="outline">{trade.symbol}</Badge>
                            </td>
                            <td className="p-2">
                              <Badge variant={trade.action === 'BUY' ? 'default' : 'secondary'}>
                                {trade.action}
                              </Badge>
                            </td>
                            <td className="text-right p-2">{trade.quantity.toLocaleString()}</td>
                            <td className="text-right p-2">{formatCurrency(trade.price)}</td>
                            <td className={`text-right p-2 ${
                              trade.pnl ? getMetricColor(trade.pnl) : ''
                            }`}>
                              {trade.pnl ? formatCurrency(trade.pnl) : '-'}
                            </td>
                            <td className="text-right p-2">
                              {trade.holdingPeriod 
                                ? `${Math.round(trade.holdingPeriod / (24 * 60 * 60 * 1000))}d`
                                : '-'
                              }
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {backtestResult.trades.length > 20 && (
                    <p className="text-sm text-gray-600">
                      Showing first 20 of {backtestResult.trades.length} trades
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default BacktestingDashboard;