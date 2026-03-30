import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

/**
 * Service for sending emails via Resend API
 */
export class EmailService {
  /**
   * Send email directly via Resend API (bypassing queue)
   * @param mailOptions - Email options including to, subject, html, etc.
   */
  static async directSendMail(mailOptions: any): Promise<void> {
    try {
      const from = mailOptions.from || process.env.FROM_EMAIL || "nf@adamusgh.com";
      const to = Array.isArray(mailOptions.to)
        ? mailOptions.to
        : mailOptions.to.split(',').map((e: string) => e.trim());

      const { error } = await resend.emails.send({
        from,
        to,
        subject: mailOptions.subject,
        html: mailOptions.html,
        text: mailOptions.text,
        ...(mailOptions.cc && { cc: Array.isArray(mailOptions.cc) ? mailOptions.cc : mailOptions.cc.split(',').map((e: string) => e.trim()) }),
        ...(mailOptions.bcc && { bcc: Array.isArray(mailOptions.bcc) ? mailOptions.bcc : mailOptions.bcc.split(',').map((e: string) => e.trim()) }),
        ...(mailOptions.attachments?.length && {
          attachments: mailOptions.attachments.map((a: any) => ({
            filename: a.filename,
            content: a.content,
            path: a.path,
            content_type: a.contentType,
          })),
        }),
      });

      if (error) {
        throw new Error(error.message);
      }

      console.log(`Email sent successfully to: ${to}`);
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
