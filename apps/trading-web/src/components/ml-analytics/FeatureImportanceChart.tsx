'use client';

import React, { useMemo, useState, useCallback } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  Treemap,
} from 'recharts';
import { cn } from '@/lib/utils';
import { FeatureImportance } from '@/types/ml-analytics';
import { useMLAnalyticsStore } from '@/stores/ml-analytics-store';
import { 
  BarChart3, 
  Filter, 
  Search, 
  TrendingUp, 
  TrendingDown,
  Activity,
  Eye,
  EyeOff,
  Download,
  Grid,
  List,
  Target,
  Settings,
  Info
} from 'lucide-react';

interface FeatureImportanceChartProps {
  modelName?: string;
  maxFeatures?: number;
  chartType?: 'bar' | 'radar' | 'treemap';
  enableDrilldown?: boolean;
  enableExport?: boolean;
  className?: string;
}

interface FeatureData extends FeatureImportance {
  displayName: string;
  categoryColor: string;
  rank: number;
  percentile: number;
}

interface CategorySummary {
  category: string;
  totalImportance: number;
  featureCount: number;
  averageImportance: number;
  color: string;
}

const CATEGORY_COLORS = {
  technical: '#3b82f6',    // Blue
  fundamental: '#10b981',  // Green  
  sentiment: '#8b5cf6',    // Purple
  macro: '#f59e0b',        // Amber
  custom: '#ef4444',       // Red
};

const CATEGORY_ICONS = {
  technical: <BarChart3 className="w-4 h-4" />,
  fundamental: <TrendingUp className="w-4 h-4" />,
  sentiment: <Activity className="w-4 h-4" />,
  macro: <Target className="w-4 h-4" />,
  custom: <Settings className="w-4 h-4" />,
};

export function FeatureImportanceChart({
  modelName,
  maxFeatures = 20,
  chartType = 'bar',
  enableDrilldown = true,
  enableExport = true,
  className,
}: FeatureImportanceChartProps) {
  const { featureImportance } = useMLAnalyticsStore();
  const [sortBy, setSortBy] = useState<'importance' | 'name' | 'category'>('importance');
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedFeature, setSelectedFeature] = useState<string | null>(null);
  const [currentChartType, setCurrentChartType] = useState(chartType);
  const [showSettings, setShowSettings] = useState(false);

  // Process feature importance data
  const processedFeatures = useMemo(() => {
    if (!modelName) return [];
    
    const features = featureImportance.get(modelName) || [];
    
    let filtered = features.filter(feature => {
      if (filterCategory !== 'all' && feature.category !== filterCategory) return false;
      if (searchTerm && !feature.featureName.toLowerCase().includes(searchTerm.toLowerCase())) return false;
      return true;
    });

    // Sort features
    filtered.sort((a, b) => {
      switch (sortBy) {
        case 'importance':
          return b.importance - a.importance;
        case 'name':
          return a.featureName.localeCompare(b.featureName);
        case 'category':
          return a.category.localeCompare(b.category) || b.importance - a.importance;
        default:
          return 0;
      }
    });

    // Limit to maxFeatures
    if (maxFeatures > 0) {
      filtered = filtered.slice(0, maxFeatures);
    }

    // Add processing metadata
    const maxImportance = Math.max(...features.map(f => f.importance));
    
    return filtered.map((feature, index): FeatureData => ({
      ...feature,
      displayName: feature.featureName.length > 20 
        ? feature.featureName.substring(0, 17) + '...' 
        : feature.featureName,
      categoryColor: CATEGORY_COLORS[feature.category as keyof typeof CATEGORY_COLORS] || '#6b7280',
      rank: index + 1,
      percentile: (feature.importance / maxImportance) * 100,
    }));
  }, [featureImportance, modelName, sortBy, filterCategory, searchTerm, maxFeatures]);

  // Calculate category summaries
  const categorySummaries = useMemo(() => {
    if (!modelName) return [];
    
    const features = featureImportance.get(modelName) || [];
    const categoryMap = new Map<string, CategorySummary>();

    features.forEach(feature => {
      const existing = categoryMap.get(feature.category);
      if (existing) {
        existing.totalImportance += feature.importance;
        existing.featureCount += 1;
      } else {
        categoryMap.set(feature.category, {
          category: feature.category,
          totalImportance: feature.importance,
          featureCount: 1,
          averageImportance: feature.importance,
          color: CATEGORY_COLORS[feature.category as keyof typeof CATEGORY_COLORS] || '#6b7280',
        });
      }
    });

    // Calculate averages
    categoryMap.forEach(summary => {
      summary.averageImportance = summary.totalImportance / summary.featureCount;
    });

    return Array.from(categoryMap.values()).sort((a, b) => b.totalImportance - a.totalImportance);
  }, [featureImportance, modelName]);

  // Get available categories
  const availableCategories = useMemo(() => {
    if (!modelName) return [];
    const features = featureImportance.get(modelName) || [];
    return [...new Set(features.map(f => f.category))];
  }, [featureImportance, modelName]);

  const handleFeatureClick = useCallback((feature: FeatureData) => {
    if (!enableDrilldown) return;
    setSelectedFeature(selectedFeature === feature.featureName ? null : feature.featureName);
  }, [enableDrilldown, selectedFeature]);

  const handleExport = useCallback(() => {
    if (!enableExport) return;
    
    const exportData = {
      modelName,
      features: processedFeatures,
      categorySummaries,
      exportedAt: new Date().toISOString(),
    };
    
    const csvContent = [
      'feature_name,importance,category,rank,percentile,description',
      ...processedFeatures.map(f => 
        `"${f.featureName}",${f.importance},${f.category},${f.rank},${f.percentile.toFixed(1)},"${f.description}"`
      )
    ].join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `feature-importance-${modelName}-${Date.now()}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [processedFeatures, categorySummaries, modelName, enableExport]);

  const CustomTooltip = useCallback(({ active, payload, label }: any) => {
    if (!active || !payload || !payload.length) return null;

    const feature = payload[0].payload as FeatureData;
    
    return (
      <div className="bg-trading-bg-secondary border border-trading-neutral-700 rounded-lg p-3 shadow-lg max-w-xs">
        <div className="font-medium text-trading-text-primary mb-2">
          {feature.featureName}
        </div>
        
        <div className="space-y-1 text-xs">
          <div className="flex justify-between">
            <span className="text-trading-text-secondary">Importance:</span>
            <span className="font-medium">{(feature.importance * 100).toFixed(1)}%</span>
          </div>
          
          <div className="flex justify-between">
            <span className="text-trading-text-secondary">Rank:</span>
            <span className="font-medium">#{feature.rank}</span>
          </div>
          
          <div className="flex justify-between">
            <span className="text-trading-text-secondary">Category:</span>
            <span className="font-medium capitalize">{feature.category}</span>
          </div>
          
          {feature.confidence && (
            <div className="flex justify-between">
              <span className="text-trading-text-secondary">Confidence:</span>
              <span className="font-medium">{(feature.confidence * 100).toFixed(1)}%</span>
            </div>
          )}
          
          {feature.description && (
            <div className="pt-2 border-t border-trading-neutral-700">
              <div className="text-trading-text-secondary">{feature.description}</div>
            </div>
          )}
        </div>
      </div>
    );
  }, []);

  const renderBarChart = () => (
    <ResponsiveContainer width="100%" height={400}>
      <BarChart data={processedFeatures} layout="horizontal">
        <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
        <XAxis 
          type="number" 
          stroke="#94a3b8" 
          fontSize={12}
          tickFormatter={(value) => `${(value * 100).toFixed(0)}%`}
        />
        <YAxis 
          type="category" 
          dataKey="displayName" 
          stroke="#94a3b8" 
          fontSize={12}
          width={120}
        />
        <Tooltip content={CustomTooltip} />
        <Bar 
          dataKey="importance" 
          onClick={handleFeatureClick}
          cursor={enableDrilldown ? 'pointer' : 'default'}
        >
          {processedFeatures.map((feature, index) => (
            <Cell
              key={`cell-${index}`}
              fill={selectedFeature === feature.featureName ? '#fbbf24' : feature.categoryColor}
              fillOpacity={selectedFeature === feature.featureName ? 1 : 0.8}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );

  const renderRadarChart = () => {
    const radarData = processedFeatures.slice(0, 8).map(feature => ({
      feature: feature.displayName,
      importance: feature.importance * 100,
      fullFeature: feature,
    }));

    return (
      <ResponsiveContainer width="100%" height={400}>
        <RadarChart data={radarData}>
          <PolarGrid stroke="#334155" />
          <PolarAngleAxis dataKey="feature" tick={{ fontSize: 12, fill: '#94a3b8' }} />
          <PolarRadiusAxis 
            angle={90} 
            domain={[0, 100]} 
            tick={{ fontSize: 10, fill: '#94a3b8' }}
            tickFormatter={(value) => `${value}%`}
          />
          <Radar
            name="Importance"
            dataKey="importance"
            stroke="#3b82f6"
            fill="#3b82f6"
            fillOpacity={0.2}
            strokeWidth={2}
          />
          <Tooltip 
            formatter={(value: number) => [`${value.toFixed(1)}%`, 'Importance']}
          />
        </RadarChart>
      </ResponsiveContainer>
    );
  };

  const renderTreemap = () => {
    const treemapData = processedFeatures.map(feature => ({
      name: feature.featureName,
      size: feature.importance * 1000, // Scale for better visualization
      importance: feature.importance,
      category: feature.category,
      color: feature.categoryColor,
    }));

    return (
      <ResponsiveContainer width="100%" height={400}>
        <Treemap
          data={treemapData}
          dataKey="size"
          stroke="#334155"
          strokeWidth={1}
        >
          {treemapData.map((entry, index) => (
            <Cell key={`cell-${index}`} fill={entry.color} />
          ))}
        </Treemap>
      </ResponsiveContainer>
    );
  };

  if (!modelName || processedFeatures.length === 0) {
    return (
      <div className={cn(
        'flex flex-col items-center justify-center bg-trading-bg-secondary border border-trading-neutral-700 rounded-lg p-8',
        className
      )}>
        <BarChart3 className="w-12 h-12 text-trading-text-secondary mb-4" />
        <h3 className="text-lg font-medium text-trading-text-primary mb-2">No Feature Data</h3>
        <p className="text-sm text-trading-text-secondary text-center">
          {!modelName 
            ? 'Select a model to view feature importance.'
            : 'No feature importance data available for the selected model.'}
        </p>
      </div>
    );
  }

  return (
    <div className={cn('space-y-4', className)}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <BarChart3 className="w-5 h-5 text-trading-accent-blue" />
          <div>
            <h3 className="text-lg font-semibold text-trading-text-primary">
              Feature Importance
            </h3>
            <p className="text-sm text-trading-text-secondary">
              {modelName} • {processedFeatures.length} features
            </p>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          <button
            onClick={() => setCurrentChartType('bar')}
            className={cn(
              "p-2 rounded transition-colors",
              currentChartType === 'bar' ? "bg-trading-accent-blue text-white" : "text-trading-text-secondary hover:text-trading-text-primary"
            )}
            title="Bar Chart"
          >
            <BarChart3 className="w-4 h-4" />
          </button>
          
          <button
            onClick={() => setCurrentChartType('radar')}
            className={cn(
              "p-2 rounded transition-colors",
              currentChartType === 'radar' ? "bg-trading-accent-blue text-white" : "text-trading-text-secondary hover:text-trading-text-primary"
            )}
            title="Radar Chart"
          >
            <Target className="w-4 h-4" />
          </button>
          
          <button
            onClick={() => setCurrentChartType('treemap')}
            className={cn(
              "p-2 rounded transition-colors",
              currentChartType === 'treemap' ? "bg-trading-accent-blue text-white" : "text-trading-text-secondary hover:text-trading-text-primary"
            )}
            title="Treemap"
          >
            <Grid className="w-4 h-4" />
          </button>
          
          <button
            onClick={() => setShowSettings(!showSettings)}
            className={cn(
              "p-2 rounded transition-colors",
              showSettings ? "bg-trading-accent-blue text-white" : "text-trading-text-secondary hover:text-trading-text-primary"
            )}
            title="Settings"
          >
            <Settings className="w-4 h-4" />
          </button>
          
          {enableExport && (
            <button
              onClick={handleExport}
              className="p-2 text-trading-text-secondary hover:text-trading-text-primary transition-colors"
              title="Export Data"
            >
              <Download className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Settings Panel */}
      {showSettings && (
        <div className="bg-trading-bg-secondary border border-trading-neutral-700 rounded-lg p-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Search */}
            <div>
              <label className="block text-sm font-medium text-trading-text-secondary mb-2">
                Search Features
              </label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-trading-text-secondary" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Search features..."
                  className="w-full pl-10 pr-3 py-2 bg-trading-bg-primary border border-trading-neutral-700 rounded text-sm"
                />
              </div>
            </div>
            
            {/* Category Filter */}
            <div>
              <label className="block text-sm font-medium text-trading-text-secondary mb-2">
                Category
              </label>
              <select
                value={filterCategory}
                onChange={(e) => setFilterCategory(e.target.value)}
                className="w-full px-3 py-2 bg-trading-bg-primary border border-trading-neutral-700 rounded text-sm"
              >
                <option value="all">All Categories</option>
                {availableCategories.map(category => (
                  <option key={category} value={category}>
                    {category.charAt(0).toUpperCase() + category.slice(1)}
                  </option>
                ))}
              </select>
            </div>
            
            {/* Sort By */}
            <div>
              <label className="block text-sm font-medium text-trading-text-secondary mb-2">
                Sort By
              </label>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                className="w-full px-3 py-2 bg-trading-bg-primary border border-trading-neutral-700 rounded text-sm"
              >
                <option value="importance">Importance</option>
                <option value="name">Name</option>
                <option value="category">Category</option>
              </select>
            </div>
          </div>
        </div>
      )}

      {/* Category Summary */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {categorySummaries.map(summary => (
          <div
            key={summary.category}
            className="bg-trading-bg-secondary border border-trading-neutral-700 rounded-lg p-4"
          >
            <div className="flex items-center gap-2 mb-2">
              {CATEGORY_ICONS[summary.category as keyof typeof CATEGORY_ICONS]}
              <span className="text-sm font-medium text-trading-text-primary capitalize">
                {summary.category}
              </span>
            </div>
            
            <div className="space-y-1">
              <div className="text-2xl font-bold" style={{ color: summary.color }}>
                {(summary.averageImportance * 100).toFixed(1)}%
              </div>
              <div className="text-xs text-trading-text-secondary">
                {summary.featureCount} features • Avg importance
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Chart */}
      <div className="bg-trading-bg-secondary border border-trading-neutral-700 rounded-lg p-4">
        {currentChartType === 'bar' && renderBarChart()}
        {currentChartType === 'radar' && renderRadarChart()}
        {currentChartType === 'treemap' && renderTreemap()}
      </div>

      {/* Feature Details */}
      {selectedFeature && enableDrilldown && (
        <div className="bg-trading-bg-secondary border border-trading-neutral-700 rounded-lg p-4">
          <h4 className="text-lg font-semibold text-trading-text-primary mb-4">Feature Details</h4>
          
          {(() => {
            const feature = processedFeatures.find(f => f.featureName === selectedFeature);
            if (!feature) return null;
            
            return (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-3">
                  <div>
                    <span className="text-sm text-trading-text-secondary">Feature Name:</span>
                    <div className="font-medium">{feature.featureName}</div>
                  </div>
                  
                  <div>
                    <span className="text-sm text-trading-text-secondary">Importance:</span>
                    <div className="font-medium">{(feature.importance * 100).toFixed(2)}%</div>
                  </div>
                  
                  <div>
                    <span className="text-sm text-trading-text-secondary">Category:</span>
                    <div className="font-medium capitalize">{feature.category}</div>
                  </div>
                  
                  <div>
                    <span className="text-sm text-trading-text-secondary">Description:</span>
                    <div className="text-sm">{feature.description}</div>
                  </div>
                </div>
                
                <div className="space-y-3">
                  {feature.correlationWithPrice && (
                    <div>
                      <span className="text-sm text-trading-text-secondary">Price Correlation:</span>
                      <div className="font-medium">{feature.correlationWithPrice.toFixed(3)}</div>
                    </div>
                  )}
                  
                  {feature.pValue && (
                    <div>
                      <span className="text-sm text-trading-text-secondary">P-Value:</span>
                      <div className="font-medium">{feature.pValue.toFixed(4)}</div>
                    </div>
                  )}
                  
                  <div>
                    <span className="text-sm text-trading-text-secondary">Data Type:</span>
                    <div className="font-medium capitalize">{feature.dataType}</div>
                  </div>
                  
                  <div>
                    <span className="text-sm text-trading-text-secondary">Source:</span>
                    <div className="font-medium">{feature.source}</div>
                  </div>
                </div>
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
}