# AI Assistant Permission Configuration

## Overview
The AI assistant feature in the Nguvu Leave Management system is now accessible to all authenticated users (STAFF, HR, ADMIN, MANAGER) with data-level restrictions. Staff members can access the AI assistant but are restricted to asking questions and receiving answers related only to their own account and general leave policies.

## Environment Variable

### `AI_ASSISTANT_PERMISSIONS`
- **Description**: Comma-separated list of user permissions that are allowed to access the AI assistant
- **Default Value**: `STAFF,HR,ADMIN,MANAGER`
- **Example**: `AI_ASSISTANT_PERMISSIONS=STAFF,HR,ADMIN,MANAGER,TEAM_LEAD`

## Access Levels and Data Restrictions

### Staff Access Level
- **Can Access**: AI assistant chat, personal leave recommendations, personal leave queries
- **Data Restrictions**: 
  - Can only view and ask about their own leave data
  - Cannot access information about other staff members
  - Cannot view company-wide statistics or department analytics
  - Can ask general questions about leave policies
- **Typical Questions**:
  - "What is my current leave balance?"
  - "How many vacation days do I have left?"
  - "What's the sick leave policy?"
  - "When should I take leave to avoid conflicts?"

### Manager Access Level
- **Can Access**: All staff features plus department-level analytics
- **Data Restrictions**:
  - Can view department-level leave patterns and statistics
  - Cannot access sensitive HR data from other departments
  - Can view team member leave information within their department

### HR/Admin Access Level
- **Can Access**: All AI assistant features with full data access
- **Data Restrictions**: None - can access all company-wide data and analytics

## Configuration Options

### Option 1: Use Default Configuration
If no environment variable is set, the system will allow all authenticated users (STAFF, HR, ADMIN, MANAGER) to access the AI assistant with appropriate data restrictions.

### Option 2: Custom Configuration
Set the environment variable to customize which permissions can access the AI assistant:

```bash
# Allow only HR and Admin (no staff access)
AI_ASSISTANT_PERMISSIONS=HR,ADMIN

# Allow HR, Admin, Managers, and Team Leads (no regular staff)
AI_ASSISTANT_PERMISSIONS=HR,ADMIN,MANAGER,TEAM_LEAD

# Allow only Admin
AI_ASSISTANT_PERMISSIONS=ADMIN

# Allow all users including staff (default)
AI_ASSISTANT_PERMISSIONS=STAFF,HR,ADMIN,MANAGER
```

## Implementation Details

### Frontend Protection
- The AI assistant route (`/ai-assistant`) checks permissions in loader function
- Users without required permissions receive a 403 Forbidden error
- Error message: "You don't have permission to access the AI Assistant. This feature is restricted to authorized personnel."

### Backend Protection
- All AI controller methods check permissions before processing requests
- Permission checking is centralized in the `hasAIAssistantPermission()` helper method
- API endpoints return appropriate error messages for unauthorized access

### Permission-Based Data Restrictions (Applied Across ALL AI Methods)

#### Data Filtering Levels
- **STAFF**: Can only access their own personal data
- **MANAGER**: Can access department-level data plus their own data
- **HR/ADMIN**: Full access to all company-wide data

#### AI Methods with Permission Enforcement

1. **Chat Method** (`chat()`)
   - Fetches current user details for every conversation
   - Filters system data based on user permissions
   - Personalizes responses using actual user data
   - Enforces data restrictions in AI prompts

2. **Natural Language Query** (`processNaturalLanguageQuery()`)
   - Includes user permissions in query interpretation
   - Filters database results based on access level
   - Returns only authorized data
   - Staff users get filtered responses about their own data only

3. **Leave Recommendations** (`getLeaveRecommendations()`)
   - Uses current user's leave history and balances
   - Personalized recommendations based on user patterns
   - Staff can only get recommendations for themselves
   - Managers/HR can get recommendations for team members

4. **Pattern Analysis** (`analyzeLeavePatterns()`)
   - Accepts user permissions and applies scope restrictions
   - Staff can only analyze their own patterns
   - Managers limited to department-level analysis
   - HR/Admin can analyze company-wide patterns

5. **Report Generation** (`generateReport()`)
   - Applies permission-based data filtering at query level
   - Staff limited to personal reports
   - Managers limited to their department
   - HR/Admin can generate any scope reports

6. **System Data Context** (`getSystemDataContext()`)
   - Efficiently filters data at database query level
   - Staff users see only their own leave information
   - Managers see department + broader data
   - HR/Admin see all company data

### Data Security Enforcement Points

#### Database Query Level
- Permission filters applied directly to MongoDB queries
- Efficient data retrieval with built-in access control
- Prevents unauthorized data from being fetched

#### AI Service Level
- User access level determination in all methods
- Context-aware AI prompts with permission instructions
- Data filtering before passing to AI models

#### Controller Level
- Permission validation before calling AI services
- User context passed to all AI methods
- Consistent error handling for unauthorized access
- Permission checking is centralized in the `hasAIAssistantPermission()` helper method

### Protected Endpoints
All AI-related endpoints are protected:
- `POST /api/ai?op=recommendations`
- `GET /api/ai?op=patterns`
- `GET /api/ai?op=report`
- `POST /api/ai?op=query`
- `POST /api/ai?op=chat`
- `GET /api/ai?op=conversations`
- `GET /api/ai?op=conversation`
- `POST /api/ai?op=create-conversation`
- `POST /api/ai?op=delete-conversation`
- `POST /api/ai?op=pin-conversation`
- `POST /api/ai?op=rename-conversation`

## Security Benefits

1. **Access Control**: Prevents unauthorized users from accessing AI features
2. **Data Protection**: Limits exposure of sensitive company data to AI processing
3. **Cost Management**: Controls AI API usage by authorized personnel only
4. **Compliance**: Helps maintain regulatory compliance for data processing

## Testing

To test the permission-based access:

1. **Test with Authorized User**:
   - Login with a user having HR, ADMIN, or MANAGER permissions
   - Navigate to `/ai-assistant`
   - Should access the AI assistant successfully

2. **Test with Unauthorized User**:
   - Login with a user having only STAFF permissions
   - Navigate to `/ai-assistant`
   - Should receive a 403 Forbidden error

3. **Test API Endpoints**:
   - Make API calls to AI endpoints with different user permissions
   - Verify that unauthorized requests are rejected

## Deployment Notes

When deploying to production:
1. Set the `AI_ASSISTANT_PERMISSIONS` environment variable according to your organization's requirements
2. Ensure the variable is consistent across all application instances
3. Test with actual user accounts to verify the configuration works as expected

## Troubleshooting

### Common Issues

1. **Users Getting Access Denied Unexpectedly**
   - Check if the `AI_ASSISTANT_PERMISSIONS` environment variable is set correctly
   - Verify user permissions in the database
   - Ensure permissions are spelled correctly (case-insensitive)

2. **Environment Variable Not Working**
   - Restart the application after setting the environment variable
   - Verify the variable is properly loaded in the application environment

3. **Frontend Still Shows AI Assistant Link**
   - The UI may need to be updated to conditionally hide the AI assistant link for unauthorized users
   - Consider adding permission checks to navigation components
