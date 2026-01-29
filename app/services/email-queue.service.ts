import { EmailStatus } from '../models/email-queue.model';
import EmailQueue from '../models/email-queue.model';
import { EmailService } from './email.service';

/**
 * Service for managing email queues
 */
export class EmailQueueService {
  /**
   * Queue an email to be sent asynchronously
   * @param to - Recipient email address or addresses
   * @param subject - Email subject
   * @param html - Email body in HTML format
   * @param text - Optional plain text version
   * @param cc - Optional CC recipients
   * @param bcc - Optional BCC recipients
   * @param attachments - Optional email attachments
   * @returns Promise resolving to the created queue entry
   */
  static async queueEmail(
    to: string | string[],
    subject: string,
    html: string,
    text?: string,
    cc?: string | string[],
    bcc?: string | string[],
    attachments: any[] = []
  ): Promise<any> {
    try {
      console.log('[EmailQueueService] Attempting to queue email with subject:', subject);
      // Convert single email to array for storage
      const toArray = Array.isArray(to) ? to : [to];
      const ccArray = cc ? (Array.isArray(cc) ? cc : [cc]) : [];
      const bccArray = bcc ? (Array.isArray(bcc) ? bcc : [bcc]) : [];

      // Create a new email queue entry
      const emailQueue = new EmailQueue({
        to: toArray,
        cc: ccArray.length > 0 ? ccArray : undefined,
        bcc: bccArray.length > 0 ? bccArray : undefined,
        subject,
        html,
        text,
        attachments: attachments.length > 0 ? attachments : undefined,
        status: EmailStatus.PENDING,
        retryCount: 0,
        maxRetries: 5
      });

      console.log('[EmailQueueService] About to save email to queue with ID:', emailQueue._id);
      try {
        await emailQueue.save();
        console.log(`[EmailQueueService] Email successfully queued for sending to: ${toArray.join(', ')} with subject: ${subject}`);
        console.log(`[EmailQueueService] Queue entry created with ID: ${emailQueue._id}`);
      } catch (saveError) {
        console.error('[EmailQueueService] Failed to save email to queue:', saveError);
        throw saveError; // Re-throw to be caught by the outer try-catch
      }
      
      return emailQueue;
    } catch (error) {
      console.error('Error queuing email:', error);
      throw error;
    }
  }

  /**
   * Get the count of pending emails in the queue
   * @returns Promise resolving to the count of pending emails
   */
  static async getPendingEmailCount(): Promise<number> {
    try {
      console.log('[EmailQueueService] Counting pending emails in queue...');
      const count = await EmailQueue.countDocuments({
        $and: [
          { status: { $ne: EmailStatus.PROCESSING } },  // Exclude processing emails
          { status: { $ne: EmailStatus.SENT } },        // Exclude already sent emails
          {
            $or: [
              { status: EmailStatus.PENDING },
              { 
                status: EmailStatus.FAILED, 
                $expr: { $lt: ["$retryCount", "$maxRetries"] } 
              }
            ]
          }
        ]
      });
      console.log(`[EmailQueueService] Found ${count} pending emails`);
      return count;
    } catch (error) {
      console.error('[EmailQueueService] Error counting pending emails:', error);
      return 0;
    }
  }

  /**
   * Process the email queue, sending pending emails and handling retries
   * This is intended to be called by a cron job
   */
  static async processEmailQueue(): Promise<{sent: number, failed: number, pending: number}> {
    try {
      console.log('[EmailQueue] Processing email queue...');
      
      // Find all pending emails that haven't exceeded max retries and aren't already being processed
      const pendingEmails = await EmailQueue.find({
        $and: [
          { status: { $ne: EmailStatus.PROCESSING } },  // Exclude processing emails
          { status: { $ne: EmailStatus.SENT } },        // Exclude already sent emails
          {
            $or: [
              { status: EmailStatus.PENDING },
              { 
                status: EmailStatus.FAILED, 
                $expr: { $lt: ["$retryCount", "$maxRetries"] } 
              }
            ]
          }
        ]
      }).limit(20); // Process in batches to avoid overloading the email server
      
      // Get the IDs of the emails we're processing
      const emailIds = pendingEmails.map(email => email._id);
      
      // Mark these emails as PROCESSING to prevent them from being processed again
      if (emailIds.length > 0) {
        console.log(`[EmailQueue] Marking ${emailIds.length} emails as PROCESSING to prevent duplicate processing`);
        await EmailQueue.updateMany(
          { _id: { $in: emailIds } },
          { $set: { status: 'PROCESSING' } }
        );
      }
      
      console.log(`[EmailQueue] Found ${pendingEmails.length} emails to process`);
      
      let sent = 0;
      let failed = 0;
      
      // Process each email
      for (const email of pendingEmails) {
        try {
          // We need to bypass the normal EmailService.sendEmail method
          // to avoid it re-queuing the email, and send directly instead
          
          console.log(`[EmailQueue] Sending email ${email._id} directly via SMTP to: ${Array.isArray(email.to) ? email.to.join(', ') : email.to}`);
          
          const fromEmail = process.env.FROM_EMAIL || "nf@adamusgh.com";
          const recipients = Array.isArray(email.to) ? email.to.join(",") : email.to;
          
          const mailOptions = {
            from: fromEmail,
            to: recipients,
            subject: email.subject,
            html: email.html,
            attachments: email.attachments || [],
            ...(email.cc && { cc: Array.isArray(email.cc) ? email.cc.join(",") : email.cc }),
            ...(email.bcc && { bcc: Array.isArray(email.bcc) ? email.bcc.join(",") : email.bcc }),
          };
          
          // Send the email directly using the EmailService's direct send method
          // This bypasses the queue check and sends directly via SMTP
          await EmailService.directSendMail(mailOptions);
          
          // Update the email status to sent
          email.status = EmailStatus.SENT;
          email.sentAt = new Date();
          await email.save();
          
          sent++;
          console.log(`[EmailQueue] Email ${email._id} sent successfully to: ${Array.isArray(email.to) ? email.to.join(', ') : email.to}`);
        } catch (error: any) {
          // Increment retry count and update last error
          email.retryCount += 1;
          email.lastError = error?.message || 'Unknown error';
          
          // If max retries reached, mark as failed
          if (email.retryCount >= email.maxRetries) {
            email.status = EmailStatus.FAILED;
            console.error(`[EmailQueue] Email ${email._id} failed after ${email.retryCount} attempts: ${email.lastError}`);
          } else {
            console.warn(`[EmailQueue] Will retry email ${email._id} (attempt ${email.retryCount}/${email.maxRetries}): ${email.lastError}`);
          }
          
          await email.save();
          failed++;
        }
      }
      
      // Get count of remaining pending emails
      const remainingCount = await this.getPendingEmailCount();
      
      return {
        sent,
        failed,
        pending: remainingCount
      };
    } catch (error) {
      console.error('[EmailQueue] Error processing email queue:', error);
      throw error;
    }
  }
}
