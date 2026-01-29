import sendSMS from "../utils/sendSMS"

/**
 * SMS notification service for leave management system
 * Provides professional, concise notifications for all leave operations
 */
export class SMSService {
    /**
     * Format date to readable format: "25-Dec-2024"
     */
    private static formatDate(date: Date | string): string {
        const d = new Date(date)
        const months = [
            "Jan",
            "Feb",
            "Mar",
            "Apr",
            "May",
            "Jun",
            "Jul",
            "Aug",
            "Sep",
            "Oct",
            "Nov",
            "Dec",
        ]
        const day = d.getDate().toString().padStart(2, "0")
        const month = months[d.getMonth()]
        const year = d.getFullYear()
        return `${day}-${month}-${year}`
    }

    /**
     * Format date range for SMS
     */
    private static formatDateRange(
        startDate: Date | string,
        endDate: Date | string
    ): string {
        return `${this.formatDate(startDate)} to ${this.formatDate(endDate)}`
    }

    /**
     * Truncate text to specified length with ellipsis
     */
    private static truncateText(
        text: string | null | undefined,
        maxLength: number = 50
    ): string {
        if (!text) return "Not specified"
        if (text.length <= maxLength) return text
        return text.substring(0, maxLength - 3) + "..."
    }

    /**
     * Get staff display name
     */
    private static getStaffDisplayName(staff: any): string {
        return staff?.name || staff?.firstName || "Staff Member"
    }

    /**
     * Build message from template and variables
     */
    private static buildMessage(
        template: string,
        variables: Record<string, any>
    ): string {
        let message = template
        for (const [key, value] of Object.entries(variables)) {
            message = message.replace(
                new RegExp(`\\[${key}\\]`, "g"),
                String(value)
            )
        }
        return message
    }

    /**
     * Send SMS with error handling (non-blocking)
     */
    private static async sendSMSSafely(
        phone: string | null | undefined,
        message: string,
        context: string
    ): Promise<void> {
        try {
            if (!phone) {
                console.log(
                    `[SMSService] No phone number available for ${context}`
                )
                return
            }

            await sendSMS({
                recipient: phone,
                smsText: message,
            })

            console.log(`[SMSService] SMS sent successfully for ${context}`)
        } catch (error) {
            console.error(
                `[SMSService] Failed to send SMS for ${context}:`,
                error
            )
            // Don't throw - SMS failure shouldn't break the main operation
        }
    }

    /**
     * Notify endorser about new leave request
     */
    static async notifyNewLeaveRequest(
        request: any,
        endorser: any
    ): Promise<void> {
        const template = `Hello [Name],
[StaffName] has requested [LeaveType] leave from [StartDate] to [EndDate] ([Days] days).
Reason: [Reason]
Please review and endorse in the system.`

        const message = this.buildMessage(template, {
            Name: this.getStaffDisplayName(endorser),
            StaffName: this.getStaffDisplayName(request.staff),
            LeaveType: request.leaveType,
            StartDate: this.formatDate(request.startDate),
            EndDate: this.formatDate(request.endDate),
            Days: request.workingDays || 0,
            Reason: this.truncateText(request.reason),
        })

        await this.sendSMSSafely(
            endorser?.phone,
            message,
            `new leave request notification to endorser ${endorser?.name}`
        )
    }

    /**
     * Notify approver about endorsed leave request
     */
    static async notifyLeaveEndorsed(
        request: any,
        approver: any,
        endorserName: string
    ): Promise<void> {
        const template = `Hello [Name],
[StaffName]'s [LeaveType] leave request has been endorsed by [EndorserName].
Dates: [StartDate] to [EndDate] ([Days] days).
Your approval is required. Please review in the system.`

        const message = this.buildMessage(template, {
            Name: this.getStaffDisplayName(approver),
            StaffName: this.getStaffDisplayName(request.staff),
            LeaveType: request.leaveType,
            EndorserName: endorserName,
            StartDate: this.formatDate(request.startDate),
            EndDate: this.formatDate(request.endDate),
            Days: request.workingDays || 0,
        })

        await this.sendSMSSafely(
            approver?.phone,
            message,
            `leave endorsed notification to approver ${approver?.name}`
        )
    }

    /**
     * Notify staff that leave has been approved
     */
    static async notifyLeaveApproved(
        request: any,
        staff: any,
        approverName: string
    ): Promise<void> {
        const template = `Hello [Name],
Your [LeaveType] leave request has been approved by [ApproverName].
Dates: [StartDate] to [EndDate] ([Days] days).
Enjoy your leave!`

        const message = this.buildMessage(template, {
            Name: this.getStaffDisplayName(staff),
            LeaveType: request.leaveType,
            ApproverName: approverName,
            StartDate: this.formatDate(request.startDate),
            EndDate: this.formatDate(request.endDate),
            Days: request.workingDays || 0,
        })

        await this.sendSMSSafely(
            staff?.phone,
            message,
            `leave approved notification to staff ${staff?.name}`
        )
    }

    /**
     * Notify staff that leave has been declined
     */
    static async notifyLeaveDeclined(
        request: any,
        staff: any,
        declinerName: string,
        declineReason?: string
    ): Promise<void> {
        let template = `Hello [Name],
Your [LeaveType] leave request has been declined by [DeclinerName].
Dates: [StartDate] to [EndDate].`

        if (declineReason) {
            template += `
Reason: [DeclineReason]`
        }

        template += `
Please contact HR for more information.`

        const message = this.buildMessage(template, {
            Name: this.getStaffDisplayName(staff),
            LeaveType: request.leaveType,
            DeclinerName: declinerName,
            StartDate: this.formatDate(request.startDate),
            EndDate: this.formatDate(request.endDate),
            DeclineReason: declineReason
                ? this.truncateText(declineReason)
                : "",
        })

        await this.sendSMSSafely(
            staff?.phone,
            message,
            `leave declined notification to staff ${staff?.name}`
        )
    }

    /**
     * Notify staff that leave has been cancelled
     */
    static async notifyLeaveCancelled(
        request: any,
        staff: any,
        cancellerName: string,
        cancellationReason?: string
    ): Promise<void> {
        let template = `Hello [Name],
Your [LeaveType] leave has been cancelled by [CancellerName].
Dates: [StartDate] to [EndDate].`

        if (cancellationReason) {
            template += `
Reason: [CancellationReason]`
        }

        template += `
Your leave balance has been restored. Please contact HR for more information.`

        const message = this.buildMessage(template, {
            Name: this.getStaffDisplayName(staff),
            LeaveType: request.leaveType,
            CancellerName: cancellerName,
            StartDate: this.formatDate(request.startDate),
            EndDate: this.formatDate(request.endDate),
            CancellationReason: cancellationReason
                ? this.truncateText(cancellationReason)
                : "",
        })

        await this.sendSMSSafely(
            staff?.phone,
            message,
            `leave cancelled notification to staff ${staff?.name}`
        )
    }

    /**
     * Notify staff about leave return reminder
     */
    static async notifyLeaveReturnReminder(
        request: any,
        staff: any,
        daysRemaining: number
    ): Promise<void> {
        const template = `Hello [Name],
Reminder: Your [LeaveType] leave ends on [EndDate] ([Days] days from now).
Please prepare for your return to work.`

        const message = this.buildMessage(template, {
            Name: this.getStaffDisplayName(staff),
            LeaveType: request.leaveType,
            EndDate: this.formatDate(request.endDate),
            Days: daysRemaining,
        })

        await this.sendSMSSafely(
            staff?.phone,
            message,
            `leave return reminder to staff ${staff?.name}`
        )
    }

    /**
     * Notify staff about leave balance update
     */
    static async notifyLeaveBalanceUpdate(
        staff: any,
        leaveType: string,
        previousBalance: number,
        newBalance: number,
        reason: string
    ): Promise<void> {
        const template = `Hello [Name],
Your [LeaveType] leave balance has been updated.
Previous: [PreviousBalance] days
New: [NewBalance] days
Reason: [Reason]`

        const message = this.buildMessage(template, {
            Name: this.getStaffDisplayName(staff),
            LeaveType: leaveType,
            PreviousBalance: previousBalance,
            NewBalance: newBalance,
            Reason: this.truncateText(reason),
        })

        await this.sendSMSSafely(
            staff?.phone,
            message,
            `leave balance update notification to staff ${staff?.name}`
        )
    }

    /**
     * Notify staff about call-in requirement
     */
    static async notifyCallInCreated(
        callIn: any,
        staff: any,
        creatorName: string
    ): Promise<void> {
        const template = `URGENT: Call-In Notice
Hello [StaffName],

You are required to return to work from your [LeaveType] leave.

Call-In Period: [CallInDates]
Working Days: [WorkingDays] days
Reason: [Reason]

Please report to work as scheduled. Your leave balance will be adjusted.

Requested by: [CreatorName]
Contact HR if you have questions.`

        const message = this.buildMessage(template, {
            StaffName: this.getStaffDisplayName(staff),
            LeaveType: callIn.leaveRequest?.leaveType || "leave",
            CallInDates: this.formatDateRange(
                callIn.callInStartDate,
                callIn.callInEndDate
            ),
            WorkingDays: callIn.workingDaysRecovered || 0,
            Reason: this.truncateText(callIn.reason, 60),
            CreatorName: creatorName,
        })

        await this.sendSMSSafely(
            staff?.phone,
            message,
            `call-in notification to staff ${staff?.name}`
        )
    }

    /**
     * Notify staff about call-in update
     */
    static async notifyCallInUpdated(
        callIn: any,
        staff: any,
        updaterName: string,
        changes: any[]
    ): Promise<void> {
        const changedFields = changes.map((c) => c.fieldLabel).join(", ")

        const template = `Call-In Update Notice
Hello [StaffName],

Your call-in has been updated by [UpdaterName].

Updated: [ChangedFields]
New Period: [CallInDates]
Working Days: [WorkingDays] days

Please note the changes and report as scheduled.
Contact HR if you have questions.`

        const message = this.buildMessage(template, {
            StaffName: this.getStaffDisplayName(staff),
            UpdaterName: updaterName,
            ChangedFields: changedFields || "call-in details",
            CallInDates: this.formatDateRange(
                callIn.callInStartDate,
                callIn.callInEndDate
            ),
            WorkingDays: callIn.workingDaysRecovered || 0,
        })

        await this.sendSMSSafely(
            staff?.phone,
            message,
            `call-in update notification to staff ${staff?.name}`
        )
    }

    /**
     * Notify staff about call-in cancellation
     */
    static async notifyCallInCancelled(
        callIn: any,
        staff: any,
        cancellerName: string,
        cancellationReason: string
    ): Promise<void> {
        const template = `Call-In Cancelled
Hello [StaffName],

Your call-in for [CallInDates] has been cancelled by [CancellerName].

Reason: [CancellationReason]
Days Restored: [WorkingDays] days

You may continue your approved leave as originally planned. Your leave balance has been restored.

Contact HR if you have questions.`

        const message = this.buildMessage(template, {
            StaffName: this.getStaffDisplayName(staff),
            CallInDates: this.formatDateRange(
                callIn.callInStartDate,
                callIn.callInEndDate
            ),
            CancellerName: cancellerName,
            CancellationReason: this.truncateText(cancellationReason, 50),
            WorkingDays: callIn.workingDaysRecovered || 0,
        })

        await this.sendSMSSafely(
            staff?.phone,
            message,
            `call-in cancellation notification to staff ${staff?.name}`
        )
    }

    /**
     * Batch notify multiple recipients
     */
    static async batchNotifyLeaveUpdate(
        recipients: any[],
        request: any,
        updateType: "approved" | "declined" | "cancelled",
        updaterName: string
    ): Promise<void> {
        const promises = recipients.map(async (recipient) => {
            const template = `Hello [Name],
[StaffName]'s [LeaveType] leave ([StartDate] to [EndDate]) has been [Status] by [UpdaterName].`

            const message = this.buildMessage(template, {
                Name: this.getStaffDisplayName(recipient),
                StaffName: this.getStaffDisplayName(request.staff),
                LeaveType: request.leaveType,
                StartDate: this.formatDate(request.startDate),
                EndDate: this.formatDate(request.endDate),
                Status: updateType,
                UpdaterName: updaterName,
            })

            await this.sendSMSSafely(
                recipient?.phone,
                message,
                `batch leave update to ${recipient?.name}`
            )
        })

        await Promise.all(promises)
    }

    /**
     * Check if staff should receive SMS notifications
     */
    static shouldSendSMS(staff: any): boolean {
        // SMS is default, so send unless explicitly disabled
        // This could be enhanced to check user preferences if needed
        return !!staff?.phone
    }

    /**
     * Generic SMS notification (for custom messages)
     */
    static async sendGenericNotification(
        recipient: any,
        subject: string,
        body: string
    ): Promise<void> {
        const template = `Hello [Name],
[Subject]
[Body]`

        const message = this.buildMessage(template, {
            Name: this.getStaffDisplayName(recipient),
            Subject: subject,
            Body: body,
        })

        await this.sendSMSSafely(
            recipient?.phone,
            message,
            `generic notification to ${recipient?.name}`
        )
    }
}

export default SMSService
