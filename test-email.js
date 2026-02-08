// Test script to verify email configuration
import { EmailService } from './app/services/email.service';

async function testEmail() {
  try {
    await EmailService.sendEmailImmediate(
      'test@example.com',
      'Test Email',
      '<h1>Test Email</h1><p>This is a test email from the leave management system.</p>',
      'This is a test email from the leave management system.'
    );
    console.log('✅ Email sent successfully!');
  } catch (error) {
    console.error('❌ Email failed:', error.message);
  }
}

testEmail();
