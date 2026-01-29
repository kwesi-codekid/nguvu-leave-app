import { useState } from "react"

// API Documentation Data Structure
const API_ENDPOINTS = {
    Authentication: [
        {
            method: "POST",
            path: "/api/auth?op=login",
            description: "Login with email/password or phone/OTP",
            body: {
                email: "string",
                password: "string",
                phone: "string",
                otp: "string (4 digits)",
            },
            permissions: "None",
        },
        {
            method: "POST",
            path: "/api/auth?op=send-otp",
            description: "Send OTP to phone number",
            body: { phone: "string" },
            permissions: "None",
        },
        {
            method: "POST",
            path: "/api/auth?op=verify-otp",
            description: "Verify OTP and complete login",
            body: { phone: "string", otp: "string (4 digits)" },
            permissions: "None",
        },
        {
            method: "POST",
            path: "/api/auth?op=resend-otp",
            description: "Resend OTP to phone number",
            body: { phone: "string" },
            permissions: "None",
        },
        {
            method: "POST",
            path: "/api/auth?op=forgot-password",
            description: "Request password reset code via phone",
            body: { phone: "string" },
            permissions: "None",
        },
        {
            method: "POST",
            path: "/api/auth?op=reset-password",
            description: "Reset password with code",
            body: {
                phone: "string",
                code: "string (4 digits)",
                newPassword: "string",
            },
            permissions: "None",
        },
        {
            method: "PATCH",
            path: "/api/auth?op=change-password",
            description: "Change current password",
            body: { currentPassword: "string", newPassword: "string" },
            permissions: "Authenticated",
        },
        {
            method: "POST",
            path: "/api/auth?op=logout",
            description: "Logout current user",
            body: null,
            permissions: "None",
        },
        {
            method: "POST",
            path: "/api/auth?op=refresh-token",
            description: "Refresh authentication token",
            body: { refreshToken: "string" },
            permissions: "None",
        },
        {
            method: "PATCH",
            path: "/api/auth?op=update-profile",
            description: "Update user profile",
            body: {
                name: "string",
                phone: "string",
                address: "object",
                emergencyContact: "object",
            },
            permissions: "Authenticated",
        },
        {
            method: "GET",
            path: "/api/auth?op=profile",
            description: "Get current user profile",
            body: null,
            permissions: "Authenticated",
        },
    ],
    Staff: [
        {
            method: "POST",
            path: "/api/staff",
            description: "Create new staff member",
            body: {
                name: "string",
                email: "string",
                phone: "string",
                staffId: "string",
                department: "string",
                permissions: "array",
                gender: "male|female",
                password: "string (optional)",
            },
            permissions: "HR, ADMIN",
        },
        {
            method: "POST",
            path: "/api/staff?op=bulk-import",
            description: "Bulk import staff from file",
            body: { data: "array of staff objects" },
            permissions: "HR, ADMIN",
        },
        {
            method: "GET",
            path: "/api/staff",
            description: "Get all staff members",
            body: null,
            permissions: "HR, ADMIN, MANAGER",
        },
        {
            method: "GET",
            path: "/api/staff?op=search",
            description: "Search staff members",
            body: null,
            permissions: "Authenticated",
        },
        {
            method: "GET",
            path: "/api/staff?op=by-department&departmentId=xxx",
            description: "Get staff by department",
            body: null,
            permissions: "HR, ADMIN, MANAGER",
        },
        {
            method: "GET",
            path: "/api/staff/:id",
            description: "Get staff member by ID",
            body: null,
            permissions: "HR, ADMIN, MANAGER, SELF",
        },
        {
            method: "PUT",
            path: "/api/staff/:id",
            description: "Update staff member",
            body: {
                name: "string",
                phone: "string",
                email: "string",
                gender: "male|female",
                address: "object",
                emergencyContact: "object",
            },
            permissions: "HR, ADMIN",
        },
        {
            method: "PATCH",
            path: "/api/staff/:id?op=status",
            description: "Update staff status",
            body: { status: "active|inactive|suspended" },
            permissions: "HR, ADMIN",
        },
        {
            method: "PATCH",
            path: "/api/staff/:id?op=permissions",
            description: "Update staff permissions",
            body: { permissions: "array" },
            permissions: "ADMIN",
        },
        {
            method: "PATCH",
            path: "/api/staff/:id?op=profile-image",
            description: "Upload profile image",
            body: { image: "base64 or URL" },
            permissions: "HR, ADMIN, SELF",
        },
        {
            method: "PATCH",
            path: "/api/staff/:id?op=emergency-contact",
            description: "Update emergency contact",
            body: {
                name: "string",
                phone: "string",
                relation: "string (optional)",
            },
            permissions: "HR, ADMIN, SELF",
        },
        {
            method: "DELETE",
            path: "/api/staff/:id",
            description: "Delete staff member",
            body: null,
            permissions: "ADMIN",
        },
    ],
    "Leave Requests": [
        {
            method: "POST",
            path: "/api/leave-requests",
            description: "Create leave request with automatic validation",
            body: {
                leaveType: "annual|sick|bereavement|paternity|maternity",
                startDate: "date (YYYY-MM-DD)",
                endDate: "date (YYYY-MM-DD)",
                reason: "string (optional)",
                attachments: "array (required for sick/bereavement)",
            },
            permissions: "Authenticated",
        },
        {
            method: "POST",
            path: "/api/leave-requests?op=calculate-period",
            description:
                "Calculate working days and resumption date for leave period",
            body: {
                startDate: "date (YYYY-MM-DD) required",
                endDate: "date (YYYY-MM-DD) optional",
                numberOfDays:
                    "number optional (use either endDate or numberOfDays)",
            },
            permissions: "Authenticated",
        },
        {
            method: "POST",
            path: "/api/leave-requests?op=emergency",
            description: "Create emergency leave (bypass some validations)",
            body: {
                staffId: "string",
                leaveType: "string",
                startDate: "date",
                endDate: "date",
                reason: "string",
                skipValidation: "boolean (optional)",
            },
            permissions: "HR, ADMIN",
        },
        {
            method: "GET",
            path: "/api/leave-requests?op=my-requests",
            description: "Get my leave requests with pagination",
            body: null,
            permissions: "Authenticated",
        },
        {
            method: "GET",
            path: "/api/leave-requests?op=pending-endorsements",
            description: "Get requests pending my endorsement",
            body: null,
            permissions: "ENDORSER (based on position)",
        },
        {
            method: "GET",
            path: "/api/leave-requests?op=pending-approvals",
            description: "Get requests pending my approval",
            body: null,
            permissions: "APPROVER (based on position)",
        },
        {
            method: "GET",
            path: "/api/leave-requests?op=calendar",
            description: "Get leave calendar (data scoped by role)",
            body: null,
            permissions:
                "Authenticated (scoped: self for regular users, team for managers, all for HR/Admin)",
        },
        {
            method: "GET",
            path: "/api/leave-requests?op=summary",
            description: "Get leave request summary statistics",
            body: null,
            permissions: "HR, ADMIN, MANAGER",
        },
        {
            method: "GET",
            path: "/api/leave-requests/:id",
            description: "Get leave request by ID with full details",
            body: null,
            permissions: "OWNER, HR, ADMIN, MANAGER",
        },
        {
            method: "PUT",
            path: "/api/leave-requests/:id",
            description: "Update leave request (only pending status)",
            body: {
                startDate: "date (optional)",
                endDate: "date (optional)",
                reason: "string (optional)",
                attachments: "array (optional)",
            },
            permissions: "OWNER, HR, ADMIN",
        },
        {
            method: "PATCH",
            path: "/api/leave-requests/:id?op=withdraw",
            description: "Withdraw leave request (pending/endorsed only)",
            body: { reason: "string (optional)" },
            permissions: "OWNER",
        },
        {
            method: "PATCH",
            path: "/api/leave-requests/:id?op=endorse",
            description: "Endorse pending leave request",
            body: { comment: "string (optional)" },
            permissions: "ENDORSER (based on position)",
        },
        {
            method: "PATCH",
            path: "/api/leave-requests/:id?op=reject-endorsement",
            description: "Reject at endorsement level",
            body: { reason: "string (required)" },
            permissions: "ENDORSER (based on position)",
        },
        {
            method: "PATCH",
            path: "/api/leave-requests/:id?op=approve",
            description: "Approve endorsed leave request",
            body: { comment: "string (optional)" },
            permissions: "APPROVER (based on position)",
        },
        {
            method: "PATCH",
            path: "/api/leave-requests/:id?op=reject-approval",
            description: "Reject at approval level",
            body: { reason: "string (required)" },
            permissions: "APPROVER (based on position)",
        },
        {
            method: "PATCH",
            path: "/api/leave-requests/:id?op=cancel",
            description: "Cancel approved leave (not yet started)",
            body: { reason: "string (required)" },
            permissions: "HR, ADMIN",
        },
        {
            method: "DELETE",
            path: "/api/leave-requests/:id",
            description: "Delete leave request (pending status only)",
            body: null,
            permissions: "OWNER, HR, ADMIN",
        },
    ],
    "Leave Balances": [
        {
            method: "GET",
            path: "/api/leave-balances?op=by-staff&staffId=XXX",
            description: "Get all leave balances for a staff member",
            body: null,
            permissions: "HR, ADMIN, MANAGER, SELF",
        },
        {
            method: "GET",
            path: "/api/leave-balances?op=single&staffId=XXX&leaveType=XXX",
            description:
                "Get specific leave balance for staff/type combination",
            body: null,
            permissions: "HR, ADMIN, MANAGER, SELF",
        },
        {
            method: "GET",
            path: "/api/leave-balances?op=by-department&departmentId=XXX",
            description: "Get department leave balances summary",
            body: null,
            permissions: "HR, ADMIN, MANAGER",
        },
        {
            method: "GET",
            path: "/api/leave-balances?op=check-availability&staffId=XXX&leaveType=XXX&days=X",
            description: "Check if sufficient leave is available",
            body: null,
            permissions: "HR, ADMIN, MANAGER, SELF",
        },
        {
            method: "GET",
            path: "/api/leave-balances?op=history&staffId=XXX",
            description: "Get balance history with transaction details",
            body: null,
            permissions: "HR, ADMIN, SELF",
        },
        {
            method: "GET",
            path: "/api/leave-balances?op=summary-report",
            description: "Get comprehensive balance summary report",
            body: null,
            permissions: "HR, ADMIN",
        },
        {
            method: "GET",
            path: "/api/leave-balances?op=low-balance&threshold=X",
            description: "Get low balance alerts with severity levels",
            body: null,
            permissions: "HR, ADMIN",
        },
        {
            method: "GET",
            path: "/api/leave-balances?op=year-end-report&year=XXXX",
            description: "Get year-end comprehensive report with statistics",
            body: null,
            permissions: "HR, ADMIN",
        },
        {
            method: "GET",
            path: "/api/leave-balances?op=utilization-report",
            description: "Get leave utilization report by category",
            body: null,
            permissions: "HR, ADMIN, MANAGER",
        },
        {
            method: "GET",
            path: "/api/leave-balances?op=export&format=csv|json",
            description: "Export leave balances to CSV or JSON",
            body: null,
            permissions: "HR, ADMIN",
        },
        {
            method: "POST",
            path: "/api/leave-balances?op=validate-request",
            description: "Validate leave request against balance and rules",
            body: {
                staffId: "string",
                leaveType: "annual|sick|bereavement|paternity|maternity",
                days: "number",
            },
            permissions: "Authenticated",
        },
        {
            method: "POST",
            path: "/api/leave-balances?op=initialize-new-year",
            description: "Initialize all staff balances for new year",
            body: { year: "number (2000-2100)" },
            permissions: "ADMIN",
        },
        {
            method: "POST",
            path: "/api/leave-balances?op=process-year-end",
            description: "Process year-end closing with final statistics",
            body: { year: "number (optional, defaults to previous year)" },
            permissions: "ADMIN",
        },
        {
            method: "PUT",
            path: "/api/leave-balances?op=adjust",
            description: "Adjust annual leave balance with audit trail",
            body: {
                staffId: "string",
                adjustment: "number (positive or negative)",
                reason: "string (required)",
            },
            permissions: "HR, ADMIN",
        },
        {
            method: "PUT",
            path: "/api/leave-balances?op=reset",
            description: "Reset leave balance to default values",
            body: {
                staffId: "string",
                leaveType: "annual|sick|bereavement|paternity|maternity",
                year: "number (optional)",
                reason: "string (required)",
            },
            permissions: "ADMIN",
        },
        {
            method: "PUT",
            path: "/api/leave-balances?op=debit",
            description: "Debit balance when leave is approved (system use)",
            body: {
                staffId: "string",
                leaveType: "string",
                days: "number (positive)",
                reason: "string (optional)",
                leaveRequestId: "string (optional)",
            },
            permissions: "HR, ADMIN, SYSTEM",
        },
        {
            method: "PUT",
            path: "/api/leave-balances?op=credit",
            description: "Credit balance when leave is cancelled (system use)",
            body: {
                staffId: "string",
                leaveType: "string",
                days: "number (positive)",
                reason: "string (optional)",
                leaveRequestId: "string (optional)",
            },
            permissions: "HR, ADMIN, SYSTEM",
        },
    ],
    Departments: [
        {
            method: "POST",
            path: "/api/departments",
            description: "Create department",
            body: {
                name: "string",
                description: "string",
                head: "string (optional)",
            },
            permissions: "HR, ADMIN",
        },
        {
            method: "GET",
            path: "/api/departments",
            description: "Get all departments",
            body: null,
            permissions: "Authenticated",
        },
        {
            method: "GET",
            path: "/api/departments?op=statistics",
            description: "Get department statistics",
            body: null,
            permissions: "HR, ADMIN",
        },
        {
            method: "GET",
            path: "/api/departments/:id",
            description: "Get department by ID",
            body: null,
            permissions: "Authenticated",
        },
        {
            method: "PUT",
            path: "/api/departments/:id",
            description: "Update department",
            body: { name: "string", description: "string" },
            permissions: "HR, ADMIN",
        },
        {
            method: "PATCH",
            path: "/api/departments/:id?op=assign-head",
            description: "Assign department head",
            body: { staffId: "string" },
            permissions: "HR, ADMIN",
        },
        {
            method: "PATCH",
            path: "/api/departments/:id?op=remove-head",
            description: "Remove department head",
            body: null,
            permissions: "HR, ADMIN",
        },
        {
            method: "PATCH",
            path: "/api/departments/:id?op=toggle-status",
            description: "Toggle department status",
            body: null,
            permissions: "ADMIN",
        },
        {
            method: "DELETE",
            path: "/api/departments/:id",
            description: "Delete department",
            body: null,
            permissions: "ADMIN",
        },
    ],
    Contracts: [
        {
            method: "POST",
            path: "/api/contracts",
            description: "Create staff contract",
            body: {
                staff: "staffId",
                position: "positionId",
                startDate: "date",
                endDate: "date",
                salary: "number (optional)",
                currency: "string (default: USD)",
            },
            permissions: "HR, ADMIN",
        },
        {
            method: "GET",
            path: "/api/contracts?op=active",
            description: "Get all active contracts",
            body: null,
            permissions: "HR, ADMIN",
        },
        {
            method: "GET",
            path: "/api/contracts?op=expiring",
            description: "Get expiring contracts (within 30 days)",
            body: null,
            permissions: "HR, ADMIN",
        },
        {
            method: "GET",
            path: "/api/contracts?op=by-staff&staffId=XXX",
            description: "Get staff's current active contract",
            body: null,
            permissions: "HR, ADMIN, MANAGER, SELF",
        },
        {
            method: "GET",
            path: "/api/contracts?op=history&staffId=XXX",
            description: "Get staff's contract history",
            body: null,
            permissions: "HR, ADMIN, SELF",
        },
        {
            method: "GET",
            path: "/api/contracts/:id",
            description: "Get contract by ID with details",
            body: null,
            permissions:
                "Authenticated (salary visible to HR/ADMIN/FINANCE/SELF)",
        },
        {
            method: "PUT",
            path: "/api/contracts/:id",
            description: "Update contract salary or extend end date",
            body: {
                salary: "number (optional)",
                endDate: "date (optional, must be later than current)",
            },
            permissions: "HR, ADMIN",
        },
        {
            method: "PATCH",
            path: "/api/contracts/:id?op=activate",
            description: "Activate pending contract",
            body: null,
            permissions: "HR, ADMIN",
        },
        {
            method: "PATCH",
            path: "/api/contracts/:id?op=terminate",
            description: "Terminate active contract",
            body: { reason: "string (required)" },
            permissions: "HR, ADMIN",
        },
        {
            method: "POST",
            path: "/api/contracts/:id?op=renew",
            description: "Renew expiring/expired contract",
            body: {
                newEndDate: "date (required)",
                salary: "number (optional)",
                position: "positionId (optional)",
            },
            permissions: "HR, ADMIN",
        },
        {
            method: "PATCH",
            path: "/api/contracts/:id?op=cancel",
            description: "Cancel pending contract before start",
            body: { reason: "string (optional)" },
            permissions: "HR, ADMIN",
        },
    ],
    Holidays: [
        {
            method: "POST",
            path: "/api/holidays",
            description: "Create holiday (fixed or varying)",
            body: {
                name: "string",
                type: "fixed|varying",
                date: "date (for varying)",
                fixedMonth: "1-12 (for fixed)",
                fixedDay: "1-31 (for fixed)",
                description: "string (optional)",
            },
            permissions: "HR",
        },
        {
            method: "GET",
            path: "/api/holidays",
            description: "Get all holidays with filters and pagination",
            body: null,
            permissions: "Authenticated",
        },
        {
            method: "GET",
            path: "/api/holidays?op=upcoming",
            description: "Get upcoming holidays",
            body: null,
            permissions: "Authenticated",
        },
        {
            method: "GET",
            path: "/api/holidays?op=check-date&date=YYYY-MM-DD",
            description: "Check if specific date is holiday",
            body: null,
            permissions: "Authenticated",
        },
        {
            method: "GET",
            path: "/api/holidays?op=year&year=YYYY",
            description: "Get holidays for specific year",
            body: null,
            permissions: "Authenticated",
        },
        {
            method: "GET",
            path: "/api/holidays/:id",
            description: "Get holiday by ID",
            body: null,
            permissions: "Authenticated",
        },
        {
            method: "PUT",
            path: "/api/holidays/:id",
            description: "Update holiday",
            body: {
                name: "string",
                date: "date (for varying)",
                fixedMonth: "1-12 (for fixed)",
                fixedDay: "1-31 (for fixed)",
                description: "string",
            },
            permissions: "HR",
        },
        {
            method: "DELETE",
            path: "/api/holidays/:id",
            description: "Delete holiday",
            body: null,
            permissions: "HR",
        },
    ],
    "Job Positions": [
        {
            method: "POST",
            path: "/api/job-positions",
            description: "Create job position",
            body: {
                title: "string",
                department: "departmentId",
                maxOccupancy: "number (default: 1)",
                endorserPosition: "positionId (optional)",
                approverPosition: "positionId (optional)",
            },
            permissions: "HR, ADMIN",
        },
        {
            method: "GET",
            path: "/api/job-positions",
            description: "Get all positions with filters and pagination",
            body: null,
            permissions: "Authenticated",
        },
        {
            method: "GET",
            path: "/api/job-positions?op=available",
            description: "Get positions with vacancies",
            body: null,
            permissions: "Authenticated",
        },
        {
            method: "GET",
            path: "/api/job-positions?op=by-department&departmentId=XXX",
            description: "Get positions by department",
            body: null,
            permissions: "Authenticated",
        },
        {
            method: "GET",
            path: "/api/job-positions/:id",
            description: "Get position by ID with occupancy details",
            body: null,
            permissions: "Authenticated",
        },
        {
            method: "GET",
            path: "/api/job-positions/:id?op=occupancy",
            description: "Check position occupancy and current staff",
            body: null,
            permissions: "Authenticated",
        },
        {
            method: "PUT",
            path: "/api/job-positions/:id",
            description: "Update position title and max occupancy",
            body: { title: "string", maxOccupancy: "number" },
            permissions: "HR, ADMIN",
        },
        {
            method: "PATCH",
            path: "/api/job-positions/:id?op=approval-chain",
            description: "Update approval chain (endorser/approver)",
            body: {
                endorserPosition: "positionId (optional)",
                approverPosition: "positionId (optional)",
            },
            permissions: "HR, ADMIN",
        },
        {
            method: "PATCH",
            path: "/api/job-positions/:id?op=toggle-status",
            description: "Toggle position active/inactive status",
            body: null,
            permissions: "HR, ADMIN",
        },
        {
            method: "DELETE",
            path: "/api/job-positions/:id",
            description: "Delete or deactivate position",
            body: null,
            permissions: "ADMIN",
        },
    ],
    "Call-Ins": [
        {
            method: "POST",
            path: "/api/call-ins",
            description: "Create call-in to recall staff from approved leave",
            body: {
                leaveRequestId: "string",
                callInStartDate: "date (YYYY-MM-DD)",
                callInEndDate: "date (YYYY-MM-DD)",
                reason: "string (min 10 chars)",
                workingDaysRecovered: "number (optional)",
            },
            permissions: "MANAGER (dept head), HR, ADMIN",
        },
        {
            method: "POST",
            path: "/api/call-ins?op=bulk",
            description: "Create multiple call-ins in bulk operation",
            body: { callIns: "array of call-in objects" },
            permissions: "HR, ADMIN",
        },
        {
            method: "POST",
            path: "/api/call-ins?op=process-pending",
            description: "System maintenance to process pending call-ins",
            body: null,
            permissions: "ADMIN",
        },
        {
            method: "GET",
            path: "/api/call-ins?op=my-call-ins",
            description: "Get my call-in history with pagination",
            body: null,
            permissions: "Authenticated",
        },
        {
            method: "GET",
            path: "/api/call-ins?op=staff&staffId=XXX",
            description: "Get call-ins for specific staff member",
            body: null,
            permissions: "SELF, HR, ADMIN, MANAGER",
        },
        {
            method: "GET",
            path: "/api/call-ins?op=department&departmentId=XXX",
            description: "Get department call-ins within date range",
            body: null,
            permissions: "DEPT HEAD, HR, ADMIN, MANAGER",
        },
        {
            method: "GET",
            path: "/api/call-ins?op=history&staffId=XXX",
            description: "Get complete call-in history for staff member",
            body: null,
            permissions: "SELF, HR, ADMIN, MANAGER",
        },
        {
            method: "GET",
            path: "/api/call-ins?op=report",
            description:
                "Generate call-in report with statistics and CSV export",
            body: null,
            permissions: "HR, ADMIN, MANAGER",
        },
        {
            method: "GET",
            path: "/api/call-ins?op=summary",
            description: "Get call-in summary for dashboard display",
            body: null,
            permissions: "HR, ADMIN, MANAGER",
        },
        {
            method: "GET",
            path: "/api/call-ins?op=analytics",
            description: "Get detailed call-in analytics and patterns",
            body: null,
            permissions: "HR, ADMIN",
        },
        {
            method: "GET",
            path: "/api/call-ins/:id",
            description: "Get call-in details by ID",
            body: null,
            permissions: "OWNER, CREATOR, HR, ADMIN, MANAGER",
        },
        {
            method: "PUT",
            path: "/api/call-ins/:id",
            description: "Update call-in (within 24 hours only)",
            body: {
                callInStartDate: "date (optional)",
                callInEndDate: "date (optional)",
                reason: "string (optional)",
            },
            permissions: "CREATOR, HR, ADMIN",
        },
        {
            method: "DELETE",
            path: "/api/call-ins/:id",
            description: "Cancel call-in (within 48 hours only)",
            body: { cancellationReason: "string (required, min 10 chars)" },
            permissions: "CREATOR, HR, ADMIN",
        },
    ],
    "Audit Logs": [
        {
            method: "GET",
            path: "/api/audit-logs",
            description:
                "Get paginated audit logs with comprehensive filtering and CSV export for compliance and monitoring",
            body: null,
            permissions: "HR, ADMIN",
            queryParams: {
                page: "number (optional, default: 1)",
                limit: "number (optional, default: 50, max: 100)",
                action: "string (optional, filter by specific action type)",
                entityType: "string (optional, filter by entity type)",
                performedBy: "string (optional, filter by user ID)",
                startDate: "YYYY-MM-DD (optional, filter from date)",
                endDate: "YYYY-MM-DD (optional, filter to date)",
                ipAddress: "string (optional, filter by IP address)",
                status: "success|failed (optional, filter by operation status)",
                sortBy: "timestamp|action|entityType|performedBy (default: timestamp)",
                sortOrder: "asc|desc (default: desc)",
                format: "json|csv (default: json)",
            },
            exampleUrl:
                "/api/audit-logs?page=1&limit=20&action=LOGIN&startDate=2024-01-01&endDate=2024-12-31&format=csv",
            response: {
                logs: "array of audit log entries",
                pagination:
                    "{ currentPage, totalPages, totalRecords, recordsPerPage, hasNext, hasPrev }",
                filters: "{ applied filters summary }",
                statistics:
                    "{ totalActions, byAction, byEntityType, timeRange }",
            },
        },
        {
            method: "GET",
            path: "/api/audit-logs?op=user-activity&userId=XXX",
            description:
                "Get comprehensive user activity history with date range filtering and pagination",
            body: null,
            permissions: "SELF, HR, ADMIN, MANAGER",
            queryParams: {
                op: "user-activity (required)",
                userId: "string (required, user ID to get activity for)",
                limit: "number (optional, default: 50, max: 100)",
                skip: "number (optional, default: 0, for pagination)",
                startDate: "YYYY-MM-DD (optional, filter from date)",
                endDate: "YYYY-MM-DD (optional, filter to date)",
            },
            exampleUrl:
                "/api/audit-logs?op=user-activity&userId=507f1f77bcf86cd799439011&startDate=2024-01-01&endDate=2024-12-31&limit=25",
            response: {
                user: "{ _id, name, email }",
                activity: "array of user's audit log entries",
                summary:
                    "{ totalActions, dateRange, actionBreakdown, frequentActions }",
                pagination: "{ limit, skip, totalCount, hasMore }",
            },
        },
        {
            method: "GET",
            path: "/api/audit-logs?op=entity-history&entityType=XXX&entityId=XXX",
            description:
                "Get complete change history for specific entity with detailed change tracking",
            body: null,
            permissions: "HR, ADMIN, MANAGER",
            queryParams: {
                op: "entity-history (required)",
                entityType:
                    "string (required, e.g., LeaveRequest, Staff, CallIn)",
                entityId: "string (required, specific entity ID)",
                limit: "number (optional, default: 50, max: 100)",
                skip: "number (optional, default: 0, for pagination)",
            },
            exampleUrl:
                "/api/audit-logs?op=entity-history&entityType=LeaveRequest&entityId=507f1f77bcf86cd799439011&limit=20",
            response: {
                entity: "{ type, id, currentState }",
                history: "array of all changes made to the entity",
                lifecycle:
                    "{ created, lastModified, totalChanges, contributors }",
                pagination: "{ limit, skip, totalCount, hasMore }",
            },
        },
        {
            method: "GET",
            path: "/api/audit-logs/:id",
            description:
                "Get detailed view of specific audit log entry with enhanced metadata and computed fields",
            body: null,
            permissions: "HR, ADMIN, MANAGER",
            queryParams: {
                id: "string (required, audit log entry ID)",
            },
            exampleUrl: "/api/audit-logs/507f1f77bcf86cd799439011",
            response: {
                auditLog: "complete audit log entry",
                timeAgo:
                    "human-readable time since action (e.g., '2 hours ago')",
                isRecentAction: "boolean (within last 24 hours)",
                actionCategory:
                    "categorized action type (Authentication, Leave Management, etc.)",
                hasChanges:
                    "boolean (indicates if entry includes field changes)",
                hasMetadata:
                    "boolean (indicates if entry includes additional metadata)",
                relatedEntities:
                    "array of related entities referenced in the action",
            },
        },
    ],
    Dashboard: [
        {
            method: "GET",
            path: "/api/dashboard?op=hr",
            description:
                "HR Dashboard with KPIs, leave trends, utilization rates, low balance alerts, and system health indicators",
            body: null,
            permissions: "HR, ADMIN (only)",
            queryParams: {
                op: "hr (required)",
            },
            exampleUrl: "/api/dashboard?op=hr",
            response: {
                kpis: "{ totalStaff, activeStaff, onLeaveToday, pendingEndorsements, pendingApprovals, avgApprovalTime, requestsYTD, approvalRate }",
                leaveMix: "array of { type, count, totalDays, percentage }",
                monthlyTrend: "array of { month, requests, approvals }",
                lowBalanceAlerts: "array of staff with low annual leave",
                upcomingPeaks: "{ next30Days[], highestDay }",
                systemHealth:
                    "{ pendingActions, processingBacklog, lowBalanceStaff, upcomingHolidays }",
            },
        },
        {
            method: "GET",
            path: "/api/dashboard?op=manager",
            description:
                "Manager Dashboard showing team coverage, utilization, pending approvals, and department-specific insights",
            body: null,
            permissions: "MANAGER, HR, ADMIN",
            queryParams: {
                op: "manager (required)",
                departmentId:
                    "string (optional, defaults to manager's department)",
            },
            exampleUrl: "/api/dashboard?op=manager&departmentId=123",
            response: {
                department: "{ id, name }",
                kpis: "{ teamSize, onLeaveToday, pendingEndorsements, pendingApprovals, avgApprovalTime, approvalRate }",
                coverageNext14Days: "array of daily coverage data",
                teamUtilization: "array of team member utilization rates",
                alerts: "array of { type, message, details }",
                departmentStats: "{ pending, endorsed, approved, rejected }",
            },
        },
        {
            method: "GET",
            path: "/api/dashboard?op=staff",
            description:
                "Staff personal dashboard with leave balances, request history, upcoming leaves, and personalized insights",
            body: null,
            permissions: "Authenticated (personal view)",
            queryParams: {
                op: "staff (required)",
            },
            exampleUrl: "/api/dashboard?op=staff",
            response: {
                profile: "{ name, staffId, department, email }",
                myBalances:
                    "array of { leaveType, total, used, remaining, utilizationPercent }",
                requestsSummary:
                    "{ total, pending, endorsed, approved, rejected, cancelled }",
                upcomingLeaves: "array of approved future leaves",
                alerts: "array of { type, severity, message, action }",
                quickStats:
                    "{ daysUsedThisYear, daysRemainingThisYear, averageDaysPerRequest }",
            },
        },
        {
            method: "GET",
            path: "/api/dashboard?op=calendar",
            description:
                "Role-based calendar view with leave events, holidays, coverage analysis, and conflict detection",
            body: null,
            permissions: "Authenticated (role-based access)",
            queryParams: {
                op: "calendar (required)",
                startDate: "YYYY-MM-DD (required)",
                endDate: "YYYY-MM-DD (required)",
                view: "month|week|day (default: month)",
                departmentId: "string (optional)",
                showDetails: "true|false (default: true)",
            },
            exampleUrl:
                "/api/dashboard?op=calendar&startDate=2024-01-01&endDate=2024-01-31&view=month",
            response: {
                view: "string",
                scope: "personal|department|organization",
                events: "array of leave events with privacy controls",
                holidays: "array of holiday events",
                statistics:
                    "{ totalLeaves, typeDistribution, dailyCoverage, peakDay }",
                conflicts: "array of conflicting leave periods",
            },
        },
        {
            method: "GET",
            path: "/api/dashboard?op=today",
            description:
                "Today's snapshot showing who's on leave, coverage statistics, pending actions, and daily insights",
            body: null,
            permissions: "Authenticated (scope varies by role)",
            queryParams: {
                op: "today (required)",
            },
            exampleUrl: "/api/dashboard?op=today",
            response: {
                date: "today's date",
                scope: "personal|department|organization",
                holiday: "{ name, type, description } or null",
                statistics:
                    "{ totalOnLeave, byDepartment[], byLeaveType, coveragePercent }",
                staffOnLeave: "array scoped by user role",
                pendingActions: "{ endorsements, approvals }",
                insights: "array of contextual insights",
            },
        },
        {
            method: "GET",
            path: "/api/dashboard?op=forecast",
            description:
                "Upcoming leave forecast with peak period analysis, coverage alerts, and strategic recommendations",
            body: null,
            permissions: "Authenticated (scope varies by role)",
            queryParams: {
                op: "forecast (required)",
                days: "7-90 (default: 30)",
                departmentId: "string (optional, manager/HR access required)",
            },
            exampleUrl: "/api/dashboard?op=forecast&days=60&departmentId=123",
            response: {
                period: "{ start, end, days }",
                summary:
                    "{ totalLeaves, totalStaffDays, averageDailyAbsence, peakAbsence }",
                dailyBreakdown: "array of first 14 days with detailed data",
                weeklyBreakdown: "array of weekly summaries",
                peakPeriods: "array of highest absence days",
                alerts: "array of coverage risk alerts",
                recommendations: "array of actionable recommendations",
            },
        },
    ],
    Reports: [
        {
            method: "GET",
            path: "/api/reports?op=leave-requests",
            description:
                "Generate comprehensive leave requests report with statistics, trends, and analytics. Filters by actual leave dates (when leave occurs), not creation date. Supports CSV export.",
            body: null,
            permissions: "HR, ADMIN, MANAGER",
            queryParams: {
                op: "leave-requests (required)",
                startDate: "YYYY-MM-DD (required)",
                endDate: "YYYY-MM-DD (required)",
                departmentId: "string (optional)",
                staffId: "string (optional)",
                leaveType:
                    "annual|sick|maternity|paternity|bereavement (optional)",
                status: "pending|endorsed|approved|rejected|cancelled|withdrawn (optional)",
                groupBy: "day|week|month|department|leaveType (default: month)",
                format: "json|csv (default: json)",
            },
            exampleUrl:
                "/api/reports?op=leave-requests&startDate=2024-01-01&endDate=2024-12-31&groupBy=month",
            response: {
                period: "{ start: date, end: date }",
                statistics:
                    "{ total, totalWorkingDays, byStatus, byLeaveType, byDepartment, topStaff, topDepartments, trend }",
                details: "array (limited to 100 records in JSON, full in CSV)",
            },
        },
        {
            method: "GET",
            path: "/api/reports?op=leave-balances",
            description:
                "Generate leave balances report showing current status, low balances, and utilization metrics. Includes CSV export option.",
            body: null,
            permissions: "HR, ADMIN, MANAGER",
            queryParams: {
                op: "leave-balances (required)",
                year: "number (optional, default: current year)",
                departmentId: "string (optional)",
                staffId: "string (optional)",
                leaveType:
                    "annual|sick|maternity|paternity|bereavement (optional)",
                lowBalanceThreshold: "number (default: 3)",
                format: "json|csv (default: json)",
            },
            exampleUrl:
                "/api/reports?op=leave-balances&year=2024&lowBalanceThreshold=5",
            response: {
                year: "number",
                statistics:
                    "{ totalRecords, byLeaveType, totals, lowBalance[], averages }",
                perStaffPerType: "array of balance details",
            },
        },
        {
            method: "GET",
            path: "/api/reports?op=approvals-sla",
            description:
                "Analyze approval process performance, SLA compliance, and identify bottlenecks. Measures processing time for requests CREATED within date range.",
            body: null,
            permissions: "HR, ADMIN, MANAGER",
            queryParams: {
                op: "approvals-sla (required)",
                startDate: "YYYY-MM-DD (required)",
                endDate: "YYYY-MM-DD (required)",
                departmentId: "string (optional)",
                approverPositionId: "string (optional)",
            },
            exampleUrl:
                "/api/reports?op=approvals-sla&startDate=2024-01-01&endDate=2024-12-31",
            response: {
                period: "{ start: date, end: date }",
                metrics:
                    "{ totalProcessed, avgTimes, distributions, breachRates, byApprover[], byDepartment[], bottlenecks[] }",
                recommendations: "array of actionable recommendations",
            },
        },
        {
            method: "GET",
            path: "/api/reports?op=utilization",
            description:
                "Analyze leave utilization patterns, identify top consumers and underutilized leave, with department comparisons.",
            body: null,
            permissions: "HR, ADMIN, MANAGER",
            queryParams: {
                op: "utilization (required)",
                year: "number (optional, default: current year)",
                departmentId: "string (optional)",
                staffId: "string (optional)",
                leaveType:
                    "annual|sick|maternity|paternity|bereavement (optional)",
            },
            exampleUrl: "/api/reports?op=utilization&year=2024",
            response: {
                year: "number",
                utilization:
                    "{ overall, byLeaveType, topConsumers[], underutilized[], departmentComparisons, yearToDateTrend[], recommendations[] }",
            },
        },
        {
            method: "GET",
            path: "/api/reports?op=department-summary",
            description:
                "Department-level leave statistics including coverage analysis, peak days, and approval metrics. Filters by actual leave dates (when leave occurs).",
            body: null,
            permissions: "HR, ADMIN, MANAGER",
            queryParams: {
                op: "department-summary (required)",
                startDate: "YYYY-MM-DD (required)",
                endDate: "YYYY-MM-DD (required)",
                departmentId: "string (optional, specific dept or all)",
            },
            exampleUrl:
                "/api/reports?op=department-summary&startDate=2024-01-01&endDate=2024-12-31",
            response: {
                period: "{ start: date, end: date }",
                overall:
                    "{ totalDepartments, totalStaffDays, totalRequests, avgRequestsPerDept }",
                departments:
                    "array of { department, staffCount, requests, totalStaffDays, coverage, approvalMetrics }",
            },
        },
        {
            method: "GET",
            path: "/api/reports?op=year-end",
            description:
                "Comprehensive year-end report with balance reset preview, crossing leaves, and strategic recommendations.",
            body: null,
            permissions: "HR, ADMIN (only)",
            queryParams: {
                op: "year-end (required)",
                year: "number (optional, default: current year)",
            },
            exampleUrl: "/api/reports?op=year-end&year=2024",
            response: {
                summary:
                    "{ year, totalStaff, totalDaysAllocated, totalDaysUsed, totalDaysRemaining, utilizationRate, byLeaveType }",
                resetPreview: "{ annualLeaveReset, otherLeavesReset }",
                crossingLeaves: "{ count, details[] }",
                recommendations: "array of { type, priority, message, action }",
                nextSteps: "array of action items",
            },
        },
    ],
}

export default function ApiDocumentation() {
    const [selectedCategory, setSelectedCategory] = useState("Authentication")
    const [searchTerm, setSearchTerm] = useState("")
    const [expandedEndpoints, setExpandedEndpoints] = useState<Set<string>>(
        new Set()
    )
    const [theme, setTheme] = useState<"light" | "dark">("light")

    const categories = Object.keys(API_ENDPOINTS)

    const toggleEndpoint = (path: string) => {
        const newExpanded = new Set(expandedEndpoints)
        if (newExpanded.has(path)) {
            newExpanded.delete(path)
        } else {
            newExpanded.add(path)
        }
        setExpandedEndpoints(newExpanded)
    }

    const getMethodColor = (method: string) => {
        const colors: Record<string, string> = {
            GET: "bg-blue-500",
            POST: "bg-green-500",
            PUT: "bg-orange-500",
            DELETE: "bg-red-500",
            PATCH: "bg-purple-500",
        }
        return colors[method] || "bg-gray-500"
    }

    const filteredEndpoints = API_ENDPOINTS[
        selectedCategory as keyof typeof API_ENDPOINTS
    ].filter(
        (endpoint) =>
            endpoint.path.toLowerCase().includes(searchTerm.toLowerCase()) ||
            endpoint.description
                .toLowerCase()
                .includes(searchTerm.toLowerCase())
    )

    return (
        <div className='min-h-screen bg-gray-50 dark:bg-gray-900 transition-colors'>
            {/* Header */}
            <header className='bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 transition-colors'>
                <div className='max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6'>
                    <div className='flex items-center justify-between'>
                        <div>
                            <h1 className='text-3xl font-bold text-gray-900 dark:text-white'>
                                API Documentation
                            </h1>
                            <p className='mt-2 text-gray-600 dark:text-gray-400'>
                                Leave Management System REST API Reference
                            </p>
                        </div>
                        {/* Theme Toggle Button */}
                        <button
                            onClick={() =>
                                setTheme(theme === "dark" ? "light" : "dark")
                            }
                            className='p-2 rounded-lg bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors'
                            aria-label='Toggle theme'
                        >
                            {theme === "dark" ? (
                                <svg
                                    className='w-5 h-5 text-yellow-500'
                                    fill='none'
                                    stroke='currentColor'
                                    viewBox='0 0 24 24'
                                >
                                    <path
                                        strokeLinecap='round'
                                        strokeLinejoin='round'
                                        strokeWidth={2}
                                        d='M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z'
                                    />
                                </svg>
                            ) : (
                                <svg
                                    className='w-5 h-5 text-gray-700'
                                    fill='none'
                                    stroke='currentColor'
                                    viewBox='0 0 24 24'
                                >
                                    <path
                                        strokeLinecap='round'
                                        strokeLinejoin='round'
                                        strokeWidth={2}
                                        d='M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z'
                                    />
                                </svg>
                            )}
                        </button>
                    </div>
                </div>
            </header>

            <div className='max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8'>
                <div className='flex flex-col lg:flex-row gap-8'>
                    {/* Sidebar */}
                    <aside className='w-full lg:w-64'>
                        <div className='sticky top-8'>
                            {/* Search */}
                            <div className='mb-6'>
                                <input
                                    type='text'
                                    placeholder='Search endpoints...'
                                    className='w-full px-4 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:focus:ring-blue-400 dark:focus:border-blue-400 transition-colors'
                                    value={searchTerm}
                                    onChange={(e) =>
                                        setSearchTerm(e.target.value)
                                    }
                                />
                            </div>

                            {/* Categories */}
                            <nav className='space-y-1'>
                                {categories.map((category) => (
                                    <button
                                        key={category}
                                        onClick={() =>
                                            setSelectedCategory(category)
                                        }
                                        className={`w-full text-left px-4 py-2 rounded-lg transition-colors ${
                                            selectedCategory === category
                                                ? "bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 font-semibold"
                                                : "text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
                                        }`}
                                    >
                                        {category}
                                        <span className='ml-2 text-xs text-gray-500 dark:text-gray-400'>
                                            (
                                            {
                                                API_ENDPOINTS[
                                                    category as keyof typeof API_ENDPOINTS
                                                ].length
                                            }
                                            )
                                        </span>
                                    </button>
                                ))}
                            </nav>
                        </div>
                    </aside>

                    {/* Main Content */}
                    <main className='flex-1'>
                        <div className='bg-white dark:bg-gray-800 rounded-lg shadow-lg dark:shadow-gray-900/50 transition-colors'>
                            <div className='px-6 py-4 border-b border-gray-200 dark:border-gray-700'>
                                <h2 className='text-xl font-semibold text-gray-900 dark:text-white'>
                                    {selectedCategory}
                                </h2>
                                <p className='text-sm text-gray-600 dark:text-gray-400 mt-1'>
                                    {filteredEndpoints.length} endpoint
                                    {filteredEndpoints.length !== 1 ? "s" : ""}
                                </p>
                            </div>

                            <div className='divide-y divide-gray-200 dark:divide-gray-700'>
                                {filteredEndpoints.map((endpoint, index) => (
                                    <div
                                        key={index}
                                        className='p-6 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors'
                                    >
                                        <div
                                            className='flex items-start justify-between cursor-pointer'
                                            onClick={() =>
                                                toggleEndpoint(endpoint.path)
                                            }
                                        >
                                            <div className='flex items-start space-x-3'>
                                                <span
                                                    className={`inline-flex items-center px-2.5 py-0.5 rounded text-xs font-medium text-white ${getMethodColor(
                                                        endpoint.method
                                                    )}`}
                                                >
                                                    {endpoint.method}
                                                </span>
                                                <div>
                                                    <code className='text-sm font-mono text-gray-900 dark:text-gray-100'>
                                                        {endpoint.path}
                                                    </code>
                                                    {/* Show required date parameters inline for Reports */}
                                                    {(endpoint as any)
                                                        .queryParams && (
                                                        <div className='mt-1'>
                                                            {(endpoint as any)
                                                                .queryParams
                                                                .startDate && (
                                                                <span className='inline-block mr-2 px-2 py-0.5 text-xs bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 rounded'>
                                                                    Required:
                                                                    startDate,
                                                                    endDate
                                                                </span>
                                                            )}
                                                            {(endpoint as any)
                                                                .queryParams
                                                                .year &&
                                                                !(
                                                                    endpoint as any
                                                                ).queryParams
                                                                    .startDate && (
                                                                    <span className='inline-block mr-2 px-2 py-0.5 text-xs bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400 rounded'>
                                                                        Optional:
                                                                        year
                                                                        (default:
                                                                        current)
                                                                    </span>
                                                                )}
                                                        </div>
                                                    )}
                                                    <p className='mt-1 text-sm text-gray-600 dark:text-gray-400'>
                                                        {endpoint.description}
                                                    </p>
                                                </div>
                                            </div>
                                            <svg
                                                className={`w-5 h-5 text-gray-400 dark:text-gray-500 transition-transform ${
                                                    expandedEndpoints.has(
                                                        endpoint.path
                                                    )
                                                        ? "rotate-180"
                                                        : ""
                                                }`}
                                                fill='none'
                                                stroke='currentColor'
                                                viewBox='0 0 24 24'
                                            >
                                                <path
                                                    strokeLinecap='round'
                                                    strokeLinejoin='round'
                                                    strokeWidth={2}
                                                    d='M19 9l-7 7-7-7'
                                                />
                                            </svg>
                                        </div>

                                        {expandedEndpoints.has(
                                            endpoint.path
                                        ) && (
                                            <div className='mt-4 pl-11 space-y-3'>
                                                {/* Permissions */}
                                                <div>
                                                    <h4 className='text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider'>
                                                        Required Permissions
                                                    </h4>
                                                    <p className='mt-1 text-sm text-gray-700 dark:text-gray-300'>
                                                        {endpoint.permissions}
                                                    </p>
                                                </div>

                                                {/* Query Parameters */}
                                                {(endpoint as any)
                                                    .queryParams && (
                                                    <div>
                                                        <h4 className='text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider'>
                                                            Query Parameters
                                                        </h4>
                                                        <div className='mt-2 p-4 bg-gray-50 dark:bg-gray-900/50 rounded-lg border border-gray-200 dark:border-gray-700'>
                                                            <pre className='text-xs text-gray-700 dark:text-gray-300 overflow-x-auto font-mono'>
                                                                {JSON.stringify(
                                                                    (
                                                                        endpoint as any
                                                                    )
                                                                        .queryParams,
                                                                    null,
                                                                    2
                                                                )}
                                                            </pre>
                                                        </div>
                                                    </div>
                                                )}

                                                {/* Example URL */}
                                                {(endpoint as any)
                                                    .exampleUrl && (
                                                    <div>
                                                        <h4 className='text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider'>
                                                            Example URL
                                                        </h4>
                                                        <div className='mt-2 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800'>
                                                            <code className='text-xs text-blue-700 dark:text-blue-300 font-mono break-all'>
                                                                {
                                                                    (
                                                                        endpoint as any
                                                                    ).exampleUrl
                                                                }
                                                            </code>
                                                        </div>
                                                    </div>
                                                )}

                                                {/* Request Body */}
                                                {endpoint.body && (
                                                    <div>
                                                        <h4 className='text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider'>
                                                            Request Body
                                                        </h4>
                                                        <div className='mt-2 p-4 bg-gray-50 dark:bg-gray-900/50 rounded-lg border border-gray-200 dark:border-gray-700'>
                                                            <pre className='text-xs text-gray-700 dark:text-gray-300 overflow-x-auto font-mono'>
                                                                {JSON.stringify(
                                                                    endpoint.body,
                                                                    null,
                                                                    2
                                                                )}
                                                            </pre>
                                                        </div>
                                                    </div>
                                                )}

                                                {/* Response Structure */}
                                                {(endpoint as any).response && (
                                                    <div>
                                                        <h4 className='text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider'>
                                                            Response Structure
                                                        </h4>
                                                        <div className='mt-2 p-4 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800'>
                                                            <pre className='text-xs text-green-700 dark:text-green-300 overflow-x-auto font-mono'>
                                                                {JSON.stringify(
                                                                    (
                                                                        endpoint as any
                                                                    ).response,
                                                                    null,
                                                                    2
                                                                )}
                                                            </pre>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    </main>
                </div>
            </div>
        </div>
    )
}
