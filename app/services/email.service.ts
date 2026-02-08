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
      this.transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST || 'smtp.office365.com',
        port: parseInt(process.env.SMTP_PORT || '587'),
        secure: process.env.SMTP_SECURE === 'true', // true for 465, false for other ports
        auth: {
          user: process.env.MICROSOFT_EMAIL || process.env.SMTP_USER,
          pass: process.env.MICROSOFT_PASSWORD || process.env.SMTP_PASS,
        },
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
      
      await transporter.sendMail(mailOptions);
      console.log(`Email sent successfully to: ${mailOptions.to}`);
    } catch (error) {
      console.error('Error sending email:', error);
      throw error;
    }
  }

  /**
   * Send email using the queue system
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
}
