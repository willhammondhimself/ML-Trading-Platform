/**
 * Type Definitions for Notification Service
 * 
 * Complete type system for notification management, channels,
 * templates, user preferences, and delivery tracking.
 */

// Base Types
export interface User {
  id: string;
  email: string;
  phone?: string;
  firstName: string;
  lastName: string;
  timezone: string;
  tier: UserTier;
  preferences: NotificationPreferences;
  createdAt: Date;
  updatedAt: Date;
}

export enum UserTier {
  FREE = 'FREE',
  BASIC = 'BASIC',
  PREMIUM = 'PREMIUM',
  ENTERPRISE = 'ENTERPRISE'
}

// Notification Types
export enum NotificationChannel {
  EMAIL = 'email',
  SMS = 'sms',
  PUSH = 'push',
  WEB = 'web',
  SLACK = 'slack',
  WEBHOOK = 'webhook'
}

export enum NotificationPriority {
  LOW = 'low',
  NORMAL = 'normal',
  HIGH = 'high',
  URGENT = 'urgent',
  CRITICAL = 'critical'
}

export enum NotificationType {
  TRADE_EXECUTED = 'trade_executed',
  TRADE_FAILED = 'trade_failed',
  ORDER_FILLED = 'order_filled',
  ORDER_CANCELLED = 'order_cancelled',
  RISK_ALERT = 'risk_alert',
  MARGIN_CALL = 'margin_call',
  MARKET_ALERT = 'market_alert',
  PRICE_ALERT = 'price_alert',
  ML_PREDICTION = 'ml_prediction',
  SYSTEM_MAINTENANCE = 'system_maintenance',
  ACCOUNT_SECURITY = 'account_security',
  PORTFOLIO_SUMMARY = 'portfolio_summary',
  PERFORMANCE_REPORT = 'performance_report',
  WELCOME = 'welcome',
  PASSWORD_RESET = 'password_reset',
  EMAIL_VERIFICATION = 'email_verification',
  TWO_FACTOR_AUTH = 'two_factor_auth'
}

export enum NotificationStatus {
  PENDING = 'pending',
  QUEUED = 'queued',
  PROCESSING = 'processing',
  SENT = 'sent',
  DELIVERED = 'delivered',
  FAILED = 'failed',
  BOUNCED = 'bounced',
  OPENED = 'opened',
  CLICKED = 'clicked',
  UNSUBSCRIBED = 'unsubscribed'
}

// Core Notification Interface
export interface Notification {
  id: string;
  userId: string;
  type: NotificationType;
  channel: NotificationChannel;
  priority: NotificationPriority;
  status: NotificationStatus;
  
  // Content
  title: string;
  message: string;
  data?: Record<string, any>;
  template?: string;
  templateData?: Record<string, any>;
  
  // Metadata
  source?: string;
  correlationId?: string;
  parentId?: string;
  tags?: string[];
  
  // Scheduling
  scheduledAt?: Date;
  expiresAt?: Date;
  
  // Delivery tracking
  sentAt?: Date;
  deliveredAt?: Date;
  failedAt?: Date;
  error?: string;
  attempts: number;
  maxAttempts: number;
  
  // Timestamps
  createdAt: Date;
  updatedAt: Date;
}

// Notification Preferences
export interface NotificationPreferences {
  id: string;
  userId: string;
  
  // Channel preferences
  emailEnabled: boolean;
  smsEnabled: boolean;
  pushEnabled: boolean;
  webEnabled: boolean;
  
  // Type-specific preferences
  tradeAlerts: ChannelPreferences;
  riskAlerts: ChannelPreferences;
  marketAlerts: ChannelPreferences;
  systemAlerts: ChannelPreferences;
  accountAlerts: ChannelPreferences;
  
  // Digest preferences
  digestEnabled: boolean;
  digestFrequency: DigestFrequency;
  digestTime: string; // HH:mm format
  digestDays?: string[]; // For weekly digest
  
  // Quiet hours
  quietHoursEnabled: boolean;
  quietHoursStart?: string; // HH:mm format
  quietHoursEnd?: string; // HH:mm format
  quietHoursTimezone: string;
  
  createdAt: Date;
  updatedAt: Date;
}

export interface ChannelPreferences {
  email: boolean;
  sms: boolean;
  push: boolean;
  web: boolean;
}

export enum DigestFrequency {
  DAILY = 'daily',
  WEEKLY = 'weekly',
  MONTHLY = 'monthly'
}

// Templates
export interface NotificationTemplate {
  id: string;
  type: NotificationType;
  channel: NotificationChannel;
  name: string;
  description?: string;
  
  // Template content
  subject?: string; // For email/SMS
  title: string;
  body: string;
  html?: string; // For email
  
  // Template variables
  variables: TemplateVariable[];
  
  // Metadata
  version: string;
  isActive: boolean;
  tags?: string[];
  
  createdAt: Date;
  updatedAt: Date;
}

export interface TemplateVariable {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'date' | 'object';
  required: boolean;
  defaultValue?: any;
  description?: string;
}

// Queue and Processing
export interface NotificationJob {
  id: string;
  notificationId: string;
  userId: string;
  type: NotificationType;
  channel: NotificationChannel;
  priority: NotificationPriority;
  
  // Job data
  data: {
    recipient: NotificationRecipient;
    content: NotificationContent;
    metadata: Record<string, any>;
  };
  
  // Processing info
  attempts: number;
  maxAttempts: number;
  delay?: number;
  scheduledAt?: Date;
  processedAt?: Date;
  
  createdAt: Date;
}

export interface NotificationRecipient {
  userId: string;
  email?: string;
  phone?: string;
  pushToken?: string;
  webhookUrl?: string;
  preferences: NotificationPreferences;
}

export interface NotificationContent {
  title: string;
  message: string;
  subject?: string;
  html?: string;
  data?: Record<string, any>;
  attachments?: NotificationAttachment[];
  actions?: NotificationAction[];
}

export interface NotificationAttachment {
  filename: string;
  contentType: string;
  content: Buffer | string;
  size: number;
}

export interface NotificationAction {
  id: string;
  label: string;
  url: string;
  type: 'button' | 'link';
  style?: 'primary' | 'secondary' | 'danger';
}

// Delivery Tracking
export interface DeliveryLog {
  id: string;
  notificationId: string;
  userId: string;
  channel: NotificationChannel;
  status: NotificationStatus;
  
  // Provider info
  provider: string;
  providerId?: string;
  providerStatus?: string;
  
  // Delivery details
  sentAt?: Date;
  deliveredAt?: Date;
  openedAt?: Date;
  clickedAt?: Date;
  
  // Error details
  error?: string;
  errorCode?: string;
  errorDetails?: Record<string, any>;
  
  // Metadata
  ipAddress?: string;
  userAgent?: string;
  device?: string;
  location?: string;
  
  createdAt: Date;
}

// Analytics and Metrics
export interface NotificationMetrics {
  id: string;
  date: Date;
  
  // Volume metrics
  totalNotifications: number;
  sentNotifications: number;
  deliveredNotifications: number;
  failedNotifications: number;
  
  // Channel breakdown
  emailNotifications: number;
  smsNotifications: number;
  pushNotifications: number;
  webNotifications: number;
  
  // Type breakdown
  tradeAlerts: number;
  riskAlerts: number;
  marketAlerts: number;
  systemAlerts: number;
  
  // Performance metrics
  averageDeliveryTime: number;
  deliveryRate: number;
  openRate: number;
  clickRate: number;
  bounceRate: number;
  unsubscribeRate: number;
  
  createdAt: Date;
}

// Event Types
export interface NotificationEvent {
  eventId: string;
  eventType: string;
  source: string;
  userId?: string;
  data: Record<string, any>;
  timestamp: string;
  version: string;
  correlationId?: string;
}

// Email-specific types
export interface EmailNotification extends Notification {
  channel: NotificationChannel.EMAIL;
  recipient: {
    email: string;
    name?: string;
  };
  subject: string;
  html?: string;
  text?: string;
  attachments?: EmailAttachment[];
  headers?: Record<string, string>;
}

export interface EmailAttachment {
  filename: string;
  content: Buffer | string;
  contentType: string;
  encoding?: string;
  cid?: string;
}

// SMS-specific types
export interface SMSNotification extends Notification {
  channel: NotificationChannel.SMS;
  recipient: {
    phone: string;
    name?: string;
  };
  body: string;
  mediaUrls?: string[];
}

// Push notification types
export interface PushNotification extends Notification {
  channel: NotificationChannel.PUSH;
  recipient: {
    userId: string;
    tokens: string[];
  };
  title: string;
  body: string;
  icon?: string;
  badge?: number;
  sound?: string;
  data?: Record<string, any>;
  actions?: PushAction[];
}

export interface PushAction {
  action: string;
  title: string;
  icon?: string;
}

// Webhook types
export interface WebhookNotification extends Notification {
  channel: NotificationChannel.WEBHOOK;
  url: string;
  method: 'POST' | 'PUT' | 'PATCH';
  headers?: Record<string, string>;
  payload: Record<string, any>;
  signature?: string;
}

// API Request/Response types
export interface CreateNotificationRequest {
  userId: string;
  type: NotificationType;
  channels: NotificationChannel[];
  priority?: NotificationPriority;
  title: string;
  message: string;
  data?: Record<string, any>;
  template?: string;
  templateData?: Record<string, any>;
  scheduledAt?: string;
  expiresAt?: string;
  tags?: string[];
}

export interface CreateNotificationResponse {
  success: boolean;
  notificationId: string;
  message: string;
}

export interface UpdatePreferencesRequest {
  emailEnabled?: boolean;
  smsEnabled?: boolean;
  pushEnabled?: boolean;
  webEnabled?: boolean;
  tradeAlerts?: Partial<ChannelPreferences>;
  riskAlerts?: Partial<ChannelPreferences>;
  marketAlerts?: Partial<ChannelPreferences>;
  systemAlerts?: Partial<ChannelPreferences>;
  accountAlerts?: Partial<ChannelPreferences>;
  digestEnabled?: boolean;
  digestFrequency?: DigestFrequency;
  digestTime?: string;
  digestDays?: string[];
  quietHoursEnabled?: boolean;
  quietHoursStart?: string;
  quietHoursEnd?: string;
  quietHoursTimezone?: string;
}

export interface GetNotificationsQuery {
  userId?: string;
  type?: NotificationType;
  channel?: NotificationChannel;
  status?: NotificationStatus;
  priority?: NotificationPriority;
  startDate?: string;
  endDate?: string;
  limit?: number;
  offset?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface NotificationListResponse {
  notifications: Notification[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

// Error types
export interface NotificationError extends Error {
  code: string;
  statusCode: number;
  details?: Record<string, any>;
}

// Service interfaces
export interface NotificationService {
  create(notification: CreateNotificationRequest): Promise<CreateNotificationResponse>;
  send(notificationId: string): Promise<void>;
  cancel(notificationId: string): Promise<void>;
  retry(notificationId: string): Promise<void>;
  getById(notificationId: string): Promise<Notification | null>;
  getByUserId(userId: string, query?: GetNotificationsQuery): Promise<NotificationListResponse>;
  updateStatus(notificationId: string, status: NotificationStatus, error?: string): Promise<void>;
}

export interface NotificationChannelProvider {
  send(notification: Notification): Promise<void>;
  validate(recipient: any): boolean;
  getDeliveryStatus(providerId: string): Promise<NotificationStatus>;
}

// Database models
export interface NotificationModel {
  id: string;
  user_id: string;
  type: string;
  channel: string;
  priority: string;
  status: string;
  title: string;
  message: string;
  data?: any;
  template?: string;
  template_data?: any;
  source?: string;
  correlation_id?: string;
  parent_id?: string;
  tags?: string[];
  scheduled_at?: Date;
  expires_at?: Date;
  sent_at?: Date;
  delivered_at?: Date;
  failed_at?: Date;
  error?: string;
  attempts: number;
  max_attempts: number;
  created_at: Date;
  updated_at: Date;
}

export interface NotificationPreferencesModel {
  id: string;
  user_id: string;
  email_enabled: boolean;
  sms_enabled: boolean;
  push_enabled: boolean;
  web_enabled: boolean;
  trade_alerts: any;
  risk_alerts: any;
  market_alerts: any;
  system_alerts: any;
  account_alerts: any;
  digest_enabled: boolean;
  digest_frequency: string;
  digest_time: string;
  digest_days?: string[];
  quiet_hours_enabled: boolean;
  quiet_hours_start?: string;
  quiet_hours_end?: string;
  quiet_hours_timezone: string;
  created_at: Date;
  updated_at: Date;
}