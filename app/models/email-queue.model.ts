import mongoose, { Schema, Document } from 'mongoose';

export enum EmailStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  SENT = 'sent',
  FAILED = 'failed'
}

export interface IEmailQueue extends Document {
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  html: string;
  text?: string;
  attachments?: any[];
  status: EmailStatus;
  retryCount: number;
  maxRetries: number;
  lastError?: string;
  sentAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const EmailQueueSchema: Schema = new Schema({
  to: {
    type: [String],
    required: true,
    validate: {
      validator: function(emails: string[]) {
        return emails.every(email => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email));
      },
      message: 'Invalid email format in to field'
    }
  },
  cc: {
    type: [String],
    validate: {
      validator: function(emails: string[]) {
        return !emails || emails.every(email => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email));
      },
      message: 'Invalid email format in cc field'
    }
  },
  bcc: {
    type: [String],
    validate: {
      validator: function(emails: string[]) {
        return !emails || emails.every(email => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email));
      },
      message: 'Invalid email format in bcc field'
    }
  },
  subject: {
    type: String,
    required: true,
    trim: true,
    maxlength: 200
  },
  html: {
    type: String,
    required: true
  },
  text: {
    type: String
  },
  attachments: [{
    filename: String,
    path: String,
    contentType: String,
    content: Buffer
  }],
  status: {
    type: String,
    enum: Object.values(EmailStatus),
    default: EmailStatus.PENDING
  },
  retryCount: {
    type: Number,
    default: 0,
    min: 0
  },
  maxRetries: {
    type: Number,
    default: 5,
    min: 1
  },
  lastError: {
    type: String,
    trim: true
  },
  sentAt: {
    type: Date
  }
}, {
  timestamps: true,
  collection: 'email_queues'
});

// Indexes for better performance
EmailQueueSchema.index({ status: 1, createdAt: 1 });
EmailQueueSchema.index({ status: 1, retryCount: 1 });
EmailQueueSchema.index({ to: 1 });

// Prevent model recompilation in development
const EmailQueue = mongoose.models.EmailQueue || mongoose.model<IEmailQueue>('EmailQueue', EmailQueueSchema);

export default EmailQueue;
