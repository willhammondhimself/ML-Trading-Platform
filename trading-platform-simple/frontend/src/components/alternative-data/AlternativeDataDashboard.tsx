import React, { useState, useEffect } from 'react';
import { useWebSocket } from '@/hooks/useWebSocket';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Tab,
  Tabs,
  Grid,
  Chip,
  LinearProgress,
  Alert,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  IconButton,
  Tooltip,
  Badge,
  CircularProgress,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  Divider
} from '@mui/material';
import {
  TrendingUp,
  TrendingDown,
  Satellite,
  Twitter,
  Assessment,
  Phone,
  LocationOn,
  Timeline,
  Warning,
  CheckCircle,
  Info,
  NotificationsActive,
  AccountBalance,
  ShowChart,
  People,
  Business,
  TrendingFlat
} from '@mui/icons-material';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, BarChart, Bar, PieChart, Pie, Cell, AreaChart, Area } from 'recharts';

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

function TabPanel(props: TabPanelProps) {
  const { children, value, index, ...other } = props;

  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`alternative-data-tabpanel-${index}`}
      aria-labelledby={`alternative-data-tab-${index}`}
      {...other}
    >
      {value === index && (
        <Box sx={{ p: 3 }}>
          {children}
        </Box>
      )}
    </div>
  );
}

// Satellite Analysis Tab Component
const SatelliteAnalysisTab: React.FC = () => {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const { socket } = useWebSocket();

  useEffect(() => {
    const fetchData = async () => {
      try {
        const response = await fetch('/api/satellite-analysis/dashboard');
        const result = await response.json();
        setData(result.dashboard);
      } catch (error) {
        console.error('Error fetching satellite data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
    
    // Listen for real-time updates via WebSocket
    if (socket) {
      const handleUpdate = () => {
        fetchData(); // Refresh data when updates are received
      };
      
      socket.on('satellite-analysis-updated', handleUpdate);
      socket.on('macro-indicators-updated', handleUpdate);
      
      return () => {
        socket.off('satellite-analysis-updated', handleUpdate);
        socket.off('macro-indicators-updated', handleUpdate);
      };
    }
  }, [socket]);

  if (loading) return <CircularProgress />;
  if (!data) return <Alert severity="error">Failed to load satellite data</Alert>;

  const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8'];

  return (
    <Grid container spacing={3}>
      {/* Key Metrics */}
      <Grid item xs={12}>
        <Grid container spacing={2}>
          <Grid item xs={12} sm={6} md={3}>
            <Card>
              <CardContent>
                <Box display="flex" alignItems="center">
                  <LocationOn color="primary" />
                  <Box ml={1}>
                    <Typography variant="h6">{data.metrics.totalLocations}</Typography>
                    <Typography variant="body2" color="textSecondary">Locations Monitored</Typography>
                  </Box>
                </Box>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <Card>
              <CardContent>
                <Box display="flex" alignItems="center">
                  <TrendingUp color="success" />
                  <Box ml={1}>
                    <Typography variant="h6">{data.metrics.positiveSignals}</Typography>
                    <Typography variant="body2" color="textSecondary">Bullish Signals</Typography>
                  </Box>
                </Box>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <Card>
              <CardContent>
                <Box display="flex" alignItems="center">
                  <TrendingDown color="error" />
                  <Box ml={1}>
                    <Typography variant="h6">{data.metrics.negativeSignals}</Typography>
                    <Typography variant="body2" color="textSecondary">Bearish Signals</Typography>
                  </Box>
                </Box>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <Card>
              <CardContent>
                <Box display="flex" alignItems="center">
                  <ShowChart color="info" />
                  <Box ml={1}>
                    <Typography variant="h6">{data.metrics.averageActivity.toFixed(1)}%</Typography>
                    <Typography variant="body2" color="textSecondary">Avg Activity</Typography>
                  </Box>
                </Box>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      </Grid>

      {/* Trading Signals */}
      <Grid item xs={12} md={6}>
        <Card>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              <Satellite sx={{ mr: 1 }} />
              Trading Signals
            </Typography>
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Symbol</TableCell>
                    <TableCell>Signal</TableCell>
                    <TableCell>Strength</TableCell>
                    <TableCell>Trend</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {data.reports.slice(0, 5).map((report: any) => (
                    <TableRow key={report.symbol}>
                      <TableCell>
                        <Chip label={report.symbol} size="small" />
                      </TableCell>
                      <TableCell>
                        <Chip 
                          label={report.tradingSignal.signal.toUpperCase()} 
                          color={
                            report.tradingSignal.signal === 'buy' ? 'success' :
                            report.tradingSignal.signal === 'sell' ? 'error' : 'default'
                          }
                          size="small"
                        />
                      </TableCell>
                      <TableCell>
                        <Box display="flex" alignItems="center">
                          <LinearProgress 
                            variant="determinate" 
                            value={report.tradingSignal.strength * 100} 
                            sx={{ width: 60, mr: 1 }}
                          />
                          <Typography variant="body2">
                            {(report.tradingSignal.strength * 100).toFixed(0)}%
                          </Typography>
                        </Box>
                      </TableCell>
                      <TableCell>
                        <Chip 
                          label={report.aggregateMetrics.overallTrend} 
                          color={
                            report.aggregateMetrics.overallTrend === 'bullish' ? 'success' :
                            report.aggregateMetrics.overallTrend === 'bearish' ? 'error' : 'default'
                          }
                          size="small"
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </CardContent>
        </Card>
      </Grid>

      {/* Latest Foot Traffic Trends */}
      <Grid item xs={12} md={6}>
        <Card>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              Foot Traffic Trends
            </Typography>
            <List dense>
              {data.latestTrends.slice(0, 8).map((trend: any, index: number) => (
                <ListItem key={index}>
                  <ListItemIcon>
                    {trend.trend === 'increasing' ? 
                      <TrendingUp color="success" /> : 
                      trend.trend === 'decreasing' ? 
                      <TrendingDown color="error" /> : 
                      <TrendingFlat color="disabled" />
                    }
                  </ListItemIcon>
                  <ListItemText
                    primary={`${trend.symbol} - ${trend.location}`}
                    secondary={`${trend.weekOverWeekChange > 0 ? '+' : ''}${trend.weekOverWeekChange.toFixed(1)}% WoW`}
                  />
                  <Typography 
                    variant="body2" 
                    color={trend.revenueImpact === 'positive' ? 'success.main' : 
                           trend.revenueImpact === 'negative' ? 'error.main' : 'text.secondary'}
                  >
                    {trend.activity}%
                  </Typography>
                </ListItem>
              ))}
            </List>
          </CardContent>
        </Card>
      </Grid>

      {/* Key Insights */}
      <Grid item xs={12}>
        <Card>
          <CardContent>
            <Typography variant="h6" gutterBottom>Key Insights</Typography>
            <Grid container spacing={2}>
              {data.topInsights.map((insight: string, index: number) => (
                <Grid item xs={12} md={6} key={index}>
                  <Alert severity="info" variant="outlined">
                    {insight}
                  </Alert>
                </Grid>
              ))}
            </Grid>
          </CardContent>
        </Card>
      </Grid>
    </Grid>
  );
};

// Social Sentiment Tab Component
const SocialSentimentTab: React.FC = () => {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const { socket } = useWebSocket();

  useEffect(() => {
    const fetchData = async () => {
      try {
        const response = await fetch('/api/social-sentiment/dashboard');
        const result = await response.json();
        setData(result.dashboard);
      } catch (error) {
        console.error('Error fetching social sentiment data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
    
    // Listen for real-time updates via WebSocket
    if (socket) {
      const handleUpdate = () => {
        fetchData(); // Refresh data when updates are received
      };
      
      socket.on('social-sentiment-updated', handleUpdate);
      
      return () => {
        socket.off('social-sentiment-updated', handleUpdate);
      };
    }
  }, [socket]);

  if (loading) return <CircularProgress />;
  if (!data) return <Alert severity="error">Failed to load social sentiment data</Alert>;

  const platformData = [
    { name: 'Twitter', value: data.metrics.platformBreakdown.twitter, color: '#1DA1F2' },
    { name: 'Reddit', value: data.metrics.platformBreakdown.reddit, color: '#FF4500' },
    { name: 'StockTwits', value: data.metrics.platformBreakdown.stocktwits, color: '#00D4AA' },
    { name: 'Discord', value: data.metrics.platformBreakdown.discord, color: '#7289DA' },
    { name: 'YouTube', value: data.metrics.platformBreakdown.youtube, color: '#FF0000' }
  ];

  return (
    <Grid container spacing={3}>
      {/* Key Metrics */}
      <Grid item xs={12}>
        <Grid container spacing={2}>
          <Grid item xs={12} sm={6} md={3}>
            <Card>
              <CardContent>
                <Box display="flex" alignItems="center">
                  <Twitter color="primary" />
                  <Box ml={1}>
                    <Typography variant="h6">{data.metrics.totalPosts.toLocaleString()}</Typography>
                    <Typography variant="body2" color="textSecondary">Total Posts</Typography>
                  </Box>
                </Box>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <Card>
              <CardContent>
                <Box display="flex" alignItems="center">
                  <TrendingUp color="success" />
                  <Box ml={1}>
                    <Typography variant="h6">{data.metrics.bullishSignals}</Typography>
                    <Typography variant="body2" color="textSecondary">Bullish Signals</Typography>
                  </Box>
                </Box>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <Card>
              <CardContent>
                <Box display="flex" alignItems="center">
                  <TrendingDown color="error" />
                  <Box ml={1}>
                    <Typography variant="h6">{data.metrics.bearishSignals}</Typography>
                    <Typography variant="body2" color="textSecondary">Bearish Signals</Typography>
                  </Box>
                </Box>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <Card>
              <CardContent>
                <Box display="flex" alignItems="center">
                  <People color="info" />
                  <Box ml={1}>
                    <Typography variant="h6">{data.metrics.influencerPosts}</Typography>
                    <Typography variant="body2" color="textSecondary">Influencer Posts</Typography>
                  </Box>
                </Box>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      </Grid>

      {/* Platform Breakdown Chart */}
      <Grid item xs={12} md={6}>
        <Card>
          <CardContent>
            <Typography variant="h6" gutterBottom>Platform Activity</Typography>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={platformData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {platformData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <RechartsTooltip />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </Grid>

      {/* Social Signals */}
      <Grid item xs={12} md={6}>
        <Card>
          <CardContent>
            <Typography variant="h6" gutterBottom>Social Trading Signals</Typography>
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Symbol</TableCell>
                    <TableCell>Signal</TableCell>
                    <TableCell>Strength</TableCell>
                    <TableCell>Confidence</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {data.socialSignals.slice(0, 5).map((signal: any) => (
                    <TableRow key={signal.symbol}>
                      <TableCell>
                        <Chip label={signal.symbol} size="small" />
                      </TableCell>
                      <TableCell>
                        <Chip 
                          label={signal.signal.toUpperCase()} 
                          color={
                            signal.signal === 'buy' ? 'success' :
                            signal.signal === 'sell' ? 'error' : 'default'
                          }
                          size="small"
                        />
                      </TableCell>
                      <TableCell>
                        <Box display="flex" alignItems="center">
                          <LinearProgress 
                            variant="determinate" 
                            value={signal.strength * 100} 
                            sx={{ width: 60, mr: 1 }}
                          />
                          <Typography variant="body2">
                            {(signal.strength * 100).toFixed(0)}%
                          </Typography>
                        </Box>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2">
                          {(signal.confidence * 100).toFixed(0)}%
                        </Typography>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </CardContent>
        </Card>
      </Grid>

      {/* Trending Topics */}
      <Grid item xs={12} md={6}>
        <Card>
          <CardContent>
            <Typography variant="h6" gutterBottom>Trending Topics</Typography>
            <List dense>
              {data.trendingTopics.slice(0, 6).map((topic: any, index: number) => (
                <ListItem key={index}>
                  <ListItemIcon>
                    <Timeline color={topic.growth > 0 ? 'success' : 'error'} />
                  </ListItemIcon>
                  <ListItemText
                    primary={topic.topic}
                    secondary={`${topic.mentions.toLocaleString()} mentions • ${topic.growth > 0 ? '+' : ''}${topic.growth.toFixed(1)}% growth`}
                  />
                  <Chip 
                    label={topic.peaked ? 'Peaked' : 'Rising'} 
                    color={topic.peaked ? 'default' : 'success'}
                    size="small"
                  />
                </ListItem>
              ))}
            </List>
          </CardContent>
        </Card>
      </Grid>

      {/* Top Influencer Posts */}
      <Grid item xs={12} md={6}>
        <Card>
          <CardContent>
            <Typography variant="h6" gutterBottom>Top Influencer Activity</Typography>
            <List dense>
              {data.topInfluencerPosts.slice(0, 6).map((post: any, index: number) => (
                <ListItem key={index}>
                  <ListItemIcon>
                    <Badge 
                      badgeContent={post.verified ? <CheckCircle fontSize="small" /> : null}
                      color="primary"
                    >
                      <People />
                    </Badge>
                  </ListItemIcon>
                  <ListItemText
                    primary={`@${post.author} (${post.platform})`}
                    secondary={`${post.content.substring(0, 100)}...`}
                  />
                  <Box textAlign="right">
                    <Typography variant="caption" display="block">
                      {post.likes + post.shares} interactions
                    </Typography>
                    <Chip 
                      label={post.sentiment} 
                      color={
                        post.sentiment === 'bullish' ? 'success' :
                        post.sentiment === 'bearish' ? 'error' : 'default'
                      }
                      size="small"
                    />
                  </Box>
                </ListItem>
              ))}
            </List>
          </CardContent>
        </Card>
      </Grid>
    </Grid>
  );
};

// Economic Indicators Tab Component
const EconomicIndicatorsTab: React.FC = () => {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const { socket } = useWebSocket();

  useEffect(() => {
    const fetchData = async () => {
      try {
        const response = await fetch('/api/economic-indicators/dashboard');
        const result = await response.json();
        setData(result.dashboard);
      } catch (error) {
        console.error('Error fetching economic data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
    
    // Listen for real-time updates via WebSocket
    if (socket) {
      const handleUpdate = () => {
        fetchData(); // Refresh data when updates are received
      };
      
      socket.on('economic-indicators-updated', handleUpdate);
      
      return () => {
        socket.off('economic-indicators-updated', handleUpdate);
      };
    }
  }, [socket]);

  if (loading) return <CircularProgress />;
  if (!data) return <Alert severity="error">Failed to load economic data</Alert>;

  const trendData = [
    { name: 'Bullish', value: data.trendSummary.bullish, color: '#4caf50' },
    { name: 'Bearish', value: data.trendSummary.bearish, color: '#f44336' },
    { name: 'Neutral', value: data.trendSummary.neutral, color: '#ff9800' }
  ];

  return (
    <Grid container spacing={3}>
      {/* Economic Health Summary */}
      <Grid item xs={12}>
        <Card>
          <CardContent>
            <Typography variant="h6" gutterBottom>Economic Health Summary</Typography>
            <Grid container spacing={2}>
              <Grid item xs={12} sm={6} md={3}>
                <Box textAlign="center">
                  <Typography variant="h4" color="primary">
                    {data.summary.overallHealth.toUpperCase()}
                  </Typography>
                  <Typography variant="body2" color="textSecondary">Overall Health</Typography>
                </Box>
              </Grid>
              <Grid item xs={12} sm={6} md={3}>
                <Box textAlign="center">
                  <Typography variant="h4" color={data.summary.gdpGrowth > 2 ? 'success.main' : 'warning.main'}>
                    {data.summary.gdpGrowth.toFixed(1)}%
                  </Typography>
                  <Typography variant="body2" color="textSecondary">GDP Growth</Typography>
                </Box>
              </Grid>
              <Grid item xs={12} sm={6} md={3}>
                <Box textAlign="center">
                  <Typography variant="h4" color={
                    data.summary.inflationTrend === 'falling' ? 'success.main' :
                    data.summary.inflationTrend === 'rising' ? 'error.main' : 'warning.main'
                  }>
                    {data.summary.inflationTrend.toUpperCase()}
                  </Typography>
                  <Typography variant="body2" color="textSecondary">Inflation Trend</Typography>
                </Box>
              </Grid>
              <Grid item xs={12} sm={6} md={3}>
                <Box textAlign="center">
                  <Typography variant="h4" color={
                    data.summary.marketSentiment === 'bullish' ? 'success.main' :
                    data.summary.marketSentiment === 'bearish' ? 'error.main' : 'warning.main'
                  }>
                    {data.summary.marketSentiment.toUpperCase()}
                  </Typography>
                  <Typography variant="body2" color="textSecondary">Market Sentiment</Typography>
                </Box>
              </Grid>
            </Grid>
          </CardContent>
        </Card>
      </Grid>

      {/* Key Economic Indicators */}
      <Grid item xs={12} md={8}>
        <Card>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              <AccountBalance sx={{ mr: 1 }} />
              Key Economic Indicators
            </Typography>
            <TableContainer>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell>Indicator</TableCell>
                    <TableCell>Current</TableCell>
                    <TableCell>Change</TableCell>
                    <TableCell>Impact</TableCell>
                    <TableCell>Importance</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {data.keyIndicators.map((indicator: any) => (
                    <TableRow key={indicator.id}>
                      <TableCell>
                        <Typography variant="body2" fontWeight="medium">
                          {indicator.name}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2">
                          {indicator.value.toFixed(indicator.unit === '%' ? 1 : 0)}{indicator.unit}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Box display="flex" alignItems="center">
                          {indicator.changePercent > 0 ? 
                            <TrendingUp color="success" fontSize="small" /> :
                            indicator.changePercent < 0 ?
                            <TrendingDown color="error" fontSize="small" /> :
                            <TrendingFlat color="disabled" fontSize="small" />
                          }
                          <Typography 
                            variant="body2" 
                            color={
                              indicator.changePercent > 0 ? 'success.main' :
                              indicator.changePercent < 0 ? 'error.main' : 'text.secondary'
                            }
                            sx={{ ml: 0.5 }}
                          >
                            {indicator.changePercent > 0 ? '+' : ''}{indicator.changePercent.toFixed(1)}%
                          </Typography>
                        </Box>
                      </TableCell>
                      <TableCell>
                        <Chip 
                          label={indicator.marketImpact} 
                          color={
                            indicator.marketImpact === 'positive' ? 'success' :
                            indicator.marketImpact === 'negative' ? 'error' : 'default'
                          }
                          size="small"
                        />
                      </TableCell>
                      <TableCell>
                        <Chip 
                          label={indicator.importance} 
                          color={
                            indicator.importance === 'critical' ? 'error' :
                            indicator.importance === 'high' ? 'warning' : 'default'
                          }
                          size="small"
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </CardContent>
        </Card>
      </Grid>

      {/* Macro Trends */}
      <Grid item xs={12} md={4}>
        <Card>
          <CardContent>
            <Typography variant="h6" gutterBottom>Macro Trends</Typography>
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie
                  data={trendData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {trendData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <RechartsTooltip />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </Grid>

      {/* Active Alerts */}
      <Grid item xs={12} md={6}>
        <Card>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              <NotificationsActive sx={{ mr: 1 }} />
              Active Alerts ({data.alertSummary.unacknowledged})
            </Typography>
            <List dense>
              {data.alerts.slice(0, 5).map((alert: any) => (
                <ListItem key={alert.id}>
                  <ListItemIcon>
                    <Warning color={
                      alert.severity === 'critical' ? 'error' :
                      alert.severity === 'high' ? 'warning' : 'info'
                    } />
                  </ListItemIcon>
                  <ListItemText
                    primary={alert.title}
                    secondary={alert.message}
                  />
                  <Chip 
                    label={alert.severity} 
                    color={
                      alert.severity === 'critical' ? 'error' :
                      alert.severity === 'high' ? 'warning' : 'info'
                    }
                    size="small"
                  />
                </ListItem>
              ))}
            </List>
          </CardContent>
        </Card>
      </Grid>

      {/* Upcoming Events */}
      <Grid item xs={12} md={6}>
        <Card>
          <CardContent>
            <Typography variant="h6" gutterBottom>Upcoming Economic Events</Typography>
            <List dense>
              {data.upcomingEvents.slice(0, 5).map((event: any, index: number) => (
                <ListItem key={index}>
                  <ListItemIcon>
                    <Info color={
                      event.importance === 'critical' ? 'error' :
                      event.importance === 'high' ? 'warning' : 'info'
                    } />
                  </ListItemIcon>
                  <ListItemText
                    primary={event.indicator}
                    secondary={`${event.date} at ${event.time} (${event.country})`}
                  />
                  <Box textAlign="right">
                    <Typography variant="caption" display="block">
                      Forecast: {event.forecast}
                    </Typography>
                    <Typography variant="caption" color="textSecondary">
                      Previous: {event.previous}
                    </Typography>
                  </Box>
                </ListItem>
              ))}
            </List>
          </CardContent>
        </Card>
      </Grid>
    </Grid>
  );
};

// Earnings Sentiment Tab Component
const EarningsSentimentTab: React.FC = () => {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const { socket } = useWebSocket();

  useEffect(() => {
    const fetchData = async () => {
      try {
        const response = await fetch('/api/earnings-sentiment/dashboard');
        const result = await response.json();
        setData(result.dashboard);
      } catch (error) {
        console.error('Error fetching earnings data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
    
    // Listen for real-time updates via WebSocket
    if (socket) {
      const handleUpdate = () => {
        fetchData(); // Refresh data when updates are received
      };
      
      socket.on('earnings-sentiment-updated', handleUpdate);
      
      return () => {
        socket.off('earnings-sentiment-updated', handleUpdate);
      };
    }
  }, [socket]);

  if (loading) return <CircularProgress />;
  if (!data) return <Alert severity="error">Failed to load earnings data</Alert>;

  const sentimentData = [
    { name: 'Very Positive', value: data.sentimentDistribution.veryPositive, color: '#2e7d32' },
    { name: 'Positive', value: data.sentimentDistribution.positive, color: '#66bb6a' },
    { name: 'Neutral', value: data.sentimentDistribution.neutral, color: '#ffa726' },
    { name: 'Negative', value: data.sentimentDistribution.negative, color: '#ef5350' },
    { name: 'Very Negative', value: data.sentimentDistribution.veryNegative, color: '#c62828' }
  ];

  return (
    <Grid container spacing={3}>
      {/* Key Metrics */}
      <Grid item xs={12}>
        <Grid container spacing={2}>
          <Grid item xs={12} sm={6} md={3}>
            <Card>
              <CardContent>
                <Box display="flex" alignItems="center">
                  <Phone color="primary" />
                  <Box ml={1}>
                    <Typography variant="h6">{data.metrics.totalCalls}</Typography>
                    <Typography variant="body2" color="textSecondary">Total Calls</Typography>
                  </Box>
                </Box>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <Card>
              <CardContent>
                <Box display="flex" alignItems="center">
                  <Assessment color="success" />
                  <Box ml={1}>
                    <Typography variant="h6">{data.metrics.totalAnalyses}</Typography>
                    <Typography variant="body2" color="textSecondary">Analyses</Typography>
                  </Box>
                </Box>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <Card>
              <CardContent>
                <Box display="flex" alignItems="center">
                  <TrendingUp color="info" />
                  <Box ml={1}>
                    <Typography variant="h6">{(data.metrics.averageSentiment * 100).toFixed(0)}%</Typography>
                    <Typography variant="body2" color="textSecondary">Avg Sentiment</Typography>
                  </Box>
                </Box>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <Card>
              <CardContent>
                <Box display="flex" alignItems="center">
                  <Business color="warning" />
                  <Box ml={1}>
                    <Typography variant="h6">{data.metrics.executivesTracked}</Typography>
                    <Typography variant="body2" color="textSecondary">Executives</Typography>
                  </Box>
                </Box>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      </Grid>

      {/* Sentiment Distribution */}
      <Grid item xs={12} md={6}>
        <Card>
          <CardContent>
            <Typography variant="h6" gutterBottom>Sentiment Distribution</Typography>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={sentimentData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {sentimentData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <RechartsTooltip />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </Grid>

      {/* Recent Analyses */}
      <Grid item xs={12} md={6}>
        <Card>
          <CardContent>
            <Typography variant="h6" gutterBottom>Recent Earnings Analysis</Typography>
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Symbol</TableCell>
                    <TableCell>Sentiment</TableCell>
                    <TableCell>Confidence</TableCell>
                    <TableCell>Market Move</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {data.recentAnalyses.slice(0, 5).map((analysis: any) => (
                    <TableRow key={analysis.callId}>
                      <TableCell>
                        <Chip label={analysis.symbol} size="small" />
                      </TableCell>
                      <TableCell>
                        <Chip 
                          label={analysis.overallSentiment.replace('_', ' ')} 
                          color={
                            analysis.sentimentScore > 0.4 ? 'success' :
                            analysis.sentimentScore > 0 ? 'info' :
                            analysis.sentimentScore > -0.4 ? 'warning' : 'error'
                          }
                          size="small"
                        />
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2">
                          {(analysis.confidence * 100).toFixed(0)}%
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Box display="flex" alignItems="center">
                          {analysis.marketReaction.nextDayMove > 0 ? 
                            <TrendingUp color="success" fontSize="small" /> :
                            <TrendingDown color="error" fontSize="small" />
                          }
                          <Typography 
                            variant="body2" 
                            color={analysis.marketReaction.nextDayMove > 0 ? 'success.main' : 'error.main'}
                            sx={{ ml: 0.5 }}
                          >
                            {analysis.marketReaction.nextDayMove > 0 ? '+' : ''}{analysis.marketReaction.nextDayMove?.toFixed(1)}%
                          </Typography>
                        </Box>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </CardContent>
        </Card>
      </Grid>

      {/* Upcoming Calls */}
      <Grid item xs={12} md={6}>
        <Card>
          <CardContent>
            <Typography variant="h6" gutterBottom>Upcoming Earnings Calls</Typography>
            <List dense>
              {data.upcomingCalls.map((call: any) => (
                <ListItem key={call.id}>
                  <ListItemIcon>
                    <Phone color="primary" />
                  </ListItemIcon>
                  <ListItemText
                    primary={`${call.symbol} - ${call.quarter}`}
                    secondary={`${new Date(call.callDate).toLocaleDateString()} at ${call.callTime}`}
                  />
                  <Box textAlign="right">
                    <Typography variant="caption" display="block">
                      {call.analystCount} analysts
                    </Typography>
                    <Typography variant="caption" color="textSecondary">
                      {call.callDuration}min call
                    </Typography>
                  </Box>
                </ListItem>
              ))}
            </List>
          </CardContent>
        </Card>
      </Grid>

      {/* Key Themes */}
      <Grid item xs={12} md={6}>
        <Card>
          <CardContent>
            <Typography variant="h6" gutterBottom">Key Earnings Themes</Typography>
            <List dense>
              {data.keyThemes.map((theme: any, index: number) => (
                <ListItem key={index}>
                  <ListItemIcon>
                    <Assessment color="info" />
                  </ListItemIcon>
                  <ListItemText
                    primary={theme.theme}
                    secondary={`${theme.mentions} mentions across recent calls`}
                  />
                  <Typography variant="body2" color="textSecondary">
                    #{index + 1}
                  </Typography>
                </ListItem>
              ))}
            </List>
          </CardContent>
        </Card>
      </Grid>

      {/* Market Movers */}
      <Grid item xs={12}>
        <Card>
          <CardContent>
            <Typography variant="h6" gutterBottom>Market Movers (Post-Earnings)</Typography>
            <TableContainer>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell>Symbol</TableCell>
                    <TableCell>Sentiment</TableCell>
                    <TableCell>Market Move</TableCell>
                    <TableCell>Volume Spike</TableCell>
                    <TableCell>Guidance</TableCell>
                    <TableCell>Key Theme</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {data.marketMovers.map((mover: any) => (
                    <TableRow key={mover.callId}>
                      <TableCell>
                        <Chip label={mover.symbol} size="small" />
                      </TableCell>
                      <TableCell>
                        <Chip 
                          label={mover.overallSentiment.replace('_', ' ')} 
                          color={
                            mover.sentimentScore > 0.4 ? 'success' :
                            mover.sentimentScore > 0 ? 'info' :
                            mover.sentimentScore > -0.4 ? 'warning' : 'error'
                          }
                          size="small"
                        />
                      </TableCell>
                      <TableCell>
                        <Box display="flex" alignItems="center">
                          {mover.marketReaction.nextDayMove > 0 ? 
                            <TrendingUp color="success" fontSize="small" /> :
                            <TrendingDown color="error" fontSize="small" />
                          }
                          <Typography 
                            variant="body2" 
                            color={mover.marketReaction.nextDayMove > 0 ? 'success.main' : 'error.main'}
                            sx={{ ml: 0.5 }}
                            fontWeight="medium"
                          >
                            {mover.marketReaction.nextDayMove > 0 ? '+' : ''}{mover.marketReaction.nextDayMove?.toFixed(1)}%
                          </Typography>
                        </Box>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2">
                          {mover.marketReaction.volumeSpike.toFixed(1)}x
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Chip 
                          label={mover.guidance.tone} 
                          color={
                            mover.guidance.tone === 'raised' ? 'success' :
                            mover.guidance.tone === 'lowered' ? 'error' : 'default'
                          }
                          size="small"
                        />
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" noWrap style={{ maxWidth: 150 }}>
                          {mover.keyThemes[0]?.theme || 'N/A'}
                        </Typography>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </CardContent>
        </Card>
      </Grid>
    </Grid>
  );
};

// Main Alternative Data Dashboard Component
const AlternativeDataDashboard: React.FC = () => {
  const [tabValue, setTabValue] = useState(0);

  const handleTabChange = (event: React.SyntheticEvent, newValue: number) => {
    setTabValue(newValue);
  };

  return (
    <Box sx={{ width: '100%' }}>
      <Typography variant="h4" gutterBottom>
        Alternative Data Intelligence
      </Typography>
      
      <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
        <Tabs value={tabValue} onChange={handleTabChange} aria-label="alternative data tabs">
          <Tab 
            label="Satellite Analysis" 
            icon={<Satellite />} 
            iconPosition="start"
            id="alternative-data-tab-0"
            aria-controls="alternative-data-tabpanel-0"
          />
          <Tab 
            label="Social Sentiment" 
            icon={<Twitter />} 
            iconPosition="start"
            id="alternative-data-tab-1"
            aria-controls="alternative-data-tabpanel-1"
          />
          <Tab 
            label="Economic Indicators" 
            icon={<AccountBalance />} 
            iconPosition="start"
            id="alternative-data-tab-2"
            aria-controls="alternative-data-tabpanel-2"
          />
          <Tab 
            label="Earnings Sentiment" 
            icon={<Phone />} 
            iconPosition="start"
            id="alternative-data-tab-3"
            aria-controls="alternative-data-tabpanel-3"
          />
        </Tabs>
      </Box>

      <TabPanel value={tabValue} index={0}>
        <SatelliteAnalysisTab />
      </TabPanel>
      <TabPanel value={tabValue} index={1}>
        <SocialSentimentTab />
      </TabPanel>
      <TabPanel value={tabValue} index={2}>
        <EconomicIndicatorsTab />
      </TabPanel>
      <TabPanel value={tabValue} index={3}>
        <EarningsSentimentTab />
      </TabPanel>
    </Box>
  );
};

export default AlternativeDataDashboard;