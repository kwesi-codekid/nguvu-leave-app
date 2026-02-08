import nodemailer from 'nodemailer';

/**
 * Service for sending emails directly via SMTP
 */
export class EmailService {
  private static transporter: nodemailer.Transporter;

  /**
   * Initialize the email transporter with SMTP configuration
   */
  private static initializeTransporter() {
    if (!this.transporter) {
      // Validate required environment variables
      const smtpUser = process.env.SMTP_USER || process.env.MICROSOFT_EMAIL;
      const smtpPass = process.env.SMTP_PASS || process.env.MICROSOFT_PASSWORD;
      
      if (!smtpUser || !smtpPass) {
        throw new Error('SMTP credentials are missing. Please set SMTP_USER/SMTP_PASS or MICROSOFT_EMAIL/MICROSOFT_PASSWORD environment variables.');
      }

      console.log(`Initializing email transporter for user: ${smtpUser}`);
      
      this.transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST || 'smtp.gmail.com',
        port: parseInt(process.env.SMTP_PORT || '587'),
        secure: process.env.SMTP_SECURE === 'true', // true for 465, false for other ports
        auth: {
          user: smtpUser,
          pass: smtpPass,
        },
        debug: process.env.NODE_ENV === 'development', // Enable debug in development
        logger: process.env.NODE_ENV === 'development', // Enable logging in development
      });
    }
    return this.transporter;
  }

  /**
   * Send email directly via SMTP (bypassing queue)
   * @param mailOptions - Email options including to, subject, html, etc.
   */
  static async directSendMail(mailOptions: any): Promise<void> {
    try {
      const transporter = this.initializeTransporter();
      
      // Set default from email if not provided
      if (!mailOptions.from) {
        mailOptions.from = process.env.FROM_EMAIL || "nf@adamusgh.com";
      }
      
      console.log(`Attempting to send email to: ${mailOptions.to}`);
      const result = await transporter.sendMail(mailOptions);
      console.log(`Email sent successfully. Message ID: ${result.messageId}`);
    } catch (error: any) {
      console.error('Error sending email:', error);
      
      // Provide more specific error messages
      if (error.code === 'EAUTH') {
        throw new Error('SMTP authentication failed. Please check your SMTP_USER and SMTP_PASS credentials.');
      } else if (error.code === 'ECONNECTION') {
        throw new Error('Could not connect to SMTP server. Please check SMTP_HOST and SMTP_PORT.');
      } else if (error.code === 'ENOTFOUND') {
        throw new Error('SMTP server not found. Please check SMTP_HOST.');
      } else {
        throw new Error(`Email sending failed: ${error.message}`);
      }
    }
  }

  /**
   * Send email using the queue system (for bulk emails)
   * @param to - Recipient email address
   * @param subject - Email subject
   * @param html - Email body in HTML format
   * @param text - Optional plain text version
   */
  static async sendEmail(
    to: string | string[],
    subject: string,
    html: string,
    text?: string
  ): Promise<void> {
    try {
      const { EmailQueueService } = await import('./email-queue.service');
      
      await EmailQueueService.queueEmail(to, subject, html, text);
      console.log(`Email queued for sending to: ${Array.isArray(to) ? to.join(', ') : to}`);
    } catch (error) {
      console.error('Error queuing email:', error);
      throw error;
    }
  }

  /**
   * Send email immediately without queue (for urgent emails like OTP)
   * @param to - Recipient email address
   * @param subject - Email subject
   * @param html - Email body in HTML format
   * @param text - Optional plain text version
   */
  static async sendEmailImmediate(
    to: string | string[],
    subject: string,
    html: string,
    text?: string
  ): Promise<void> {
    try {
      const mailOptions = {
        to: Array.isArray(to) ? to.join(",") : to,
        subject,
        html,
        ...(text && { text }),
      };
      
      await this.directSendMail(mailOptions);
      console.log(`Email sent immediately to: ${Array.isArray(to) ? to.join(', ') : to}`);
    } catch (error) {
      console.error('Error sending immediate email:', error);
      throw error;
    }
  }
}
