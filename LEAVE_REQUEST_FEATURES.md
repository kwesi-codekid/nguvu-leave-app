# Leave Request Features

This document outlines the features and functionality of the Leave Request system.

---

## Table of Contents

1. [Leave Types](#leave-types)
2. [Leave Request Workflow](#leave-request-workflow)
3. [Leave Balance Management](#leave-balance-management)
4. [Working Days Calculation](#working-days-calculation)
5. [Document Requirements](#document-requirements)
6. [Endorsement & Approval](#endorsement--approval)
7. [Call-In (Recall from Leave)](#call-in-recall-from-leave)
8. [Restrictions & Validations](#restrictions--validations)
9. [Notifications](#notifications)
10. [Reports & Analytics](#reports--analytics)

---

## Leave Types

| Leave Type   | Cap (Days) | Gender Restriction | Documents Required |
|-------------|------------|--------------------|--------------------|
| Annual      | 30         | None               | No                 |
| Sick        | 60         | None               | Yes                |
| Maternity   | 30         | Female only        | Yes                |
| Paternity   | 5          | Male only          | Yes                |
| Bereavement | 10         | None               | Yes                |

### Annual Leave
- Accrues monthly (2.5 days per month)
- Can be carried forward to next year (with limits)
- Most flexible - minimal restrictions

### Sick Leave
- Requires medical certificate for extended sick leave
- Can be taken with short notice
- 60-day cap per year

### Maternity Leave
- Only available for female staff
- Requires supporting medical documents
- 30-day allocation

### Paternity Leave
- Only available for male staff
- Requires birth certificate or hospital documentation
- 5-day allocation

### Bereavement Leave
- For death of immediate family member
- Requires death certificate or funeral documentation
- 10-day allocation

---

## Leave Request Workflow

```
┌─────────────┐     ┌───────────────────┐     ┌──────────┐     ┌──────────┐
│   CREATE    │────▶│ PENDING_ENDORSEMENT│────▶│ ENDORSED │────▶│ APPROVED │
│   REQUEST   │     │                   │     │          │     │          │
└─────────────┘     └───────────────────┘     └──────────┘     └──────────┘
                            │                      │                │
                            ▼                      ▼                ▼
                      ┌──────────┐          ┌──────────┐      ┌──────────┐
                      │ REJECTED │          │ REJECTED │      │CANCELLED │
                      └──────────┘          └──────────┘      └──────────┘
                            │
                            ▼
                      ┌──────────┐
                      │WITHDRAWN │
                      └──────────┘
```

### Status Definitions

| Status              | Description                                              |
|--------------------|----------------------------------------------------------|
| pending_endorsement | Request submitted, awaiting endorser review              |
| endorsed           | Endorsed by immediate supervisor, awaiting HR approval   |
| approved           | Fully approved, leave is confirmed                       |
| rejected           | Request denied at either endorsement or approval stage   |
| cancelled          | Request cancelled after approval (by HR/Admin)           |
| withdrawn          | Request withdrawn by the requester before approval       |

### Workflow Steps

1. **Staff submits leave request**
   - Selects leave type, date range, and provides reason
   - Uploads required documents (if applicable)
   - System calculates working days

2. **Endorser reviews request**
   - Position-based endorser (defined in Job Position settings)
   - Can endorse with optional comment
   - Can reject with required reason

3. **Approver (HR/Admin) reviews endorsed request**
   - Final approval authority
   - Can approve or reject
   - Upon approval, leave balance is deducted

4. **Post-approval actions**
   - Staff can be called in from leave
   - Request can be cancelled with reason
   - Balance adjustments are tracked

---

## Leave Balance Management

### Balance Structure

```typescript
{
  staff: ObjectId,      // Staff reference
  year: 2025,           // Calendar year
  leaveType: "annual",  // Leave type
  allocated: 30,        // Maximum allowed
  accrued: 15,          // For annual leave - monthly accrual
  used: 5,              // Days taken
  adjustments: 0,       // Manual adjustments (+/-)
  available: 10         // Calculated: min(allocated, accrued) - used + adjustments
}
```

### Annual Leave Accrual

- Accrues at **2.5 days per month**
- Begins from contract start date
- Maximum accrual capped at 30 days per year
- Accrual runs via scheduled job (monthly)

### Balance Initialization

When a new contract is created:
- Leave balances are initialized for the current year
- Annual leave starts with pro-rated accrual based on start date
- Other leave types get full allocation immediately

### Carry Forward

- End of year process for annual leave
- Unused annual leave can be carried forward
- Maximum carry forward limit (configurable)
- Non-annual leave types reset to zero

---

## Working Days Calculation

### Rules

1. **Weekends excluded** - Saturday and Sunday are not counted
2. **Public holidays excluded** - Both fixed and varying holidays
3. **Cross-year leave** - Days are broken down by year for balance deduction

### Example Calculation

```
Leave Request: December 28, 2025 - January 5, 2026

December 28 (Sun) - Weekend, excluded
December 29 (Mon) - Working day
December 30 (Tue) - Working day
December 31 (Wed) - Working day (if not a holiday)
January 1 (Thu)   - Holiday (New Year), excluded
January 2 (Fri)   - Working day
January 3 (Sat)   - Weekend, excluded
January 4 (Sun)   - Weekend, excluded
January 5 (Mon)   - Working day

Working Days Breakdown:
- 2025: 3 days
- 2026: 2 days
Total: 5 working days
```

### Holiday Integration

- System checks both **fixed** holidays (same date every year)
- And **varying** holidays (different dates each year like Easter)
- Date range overlap is validated against holiday calendar

---

## Document Requirements

### Required Documents by Leave Type

| Leave Type   | Required Documents                              |
|-------------|------------------------------------------------|
| Sick        | Medical certificate, doctor's note              |
| Maternity   | Medical confirmation of pregnancy, expected date|
| Paternity   | Birth certificate, hospital birth record        |
| Bereavement | Death certificate, funeral program              |

### Document Upload

- Multiple documents can be attached
- Supported formats: PDF, JPG, PNG
- Maximum file size: 5MB per file
- Documents stored securely with audit trail

---

## Endorsement & Approval

### Position-Based Routing

Leave requests are routed based on **Job Position** configuration:

```typescript
JobPosition {
  title: "Software Developer",
  department: ObjectId,
  endorserPosition: ObjectId,  // e.g., "Team Lead"
  approverPosition: ObjectId   // e.g., "HR Manager"
}
```

### Endorsement Record

```typescript
{
  byPosition: ObjectId,  // Position that endorsed
  byStaff: ObjectId,     // Actual staff member
  at: Date,              // Timestamp
  comment: string        // Optional comment
}
```

### Approval Record

```typescript
{
  byPosition: ObjectId,
  byStaff: ObjectId,
  at: Date,
  comment: string,
  decision: "approved" | "rejected"
}
```

### Delegation (Future Enhancement)

- Endorsers can delegate to alternates during absence
- Auto-escalation after X days without action
- Notification to backup endorser

---

## Call-In (Recall from Leave)

When an employee on approved leave needs to return to work:

### Call-In Process

1. **Manager initiates call-in**
   - Specifies call-in start and end dates
   - Provides reason for recall
   - Must be within the original leave period

2. **System calculates recovered days**
   - Working days between call-in start and original leave end
   - Weekends and holidays excluded

3. **Balance adjustment**
   - Recovered working days credited back to leave balance
   - Audit log entry created

### Call-In Record

```typescript
{
  leaveRequest: ObjectId,
  staff: ObjectId,
  department: ObjectId,
  callInStartDate: Date,
  callInEndDate: Date,
  workingDaysRecovered: number,
  reason: string,
  requestedBy: ObjectId,
  requestedAt: Date
}
```

---

## Restrictions & Validations

### Pre-submission Validations

| Validation                          | Description                                           |
|------------------------------------|-------------------------------------------------------|
| Sufficient balance                 | Cannot request more days than available balance        |
| Active contract                    | Must have an active contract to request leave          |
| Gender restriction                 | Maternity/Paternity limited by staff gender            |
| Date validity                      | End date must be after or equal to start date          |
| No overlapping requests            | Cannot have overlapping approved/pending requests      |
| Minimum notice period              | Some leave types require advance notice                |
| Document upload                    | Required documents must be attached for certain types  |

### Business Rules

1. **Cannot modify approved leave** - Must cancel and re-request
2. **Cannot withdraw endorsed leave** - Must contact HR
3. **Past dates not allowed** - Leave start date must be future or today
4. **Maximum consecutive days** - Configurable per leave type
5. **Blackout periods** - Certain dates may be restricted (future)

---

## Notifications

### Email Notifications

| Event                     | Recipients                              |
|--------------------------|----------------------------------------|
| Leave request submitted   | Endorser, Requester                    |
| Leave endorsed           | Approver, Requester                    |
| Leave approved           | Requester, Endorser, Department Head   |
| Leave rejected           | Requester                              |
| Leave cancelled          | Requester, Endorser                    |
| Call-in created          | Staff on leave, HR                     |
| Upcoming leave reminder  | Requester (1 day before)               |
| Balance running low      | Staff (when < 5 days remaining)        |

### SMS Notifications (Optional)

- Critical notifications can be sent via SMS
- Staff must have phone number registered
- Configurable per notification type

---

## Reports & Analytics

### Available Reports

1. **Leave Summary Report**
   - By department, by leave type, by period
   - Total days taken vs available

2. **Staff Leave History**
   - Individual leave records
   - Balance transactions

3. **Pending Approvals Report**
   - Requests awaiting action
   - Age of pending requests

4. **Leave Calendar**
   - Visual calendar showing who is on leave
   - Department-wise view

5. **Balance Report**
   - Current balances by staff
   - Projected year-end balances

6. **Audit Trail Report**
   - All actions on leave requests
   - Who did what, when

### Export Options

- PDF report generation
- Excel/CSV export
- Printable views

---

## API Endpoints

| Method | Endpoint                          | Description                    |
|--------|-----------------------------------|--------------------------------|
| POST   | /api/leave-requests               | Create new leave request       |
| GET    | /api/leave-requests               | List leave requests (filtered) |
| GET    | /api/leave-requests/:id           | Get single leave request       |
| PUT    | /api/leave-requests/:id           | Update leave request           |
| DELETE | /api/leave-requests/:id           | Delete/withdraw leave request  |
| POST   | /api/leave-requests/:id/endorse   | Endorse a request              |
| POST   | /api/leave-requests/:id/approve   | Approve a request              |
| POST   | /api/leave-requests/:id/reject    | Reject a request               |
| POST   | /api/leave-requests/:id/cancel    | Cancel approved request        |
| GET    | /api/leave-balances/:staffId      | Get staff leave balances       |
| POST   | /api/call-ins                     | Create call-in record          |

---

## Data Snapshots

Leave requests store snapshots of position and department at the time of request:

```typescript
{
  position: ObjectId,                    // Reference
  department: ObjectId,                  // Reference
  positionTitleSnapshot: "Developer",    // Snapshot
  departmentNameSnapshot: "Engineering"  // Snapshot
}
```

This ensures accurate historical records even if:
- Staff transfers to another department
- Position title changes
- Department is renamed

---

## Future Enhancements

1. **Half-day leave support**
2. **Recurring leave requests**
3. **Leave request templates**
4. **Mobile app integration**
5. **Calendar integration (Google/Outlook)**
6. **AI-based approval suggestions**
7. **Leave pooling/sharing between staff**
8. **Compensatory off tracking**
