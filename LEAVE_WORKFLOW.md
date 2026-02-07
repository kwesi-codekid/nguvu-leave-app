# Leave Request Workflow Guide

This document explains how the leave request system works, including the roles, permissions, and setup required.

---

## Overview

The leave request system follows a **two-step approval process**:

```
Staff Creates Request → Manager Endorses → HR/Admin Approves → Leave Granted
```

---

## Roles in the System

| Role | What They Can Do |
|------|------------------|
| **Staff** | Create leave requests, view their own requests, withdraw pending requests |
| **Manager** | Everything Staff can do + Endorse leave requests from their team |
| **HR/Admin** | Everything Manager can do + Approve endorsed requests, create emergency leave, manage all requests |

> **Important:** ALL users can create leave requests for themselves, regardless of their permission level. A Manager can request leave, an HR person can request leave, even an Admin can request leave. The permissions only determine what EXTRA actions they can perform (endorsing, approving, etc.).

---

## Understanding Endorsement vs Approval

### Endorsement (First Step)
- Done by the **direct supervisor/manager**
- Validates that the team can manage without the staff member
- Based on **job position hierarchy**

### Approval (Second Step)
- Done by **HR or Admin**
- Final authorization for the leave
- Deducts days from leave balance

---

## Leave Request Statuses

| Status | Meaning |
|--------|---------|
| `pending` | Waiting for endorsement |
| `endorsed` | Manager endorsed, waiting for HR approval |
| `approved` | HR approved, leave is confirmed |
| `rejected` | Request was rejected (at endorsement or approval stage) |
| `withdrawn` | Staff cancelled their own request |

---

## Setup Requirements

### For a Staff Member to Create Leave Requests

The staff member needs:

1. **Active Status** - Account must be active
2. **Active Contract** - Must have a contract assigned with status "active"
3. **Leave Balance** - Must have leave balance for the current year

### For a Manager to Endorse Requests

The manager needs:

1. **MANAGER Permission** - Must have "MANAGER" in their permissions (or HR/ADMIN)
2. **Active Contract** - Must have an active contract assigned to a position
3. **Position Match** - Their position must be set as the `endorserPosition` on the staff's job position

### For HR/Admin to Approve Requests

The HR/Admin needs:

1. **HR or ADMIN Permission** - Must have "HR" or "ADMIN" in their permissions
2. **Active Contract** - Must have an active contract assigned to a position
3. **Position Match** - Their position must be set as the `approverPosition` on the staff's job position

---

## Step-by-Step Setup Guide

### Step 1: Create Departments

Go to **Departments** page and create your departments:
- Engineering
- Human Resources
- Finance
- etc.

### Step 2: Create Job Positions

Go to **Job Positions** page and create positions for each department.

**Example positions:**
| Position Title | Department | Max Occupancy |
|---------------|------------|---------------|
| Software Developer | Engineering | 10 |
| Team Lead | Engineering | 2 |
| HR Manager | Human Resources | 1 |
| HR Officer | Human Resources | 3 |

### Step 3: Configure Endorser & Approver Chain

This is the **most important step**. For each position, you must set:

- **Endorser Position**: Which position endorses leave requests
- **Approver Position**: Which position gives final approval

**Example configuration:**

| Position | Endorser Position | Approver Position |
|----------|-------------------|-------------------|
| Software Developer | Team Lead | HR Manager |
| Team Lead | HR Manager | HR Manager |
| HR Officer | HR Manager | HR Manager |
| HR Manager | *(none or self)* | *(none or self)* |

**How to set this:**
1. Go to Job Positions page
2. Click Edit on a position
3. Select the Endorser Position from the dropdown
4. Select the Approver Position from the dropdown
5. Save

### Step 4: Create Staff Members

Go to **Staff** page and create staff members with:
- Name, Phone, Email
- Department
- Gender
- Permissions (STAFF, MANAGER, HR, ADMIN)

**Important:**
- Give the Team Lead the `MANAGER` permission
- Give HR staff the `HR` permission

### Step 5: Assign Contracts

Go to **Contracts** page and create contracts:

1. Click "Add Contract"
2. Select the Staff Member
3. Select their Job Position
4. Set Start Date
5. Click "Create Contract"
6. **Important:** Click the "Activate" button to activate the contract

**You must create and activate contracts for:**
- All staff members who will request leave
- All managers who will endorse leave
- All HR staff who will approve leave

### Step 6: Create Leave Balances

Run the seed script to create leave balances for all staff:

```bash
npx tsx scripts/seed-leave-balances.ts
```

This creates balances for:
- Annual Leave (21 days)
- Sick Leave (10 days)
- Maternity Leave (90 days - females only)
- Paternity Leave (7 days - males only)
- Bereavement Leave (5 days)

---

## Example Scenario

### Setup:
- **John** is a Software Developer (has STAFF permission)
- **Sarah** is a Team Lead (has MANAGER permission)
- **Mary** is HR Manager (has HR permission)

### Position Configuration:
- Software Developer position has:
  - Endorser Position = Team Lead
  - Approver Position = HR Manager

### Contracts:
- John has active contract as Software Developer
- Sarah has active contract as Team Lead
- Mary has active contract as HR Manager

### Workflow:
1. **John** logs in and creates a leave request for 5 days
2. **Sarah** logs in, goes to "Pending Endorsements" tab, sees John's request, and endorses it
3. **Mary** logs in, goes to "Pending Approvals" tab, sees John's endorsed request, and approves it
4. **John's** leave is now approved and 5 days are deducted from his balance

---

## Troubleshooting

### "I can't create a leave request"

Check if you have:
- [ ] An active contract (go to Contracts page)
- [ ] Leave balance for the current year (run the seed script)
- [ ] Active account status

### "I'm a Manager but can't see pending endorsements"

Check if you have:
- [ ] An **active contract** assigned to you
- [ ] Your position is set as the `endorserPosition` on the staff's job position
- [ ] The leave request status is `pending` (not already endorsed)

### "I'm HR but can't see pending approvals"

Check if you have:
- [ ] An **active contract** assigned to you
- [ ] Your position is set as the `approverPosition` on the staff's job position
- [ ] The leave request status is `endorsed` (must be endorsed first before approval)

### "The endorser/approver dropdowns are empty"

You need to create job positions first. The dropdowns show existing positions that can be selected as endorser/approver.

---

## Permission Summary

**Everyone can create leave requests for themselves!**

| Permission | Can Create Leave | Can Endorse | Can Approve | Can See All Requests |
|------------|-----------------|-------------|-------------|---------------------|
| STAFF | Yes (own) | No | No | No (own only) |
| MANAGER | Yes (own) | Yes* | No | No |
| HR | Yes (own) | Yes* | Yes* | Yes |
| ADMIN | Yes (own) | Yes* | Yes* | Yes |

*Requires active contract with matching position in the approval chain

### Examples:
- A **Manager** wants to take annual leave → They create a request, another Manager or HR endorses it, HR approves it
- An **HR Officer** wants to take sick leave → They create a request, HR Manager endorses it, HR Manager approves it
- A **Staff** wants to take leave → They create a request, their Manager endorses it, HR approves it

---

## Visual Workflow

```
┌─────────────────────────────────────────────────────────────────┐
│                     LEAVE REQUEST WORKFLOW                       │
└─────────────────────────────────────────────────────────────────┘

    ┌──────────┐
    │  STAFF   │
    │ Creates  │
    │ Request  │
    └────┬─────┘
         │
         ▼
    ┌──────────┐      Status: PENDING
    │ PENDING  │◄──── Waiting for endorsement
    └────┬─────┘
         │
         │  Manager with matching
         │  endorserPosition endorses
         ▼
    ┌──────────┐      Status: ENDORSED
    │ ENDORSED │◄──── Waiting for approval
    └────┬─────┘
         │
         │  HR/Admin with matching
         │  approverPosition approves
         ▼
    ┌──────────┐      Status: APPROVED
    │ APPROVED │◄──── Leave granted, balance deducted
    └──────────┘


    Alternative paths:

    PENDING ──► REJECTED (Manager rejects)
    ENDORSED ──► REJECTED (HR rejects)
    PENDING/ENDORSED ──► WITHDRAWN (Staff withdraws)
```

---

## Quick Checklist for New Setup

- [ ] Create at least one department
- [ ] Create job positions (e.g., Developer, Manager, HR)
- [ ] Set endorser/approver positions on each job position
- [ ] Create staff members with appropriate permissions
- [ ] Create and **activate** contracts for all staff
- [ ] Run leave balance seed script
- [ ] Test the workflow with a sample leave request
