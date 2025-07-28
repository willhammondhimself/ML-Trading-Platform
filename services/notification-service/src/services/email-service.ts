/**
 * Email Service for Notification System
 * 
 * SMTP-based email delivery with template rendering, queue management,
 * retry logic, and delivery tracking using Nodemailer.
 */

import nodemailer, { Transporter, SendMailOptions } from 'nodemailer';
import Mail from 'nodemailer/lib/mailer';
import { config } from '../config';
import { 
  EmailNotification, 
  NotificationStatus, 
  EmailAttachment,
  NotificationChannelProvider 
} from '../types';
import { channelLogger, performanceLogger, logError, createTimer } from '../utils/logger';
import handlebars from 'handlebars';
import fs from 'fs/promises';
import path from 'path';

interface EmailProvider {
  send(notification: EmailNotification): Promise<{ messageId: string; status: NotificationStatus }>;
  verifyConnection(): Promise<boolean>;
}

class SMTPEmailProvider implements EmailProvider {
  private transporter: Transporter;
  private isConnected = false;
  private templates = new Map<string, HandlebarsTemplateDelegate>();

  constructor() {
    this.transporter = nodemailer.createTransporter({
      host: config.EMAIL.SMTP_HOST,
      port: config.EMAIL.SMTP_PORT,
      secure: config.EMAIL.SMTP_SECURE,
      auth: {
        user: config.EMAIL.SMTP_USER,
        pass: config.EMAIL.SMTP_PASSWORD
      },
      pool: true,
      maxConnections: config.EMAIL.MAX_CONNECTIONS,
      rateLimit: config.EMAIL.RATE_LIMIT,
      rateDelta: 1000, // per second
      connectionTimeout: 10000,
      greetingTimeout: 5000,
      socketTimeout: 10000
    });

    this.setupEventHandlers();
    this.loadTemplates();
  }

  private setupEventHandlers(): void {
    this.transporter.on('verify', (success) => {
      this.isConnected = success;
      channelLogger.email('connection_verified', '', '', { success });
    });

    this.transporter.on('error', (error) => {
      this.isConnected = false;
      logError(error, { component: 'smtp_transporter' });
    });

    this.transporter.on('idle', () => {
      channelLogger.email('transporter_idle', '', '');
    });
  }

  private async loadTemplates(): Promise<void> {
    try {
      const templatesDir = path.resolve(__dirname, '../templates/email');
      const templateFiles = await fs.readdir(templatesDir);
      
      for (const file of templateFiles) {
        if (file.endsWith('.hbs') || file.endsWith('.handlebars')) {
          const templateName = path.basename(file, path.extname(file));
          const templatePath = path.join(templatesDir, file);
          const templateContent = await fs.readFile(templatePath, 'utf-8');
          
          this.templates.set(templateName, handlebars.compile(templateContent));
          channelLogger.email('template_loaded', '', '', { templateName });
        }
      }
    } catch (error) {
      logError(error as Error, { operation: 'load_email_templates' });
    }
  }

  async verifyConnection(): Promise<boolean> {
    const timer = createTimer('email_connection_verify');
    
    try {
      await this.transporter.verify();
      this.isConnected = true;
      timer.end({ success: true });
      return true;
    } catch (error) {
      this.isConnected = false;
      timer.end({ success: false, error: (error as Error).message });
      logError(error as Error, { operation: 'smtp_verify_connection' });
      return false;
    }
  }

  async send(notification: EmailNotification): Promise<{ messageId: string; status: NotificationStatus }> {
    const timer = createTimer('email_send', { 
      notificationId: notification.id,
      recipient: notification.recipient.email 
    });

    try {
      channelLogger.email('send_start', notification.id, notification.recipient.email, {
        subject: notification.subject,
        template: notification.template
      });

      // Render content if template is specified
      let htmlContent = notification.html;
      let textContent = notification.message;

      if (notification.template && notification.templateData) {
        const renderedContent = await this.renderTemplate(
          notification.template,
          notification.templateData
        );
        htmlContent = renderedContent.html;
        textContent = renderedContent.text;
      }

      // Prepare mail options
      const mailOptions: SendMailOptions = {
        from: {
          name: config.EMAIL.FROM_NAME,
          address: config.EMAIL.FROM_ADDRESS
        },
        to: {
          name: notification.recipient.name,
          address: notification.recipient.email
        },
        subject: notification.subject,
        text: textContent,
        html: htmlContent,
        messageId: `${notification.id}@${config.EMAIL.FROM_ADDRESS.split('@')[1]}`,
        headers: {
          'X-Notification-ID': notification.id,
          'X-Notification-Type': notification.type,
          'X-User-ID': notification.userId,
          ...(notification.headers || {})
        }
      };

      // Add attachments if present
      if (notification.attachments && notification.attachments.length > 0) {
        mailOptions.attachments = this.processAttachments(notification.attachments);
      }

      // Send email
      const result = await this.transporter.sendMail(mailOptions);
      
      const duration = timer.end({ 
        success: true, 
        messageId: result.messageId 
      });

      channelLogger.email('send_success', notification.id, notification.recipient.email, {
        messageId: result.messageId,
        duration,
        response: result.response
      });

      return {
        messageId: result.messageId,
        status: NotificationStatus.SENT
      };

    } catch (error) {
      const duration = timer.end({ 
        success: false, 
        error: (error as Error).message 
      });

      channelLogger.email('send_error', notification.id, notification.recipient.email, {
        error: (error as Error).message,
        duration
      });

      logError(error as Error, {
        operation: 'email_send',
        notificationId: notification.id,
        recipient: notification.recipient.email
      });

      // Determine status based on error type
      const errorMessage = (error as Error).message.toLowerCase();
      let status = NotificationStatus.FAILED;

      if (errorMessage.includes('invalid recipient') || 
          errorMessage.includes('mailbox does not exist') ||
          errorMessage.includes('user unknown')) {
        status = NotificationStatus.BOUNCED;
      }

      return {
        messageId: '',
        status
      };
    }
  }

  private async renderTemplate(templateName: string, data: Record<string, any>): Promise<{ html: string; text: string }> {
    const timer = createTimer('email_template_render', { templateName });

    try {
      const template = this.templates.get(templateName);
      if (!template) {
        throw new Error(`Template '${templateName}' not found`);
      }

      // Add common template helpers
      const templateData = {
        ...data,
        timestamp: new Date().toISOString(),
        year: new Date().getFullYear(),
        platformName: 'ML Trading Platform',
        supportEmail: 'support@mltrading.com',
        unsubscribeUrl: `${config.EXTERNAL_SERVICES.API_GATEWAY_URL}/notifications/unsubscribe?userId=${data.userId}&token=${data.unsubscribeToken}`,
        preferencesUrl: `${config.EXTERNAL_SERVICES.API_GATEWAY_URL}/notifications/preferences?userId=${data.userId}&token=${data.preferencesToken}`
      };

      const htmlContent = template(templateData);
      
      // Generate text version from HTML (basic conversion)
      const textContent = this.htmlToText(htmlContent);

      timer.end({ success: true });

      return {
        html: htmlContent,
        text: textContent
      };

    } catch (error) {
      timer.end({ success: false, error: (error as Error).message });
      logError(error as Error, { 
        operation: 'email_template_render',
        templateName,
        dataKeys: Object.keys(data)
      });
      throw error;
    }
  }

  private processAttachments(attachments: EmailAttachment[]): Mail.Attachment[] {
    return attachments.map(attachment => ({
      filename: attachment.filename,
      content: attachment.content,
      contentType: attachment.contentType,
      encoding: attachment.encoding || 'base64',
      cid: attachment.cid
    }));
  }

  private htmlToText(html: string): string {
    return html
      .replace(/<[^>]*>/g, '') // Remove HTML tags
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\s+/g, ' ')
      .trim();
  }

  get connected(): boolean {
    return this.isConnected;
  }
}

export class EmailService implements NotificationChannelProvider {
  private provider: EmailProvider;
  private retryDelays = [1000, 5000, 15000, 30000, 60000]; // Progressive delays

  constructor() {
    this.provider = new SMTPEmailProvider();
  }

  async initialize(): Promise<void> {
    const isConnected = await this.provider.verifyConnection();
    if (!isConnected) {
      throw new Error('Failed to connect to SMTP server');
    }
    channelLogger.email('service_initialized', '', '');
  }

  async send(notification: EmailNotification): Promise<void> {
    if (!config.EMAIL.ENABLED) {
      channelLogger.email('service_disabled', notification.id, notification.recipient.email);
      throw new Error('Email service is disabled');
    }

    const maxAttempts = config.EMAIL.RETRY_ATTEMPTS;
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const result = await this.provider.send(notification);
        
        channelLogger.email('send_completed', notification.id, notification.recipient.email, {
          messageId: result.messageId,
          status: result.status,
          attempt
        });

        return;

      } catch (error) {
        lastError = error as Error;
        
        channelLogger.email('send_attempt_failed', notification.id, notification.recipient.email, {
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
    channelLogger.email('send_failed_final', notification.id, notification.recipient.email, {
      attempts: maxAttempts,
      error: lastError?.message
    });

    throw lastError || new Error('Email sending failed after all retry attempts');
  }

  validate(recipient: any): boolean {
    if (!recipient || typeof recipient !== 'object') {
      return false;
    }

    const { email } = recipient;
    if (!email || typeof email !== 'string') {
      return false;
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  async getDeliveryStatus(messageId: string): Promise<NotificationStatus> {
    // This would typically integrate with email service provider APIs
    // to get actual delivery status. For now, return sent status.
    return NotificationStatus.SENT;
  }

  private isNonRetryableError(error: Error): boolean {
    const errorMessage = error.message.toLowerCase();
    
    // Don't retry for authentication, authorization, or permanent failures
    return errorMessage.includes('authentication failed') ||
           errorMessage.includes('invalid recipient') ||
           errorMessage.includes('mailbox does not exist') ||
           errorMessage.includes('user unknown') ||
           errorMessage.includes('domain not found') ||
           errorMessage.includes('quota exceeded') ||
           errorMessage.includes('blocked');
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async healthCheck(): Promise<boolean> {
    try {
      return await this.provider.verifyConnection();
    } catch {
      return false;
    }
  }

  get metrics() {
    return {
      provider: 'smtp',
      connected: this.provider.connected,
      maxConnections: config.EMAIL.MAX_CONNECTIONS,
      rateLimit: config.EMAIL.RATE_LIMIT
    };
  }
}

// Register Handlebars helpers
handlebars.registerHelper('formatDate', (date: Date, format: string) => {
  if (!date) return '';
  
  const d = new Date(date);
  switch (format) {
    case 'short':
      return d.toLocaleDateString();
    case 'long':
      return d.toLocaleDateString(undefined, { 
        weekday: 'long', 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
      });
    case 'time':
      return d.toLocaleTimeString();
    default:
      return d.toLocaleString();
  }
});

handlebars.registerHelper('formatCurrency', (amount: number, currency: string = 'USD') => {
  if (typeof amount !== 'number') return amount;
  
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency
  }).format(amount);
});

handlebars.registerHelper('eq', (a: any, b: any) => a === b);
handlebars.registerHelper('ne', (a: any, b: any) => a !== b);
handlebars.registerHelper('gt', (a: number, b: number) => a > b);
handlebars.registerHelper('lt', (a: number, b: number) => a < b);

export const emailService = new EmailService();