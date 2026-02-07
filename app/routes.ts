import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
    // Auth routes (login-email is the index/default route)
    index("routes/login-email.tsx"),
    route("request-otp", "routes/request-otp.tsx"),
    route("verify-otp", "routes/verify-otp.tsx"),

    // App routes
    route("dashboard", "routes/dashboard.tsx"),
    route("staff", "routes/staff.tsx"),
    route("departments", "routes/departments.tsx"),
    route("job-positions", "routes/job-positions.tsx"),
    route("contracts", "routes/contracts.tsx"),
    route("holidays", "routes/holidays.tsx"),
    route("leave-requests", "routes/leave-requests.tsx"),
    route("leave-calendar", "routes/leave-calendar.tsx"),
    route("call-ins", "routes/call-ins.tsx"),
    route("reports", "routes/reports.tsx"),
    route("audit-logs", "routes/audit-logs.tsx"),
    route("ai-assistant", "routes/ai-assistant.tsx"),
    route("profile", "routes/profile.tsx"),
    route("logout", "routes/logout.tsx"),
    route("api-doc", "routes/api-doc.tsx"),

    // API routes
    route("api/auth", "routes/api/auth.ts"),
    route("api/staff", "routes/api/staff.ts"),
    route("api/staff/:id", "routes/api/staff.[id].ts"),
    route("api/departments", "routes/api/departments.ts"),
    route("api/departments/:id", "routes/api/departments.[id].ts"),
    route("api/job-positions", "routes/api/job-positions.ts"),
    route("api/job-positions/:id", "routes/api/job-positions.[id].ts"),
    route("api/contracts", "routes/api/contracts.ts"),
    route("api/contracts/:id", "routes/api/contracts.[id].ts"),
    route("api/holidays", "routes/api/holidays.ts"),
    route("api/holidays/:id", "routes/api/holidays.[id].ts"),
    route("api/leave-requests", "routes/api/leave-requests.ts"),
    route("api/leave-requests/:id", "routes/api/leave-requests.[id].ts"),
    route("api/leave-balances", "routes/api/leave-balances.ts"),
    route("api/leave-calendar", "routes/api/leave-calendar.ts"),
    route("api/call-ins", "routes/api/call-ins.ts"),
    route("api/call-ins/:id", "routes/api/call-ins.[id].ts"),
    route("api/reports", "routes/api/reports.ts"),
    route("api/audit-logs", "routes/api/audit-logs.ts"),
    route("api/audit-logs/:id", "routes/api/audit-logs.[id].ts"),
    route("api/dashboard", "routes/api/dashboard.ts"),
    route("api/notifications", "routes/api/notifications.ts"),
    route("api/notifications/:id", "routes/api/notifications.[id].ts"),
    route("api/ai", "routes/api/ai.ts"),

    // Notifications page
    route("notifications", "routes/notifications.tsx"),

    // Catch-all
    route("*", "routes/$.tsx"),
] satisfies RouteConfig;
