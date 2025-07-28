import Decimal from 'decimal.js';

// TradingView Library Types
export interface TradingViewWidget {
  onChartReady(callback: () => void): void;
  headerReady(): Promise<void>;
  chart(index?: number): IChartingLibraryWidget;
  activeChart(): IChartingLibraryWidget;
  remove(): void;
  load(state: any): void;
  save(callback: (state: any) => void): void;
  setSymbol(symbol: string, interval: string, callback?: () => void): void;
  subscribe(event: string, callback: (...args: any[]) => void): void;
  unsubscribe(event: string, callback: (...args: any[]) => void): void;
}

export interface IChartingLibraryWidget {
  onDataLoaded(): Promise<void>;
  exportData(options?: any): Promise<string>;
  selection(): ISelectionApi;
  createStudy(name: string, forceOverlay?: boolean, lock?: boolean, inputs?: any[], callback?: (studyId: string) => void): string;
  getStudyById(studyId: string): IStudyApi | null;
  createShape(point: any, options: any): string;
  createMultipointShape(points: any[], options: any): string;
  removeEntity(entityId: string): void;
  setVisibleRange(range: any, callback?: () => void): void;
  getVisibleRange(): any;
  symbol(): string;
  symbolExt(): any;
  resolution(): string;
  setSymbol(symbol: string, callback?: () => void): void;
  setResolution(resolution: string, callback?: () => void): void;
  resetData(): void;
  executeActionById(actionId: string): void;
  getStudiesList(): string[];
  dataReady(callback: () => void): void;
}

export interface ISelectionApi {
  isEmpty(): boolean;
  getSelectedSources(): any[];
  clearSelection(): void;
  selectedObjectsCount(): number;
}

export interface IStudyApi {
  isUserEditEnabled(): boolean;
  setUserEditEnabled(enabled: boolean): void;
  getInputsInfo(): any[];
  getInputValues(): any[];
  setInputValues(values: any[]): void;
  mergeUp(): void;
  mergeDown(): void;
  unmergeUp(): void;
  unmergeDown(): void;
}

// Datafeed Interface
export interface IDatafeed {
  onReady(callback: (configuration: any) => void): void;
  searchSymbols(
    userInput: string,
    exchange: string,
    symbolType: string,
    onResultReadyCallback: (symbols: any[]) => void
  ): void;
  resolveSymbol(
    symbolName: string,
    onSymbolResolvedCallback: (symbolInfo: any) => void,
    onResolveErrorCallback: (reason: string) => void
  ): void;
  getBars(
    symbolInfo: any,
    resolution: string,
    periodParams: any,
    onHistoryCallback: (bars: any[], meta?: any) => void,
    onErrorCallback: (reason: string) => void
  ): void;
  subscribeBars(
    symbolInfo: any,
    resolution: string,
    onRealtimeCallback: (bar: any) => void,
    subscriberUID: string,
    onResetCacheNeededCallback?: () => void
  ): void;
  unsubscribeBars(subscriberUID: string): void;
  calculateHistoryDepth?(resolution: string, resolutionBack: string, intervalBack: number): any;
  getMarks?(
    symbolInfo: any,
    startDate: number,
    endDate: number,
    onDataCallback: (marks: any[]) => void,
    resolution: string
  ): void;
  getTimescaleMarks?(
    symbolInfo: any,
    startDate: number,
    endDate: number,
    onDataCallback: (marks: any[]) => void,
    resolution: string
  ): void;
  getServerTime?(callback: (time: number) => void): void;
}

// Chart Configuration
export interface ChartingLibraryWidgetOptions {
  symbol: string;
  datafeed: IDatafeed;
  interval: string;
  container: string | HTMLElement;
  library_path: string;
  locale: string;
  disabled_features?: string[];
  enabled_features?: string[];
  charts_storage_url?: string;
  charts_storage_api_version?: string;
  client_id?: string;
  user_id?: string;
  fullscreen?: boolean;
  autosize?: boolean;
  study_count_limit?: number;
  studies_overrides?: any;
  overrides?: any;
  theme?: 'Light' | 'Dark';
  custom_css_url?: string;
  loading_screen?: { backgroundColor?: string; foregroundColor?: string };
  withdateranges?: boolean;
  hide_side_toolbar?: boolean;
  allow_symbol_change?: boolean;
  save_load_adapter?: any;
  settings_adapter?: any;
  numeric_formatting?: any;
  customFormatters?: any;
  timezone?: string;
  debug?: boolean;
  snapshot_url?: string;
  widgetbar?: any;
  watchlist?: string[];
  hotlist?: boolean;
  calendar?: boolean;
  news?: string[];
  data_status?: string;
  favorites?: any;
  save_image?: boolean;
  studies_access?: any;
  publishing_defaults?: any;
  compare?: boolean;
  symbols_grouping?: any;
  header_widget_buttons_mode?: string;
  time_frames?: any[];
  chart_style?: string;
  rss_news_feed?: string;
  news_provider?: string;
}

// Bar Data Structure
export interface Bar {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

export interface HistoryMetadata {
  noData?: boolean;
  nextTime?: number;
}

// Symbol Information
export interface LibrarySymbolInfo {
  name: string;
  full_name: string;
  description: string;
  type: string;
  session: string;
  timezone: string;
  ticker?: string;
  exchange?: string;
  listed_exchange?: string;
  format: 'price' | 'volume';
  pricescale: number;
  minmov: number;
  fractional?: boolean;
  minmove2?: number;
  currency_code?: string;
  original_currency_code?: string;
  unit_id?: string;
  original_unit_id?: string;
  unit_conversion_types?: string[];
  supported_resolutions: string[];
  intraday_multipliers?: string[];
  has_seconds?: boolean;
  has_ticks?: boolean;
  seconds_multipliers?: string[];
  has_daily?: boolean;
  has_weekly_and_monthly?: boolean;
  has_empty_bars?: boolean;
  force_session_rebuild?: boolean;
  has_no_volume?: boolean;
  volume_precision?: number;
  data_status?: 'streaming' | 'endofday' | 'pulsed' | 'delayed_streaming';
  expired?: boolean;
  expiration_date?: number;
  sector?: string;
  industry?: string;
  currency?: string;
  exchange_traded?: string;
  exchange_listed?: string;
  web_site_url?: string;
  email?: string;
  phone?: string;
  address?: string;
  headquarters?: string;
  employees?: number;
  market_cap?: number;
  shares_outstanding?: number;
  shares_float?: number;
  update_mode?: 'streaming' | 'full_update';
}

// Configuration Object
export interface DatafeedConfiguration {
  supported_resolutions: string[];
  supports_group_request?: boolean;
  supports_marks?: boolean;
  supports_search?: boolean;
  supports_timescale_marks?: boolean;
  symbols_types?: any[];
  currency_codes?: string[];
  units?: any[];
  exchanges?: any[];
}

// Search Result
export interface SearchSymbolResultItem {
  symbol: string;
  full_name: string;
  description: string;
  exchange: string;
  ticker?: string;
  type: string;
}

// Technical Indicators Configuration
export interface TechnicalIndicatorConfig {
  id: string;
  name: string;
  inputs: TechnicalIndicatorInput[];
  plots: TechnicalIndicatorPlot[];
  defaults: TechnicalIndicatorDefaults;
}

export interface TechnicalIndicatorInput {
  id: string;
  name: string;
  type: 'integer' | 'float' | 'bool' | 'string' | 'source';
  defval: any;
  min?: number;
  max?: number;
  options?: string[];
}

export interface TechnicalIndicatorPlot {
  id: string;
  type: 'line' | 'histogram' | 'cross' | 'circles' | 'columns';
  title?: string;
  color?: string;
  linewidth?: number;
  plottype?: 'line' | 'stepline' | 'histogram' | 'cross' | 'circles' | 'columns';
}

export interface TechnicalIndicatorDefaults {
  styles: Record<string, any>;
  inputs: Record<string, any>;
  precision?: number;
  palettes?: Record<string, any>;
}

// ML Prediction Overlay Types
export interface MLPredictionPoint {
  time: number;
  value: number;
  confidence: number;
  type: 'price' | 'trend' | 'volatility' | 'support' | 'resistance';
}

export interface MLPredictionOverlay {
  id: string;
  symbol: string;
  timeframe: string;
  modelName: string;
  predictions: MLPredictionPoint[];
  confidenceBands: {
    upper: number[];
    lower: number[];
  };
  accuracy: number;
  lastUpdate: number;
}

// Chart Theme Configuration
export interface ChartTheme {
  name: string;
  mode: 'light' | 'dark';
  overrides: ChartOverrides;
  studies_overrides: StudiesOverrides;
}

export interface ChartOverrides {
  'mainSeriesProperties.candleStyle.upColor'?: string;
  'mainSeriesProperties.candleStyle.downColor'?: string;
  'mainSeriesProperties.candleStyle.drawWick'?: boolean;
  'mainSeriesProperties.candleStyle.drawBorder'?: boolean;
  'mainSeriesProperties.candleStyle.borderColor'?: string;
  'mainSeriesProperties.candleStyle.borderUpColor'?: string;
  'mainSeriesProperties.candleStyle.borderDownColor'?: string;
  'mainSeriesProperties.candleStyle.wickUpColor'?: string;
  'mainSeriesProperties.candleStyle.wickDownColor'?: string;
  'paneProperties.background'?: string;
  'paneProperties.backgroundType'?: string;
  'paneProperties.backgroundGradientStartColor'?: string;
  'paneProperties.backgroundGradientEndColor'?: string;
  'paneProperties.vertGridProperties.color'?: string;
  'paneProperties.vertGridProperties.style'?: number;
  'paneProperties.horzGridProperties.color'?: string;
  'paneProperties.horzGridProperties.style'?: number;
  'paneProperties.crossHairProperties.color'?: string;
  'paneProperties.crossHairProperties.width'?: number;
  'paneProperties.crossHairProperties.style'?: number;
  'symbolWatermarkProperties.transparency'?: number;
  'symbolWatermarkProperties.color'?: string;
  'scalesProperties.textColor'?: string;
  'scalesProperties.backgroundColor'?: string;
  'scalesProperties.lineColor'?: string;
  [key: string]: any;
}

export interface StudiesOverrides {
  'volume.volume.color.0'?: string;
  'volume.volume.color.1'?: string;
  'volume.volume.transparency'?: number;
  'volume.volume ma.color'?: string;
  'volume.volume ma.transparency'?: number;
  'volume.volume ma.linewidth'?: number;
  'bollinger bands.median.color'?: string;
  'bollinger bands.upper.linewidth'?: number;
  'bollinger bands.lower.linewidth'?: number;
  'bollinger bands.upper.color'?: string;
  'bollinger bands.lower.color'?: string;
  'bollinger bands.fill.transparency'?: number;
  'bollinger bands.fill.color'?: string;
  'MACD.macd.color'?: string;
  'MACD.signal.color'?: string;
  'MACD.histogram.color'?: string;
  'RSI.plot.color'?: string;
  'RSI.hlines.color'?: string;
  'EMA.plot.color'?: string;
  'EMA.plot.linewidth'?: number;
  [key: string]: any;
}

// Drawing Tools Types
export interface DrawingToolOptions {
  shape: string;
  text?: string;
  overrides?: any;
  zOrder?: 'top' | 'bottom';
  lock?: boolean;
  disableSelection?: boolean;
  disableSave?: boolean;
  disableUndo?: boolean;
}

export interface DrawingPoint {
  time: number;
  price: number;
}

export interface AnchoredDrawingPoint {
  x: number; // 0 to 1 (percentage of visible range)
  y: number; // 0 to 1 (percentage of price range)
}

// Mobile Optimization Types
export interface MobileChartControls {
  enableGestures: boolean;
  enableZoom: boolean;
  enablePan: boolean;
  enableCrosshair: boolean;
  showToolbar: boolean;
  compactMode: boolean;
  touchSensitivity: number;
}

// Event Types
export interface ChartReadyEvent {
  chartId: string;
  symbol: string;
  interval: string;
}

export interface SymbolChangedEvent {
  symbol: string;
  interval: string;
}

export interface IntervalChangedEvent {
  interval: string;
  symbol: string;
}

// Integration with Trading Platform Types
export interface TradingViewChartProps {
  symbol: string;
  interval?: string;
  theme?: 'light' | 'dark';
  enableML?: boolean;
  enableDrawingTools?: boolean;
  enableTechnicalIndicators?: boolean;
  mobileOptimized?: boolean;
  height?: number;
  width?: number;
  className?: string;
  onChartReady?: (widget: TradingViewWidget) => void;
  onSymbolChanged?: (event: SymbolChangedEvent) => void;
  onIntervalChanged?: (event: IntervalChangedEvent) => void;
}

// Error Types
export interface TradingViewError {
  code: string;
  message: string;
  details?: any;
  timestamp: number;
  component: 'chart' | 'datafeed' | 'indicator' | 'drawing';
}