/**
 * SMS Service for Notification System
 * 
 * Multi-provider SMS delivery with Twilio integration, message templating,
 * delivery tracking, and international number support.
 */

import { Twilio } from 'twilio';
import { config } from '../config';
import { 
  SMSNotification, 
  NotificationStatus, 
  NotificationChannelProvider 
} from '../types';
import { channelLogger, performanceLogger, logError, createTimer } from '../utils/logger';

interface SMSProvider {
  send(notification: SMSNotification): Promise<{ messageId: string; status: NotificationStatus }>;
  getDeliveryStatus(messageId: string): Promise<NotificationStatus>;
  validatePhoneNumber(phoneNumber: string): boolean;
  formatPhoneNumber(phoneNumber: string): string;
}

class TwilioSMSProvider implements SMSProvider {
  private client: Twilio;
  private fromNumber: string;

  constructor() {
    if (!config.SMS.TWILIO_ACCOUNT_SID || !config.SMS.TWILIO_AUTH_TOKEN) {
      throw new Error('Twilio credentials not configured');
    }

    this.client = new Twilio(
      config.SMS.TWILIO_ACCOUNT_SID,
      config.SMS.TWILIO_AUTH_TOKEN
    );
    
    this.fromNumber = config.SMS.TWILIO_FROM_NUMBER || '';
    
    if (!this.fromNumber) {
      throw new Error('Twilio from number not configured');
    }
  }

  async send(notification: SMSNotification): Promise<{ messageId: string; status: NotificationStatus }> {
    const timer = createTimer('sms_send_twilio', {
      notificationId: notification.id,
      recipient: notification.recipient.phone
    });

    try {
      channelLogger.sms('send_start', notification.id, notification.recipient.phone, {
        bodyLength: notification.body.length,
        mediaCount: notification.mediaUrls?.length || 0
      });

      const messageOptions: any = {
        body: notification.body,
        from: this.fromNumber,
        to: this.formatPhoneNumber(notification.recipient.phone),
        validityPeriod: 3600, // 1 hour
        statusCallback: `${config.EXTERNAL_SERVICES.API_GATEWAY_URL}/notifications/webhooks/sms/status`,
        provideFeedback: true
      };

      // Add media URLs if present
      if (notification.mediaUrls && notification.mediaUrls.length > 0) {
        messageOptions.mediaUrl = notification.mediaUrls;
      }

      // Add custom headers for tracking
      messageOptions.forceDelivery = false;
      messageOptions.smartEncoded = true;

      const message = await this.client.messages.create(messageOptions);

      const duration = timer.end({
        success: true,
        messageId: message.sid,
        status: message.status
      });

      channelLogger.sms('send_success', notification.id, notification.recipient.phone, {
        messageId: message.sid,
        status: message.status,
        price: message.price,
        priceUnit: message.priceUnit,
        duration
      });

      // Map Twilio status to our status
      const notificationStatus = this.mapTwilioStatus(message.status);

      return {
        messageId: message.sid,
        status: notificationStatus
      };

    } catch (error: any) {
      const duration = timer.end({
        success: false,
        error: error.message,
        errorCode: error.code
      });

      channelLogger.sms('send_error', notification.id, notification.recipient.phone, {
        error: error.message,
        errorCode: error.code,
        moreInfo: error.moreInfo,
        duration
      });

      logError(error, {
        operation: 'twilio_sms_send',
        notificationId: notification.id,
        recipient: notification.recipient.phone,
        errorCode: error.code
      });

      // Determine status based on error code
      let status = NotificationStatus.FAILED;
      
      if (error.code === 21211 || // Invalid phone number
          error.code === 21614 || // Phone number not verified
          error.code === 21408) { // Permission denied
        status = NotificationStatus.BOUNCED;
      }

      return {
        messageId: '',
        status
      };
    }
  }

  async getDeliveryStatus(messageId: string): Promise<NotificationStatus> {
    const timer = createTimer('sms_status_check_twilio', { messageId });

    try {
      const message = await this.client.messages(messageId).fetch();
      
      timer.end({ success: true, status: message.status });
      
      return this.mapTwilioStatus(message.status);

    } catch (error) {
      timer.end({ success: false, error: (error as Error).message });
      
      logError(error as Error, {
        operation: 'twilio_status_check',
        messageId
      });
      
      return NotificationStatus.FAILED;
    }
  }

  validatePhoneNumber(phoneNumber: string): boolean {
    if (!phoneNumber || typeof phoneNumber !== 'string') {
      return false;
    }

    // Remove all non-digit characters
    const digits = phoneNumber.replace(/\D/g, '');
    
    // Check if it's a valid international format
    // Must be between 7 and 15 digits (E.164 standard)
    if (digits.length < 7 || digits.length > 15) {
      return false;
    }

    // Basic format validation
    const phoneRegex = /^\+?[1-9]\d{6,14}$/;
    const formattedNumber = this.formatPhoneNumber(phoneNumber);
    
    return phoneRegex.test(formattedNumber);
  }

  formatPhoneNumber(phoneNumber: string): string {
    if (!phoneNumber) return '';

    // Remove all non-digit characters
    let digits = phoneNumber.replace(/\D/g, '');
    
    // Add country code if not present
    if (!phoneNumber.startsWith('+')) {
      if (digits.length === 10) {
        // Assume US number if 10 digits
        digits = '1' + digits;
      }
      return '+' + digits;
    }
    
    return phoneNumber.replace(/\D/g, '').replace(/^/, '+');
  }

  private mapTwilioStatus(twilioStatus: string): NotificationStatus {
    switch (twilioStatus) {
      case 'queued':
      case 'accepted':
        return NotificationStatus.QUEUED;
      case 'sending':
        return NotificationStatus.PROCESSING;
      case 'sent':
        return NotificationStatus.SENT;
      case 'delivered':
        return NotificationStatus.DELIVERED;
      case 'failed':
      case 'undelivered':
        return NotificationStatus.FAILED;
      default:
        return NotificationStatus.PENDING;
    }
  }
}

// AWS SNS Provider (placeholder for future implementation)
class AWSSNSProvider implements SMSProvider {
  async send(notification: SMSNotification): Promise<{ messageId: string; status: NotificationStatus }> {
    throw new Error('AWS SNS provider not implemented yet');
  }

  async getDeliveryStatus(messageId: string): Promise<NotificationStatus> {
    throw new Error('AWS SNS provider not implemented yet');
  }

  validatePhoneNumber(phoneNumber: string): boolean {
    // Basic validation
    return /^\+?[1-9]\d{6,14}$/.test(phoneNumber.replace(/\D/g, ''));
  }

  formatPhoneNumber(phoneNumber: string): string {
    return phoneNumber.replace(/\D/g, '').replace(/^/, '+');
  }
}

export class SMSService implements NotificationChannelProvider {
  private provider: SMSProvider;
  private retryDelays = [2000, 10000, 30000, 60000, 300000]; // Progressive delays

  constructor() {
    switch (config.SMS.PROVIDER) {
      case 'twilio':
        this.provider = new TwilioSMSProvider();
        break;
      case 'aws-sns':
        this.provider = new AWSSNSProvider();
        break;
      default:
        throw new Error(`Unsupported SMS provider: ${config.SMS.PROVIDER}`);
    }
  }

  async initialize(): Promise<void> {
    // Test provider connection
    if (config.SMS.PROVIDER === 'twilio') {
      try {
        // Test with a validation call
        const twilioClient = (this.provider as TwilioSMSProvider)['client'];
        await twilioClient.api.accounts.list({ limit: 1 });
        channelLogger.sms('service_initialized', '', '', { provider: config.SMS.PROVIDER });
      } catch (error) {
        logError(error as Error, { operation: 'sms_service_init', provider: config.SMS.PROVIDER });
        throw new Error('Failed to initialize SMS service');
      }
    }
  }

  async send(notification: SMSNotification): Promise<void> {
    if (!config.SMS.ENABLED) {
      channelLogger.sms('service_disabled', notification.id, notification.recipient.phone);
      throw new Error('SMS service is disabled');
    }

    // Validate phone number
    if (!this.validate(notification.recipient)) {
      channelLogger.sms('invalid_recipient', notification.id, notification.recipient.phone);
      throw new Error('Invalid phone number format');
    }

    // Check message length limits
    if (notification.body.length > 1600) { // SMS limit for concatenated messages
      channelLogger.sms('message_too_long', notification.id, notification.recipient.phone, {
        messageLength: notification.body.length,
        limit: 1600
      });
      throw new Error('SMS message too long');
    }

    const maxAttempts = config.SMS.RETRY_ATTEMPTS;
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const result = await this.provider.send(notification);
        
        channelLogger.sms('send_completed', notification.id, notification.recipient.phone, {
          messageId: result.messageId,
          status: result.status,
          attempt,
          messageLength: notification.body.length
        });

        return;

      } catch (error) {
        lastError = error as Error;
        
        channelLogger.sms('send_attempt_failed', notification.id, notification.recipient.phone, {
          attempt,
          maxAttempts,
          error: lastError.message
        });

        // Don't retry for certain error types
        if (this.isNonRetryableError(lastError)) {
          break;
        }

        // Wait before retry (except on last attempt)
        if (attempt < maxAttempts) {
          const delay = this.retryDelays[Math.min(attempt - 1, this.retryDelays.length - 1)];
          await this.sleep(delay);
        }
      }
    }

    // All attempts failed
    channelLogger.sms('send_failed_final', notification.id, notification.recipient.phone, {
      attempts: maxAttempts,
      error: lastError?.message
    });

    throw lastError || new Error('SMS sending failed after all retry attempts');
  }

  validate(recipient: any): boolean {
    if (!recipient || typeof recipient !== 'object') {
      return false;
    }

    const { phone } = recipient;
    if (!phone || typeof phone !== 'string') {
      return false;
    }

    return this.provider.validatePhoneNumber(phone);
  }

  async getDeliveryStatus(messageId: string): Promise<NotificationStatus> {
    try {
      return await this.provider.getDeliveryStatus(messageId);
    } catch (error) {
      logError(error as Error, {
        operation: 'sms_delivery_status',
        messageId
      });
      return NotificationStatus.FAILED;
    }
  }

  /**
   * Process SMS webhook for delivery status updates
   */
  async processWebhook(webhookData: any): Promise<void> {
    try {
      const { MessageSid, MessageStatus, ErrorCode, ErrorMessage } = webhookData;
      
      if (!MessageSid) {
        throw new Error('Missing MessageSid in webhook data');
      }

      const status = this.mapWebhookStatus(MessageStatus);
      
      channelLogger.sms('webhook_received', '', '', {
        messageId: MessageSid,
        status: MessageStatus,
        mappedStatus: status,
        errorCode: ErrorCode,
        errorMessage: ErrorMessage
      });

      // Here you would update the notification status in the database
      // and potentially trigger additional processing

    } catch (error) {
      logError(error as Error, {
        operation: 'sms_webhook_processing',
        webhookData
      });
    }
  }

  private mapWebhookStatus(webhookStatus: string): NotificationStatus {
    switch (webhookStatus?.toLowerCase()) {
      case 'queued':
      case 'accepted':
        return NotificationStatus.QUEUED;
      case 'sending':
        return NotificationStatus.PROCESSING;
      case 'sent':
        return NotificationStatus.SENT;
      case 'delivered':
        return NotificationStatus.DELIVERED;
      case 'failed':
      case 'undelivered':
        return NotificationStatus.FAILED;
      default:
        return NotificationStatus.PENDING;
    }
  }

  private isNonRetryableError(error: Error): boolean {
    const errorMessage = error.message.toLowerCase();
    
    // Don't retry for authentication, invalid numbers, or quota issues
    return errorMessage.includes('authenticate') ||
           errorMessage.includes('invalid phone number') ||
           errorMessage.includes('phone number not verified') ||
           errorMessage.includes('permission denied') ||
           errorMessage.includes('quota exceeded') ||
           errorMessage.includes('blocked') ||
           errorMessage.includes('opted out');
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async healthCheck(): Promise<boolean> {
    try {
      // For Twilio, we can test the connection
      if (config.SMS.PROVIDER === 'twilio') {
        const twilioClient = (this.provider as TwilioSMSProvider)['client'];
        await twilioClient.api.accounts.list({ limit: 1 });
        return true;
      }
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get SMS service metrics
   */
  get metrics() {
    return {
      provider: config.SMS.PROVIDER,
      enabled: config.SMS.ENABLED,
      rateLimit: config.SMS.RATE_LIMIT,
      fromNumber: config.SMS.TWILIO_FROM_NUMBER ? 
        config.SMS.TWILIO_FROM_NUMBER.replace(/\d(?=\d{4})/g, '*') : // Mask number
        'not_configured'
    };
  }

  /**
   * Format phone number for display (masked)
   */
  static formatPhoneForDisplay(phoneNumber: string): string {
    if (!phoneNumber) return '';
    
    const cleaned = phoneNumber.replace(/\D/g, '');
    if (cleaned.length >= 10) {
      const masked = cleaned.replace(/\d(?=\d{4})/g, '*');
      return `+${masked}`;
    }
    
    return phoneNumber;
  }

  /**
   * Estimate SMS segments (for billing and limits)
   */
  static estimateSMSSegments(message: string): number {
    const length = message.length;
    
    // GSM 7-bit encoding
    if (/^[A-Za-z0-9@£$¥èéùìòÇØøÅåæÑÜüäöß !"#%&()*+,-./:;<=>?_{}~]*$/.test(message)) {
      if (length <= 160) return 1;
      return Math.ceil(length / 153); // 153 chars per segment for concatenated SMS
    }
    
    // Unicode (UCS-2) encoding
    if (length <= 70) return 1;
    return Math.ceil(length / 67); // 67 chars per segment for concatenated Unicode SMS
  }
}

export const smsService = new SMSService();