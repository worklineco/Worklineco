# GST Portal Collector Plan

The GST portal collector should run locally on the user's machine, not inside
Vercel. Vercel cannot access `Downloads`, cannot keep a logged-in browser
session for the GST portal, and should not store GST portal credentials.

## First Client Input

Use an Excel file in Downloads:

```text
Downloads/WorkLineCo.xlsx
```

For the first client:

```text
A2 = GSTIN
B2 = GST portal user ID
C2 = GST portal password
```

Later, each row can represent another client:

```text
A = GSTIN
B = User ID
C = Password
```

## Collector Flow

1. Read `Downloads/WorkLineCo.xlsx`.
2. Open GST portal in a local browser.
3. Fill user ID and password.
4. Pause for the user to manually solve CAPTCHA.
5. Navigate to litigation/notices/proceedings area.
6. Extract columns:
   - S.No.
   - Type of Notice
   - Description
   - Ref ID
   - Date of Issue
   - Case ID
   - Status
   - Tax Period
   - Due Date
   - Section
   - Reply Filing
7. Save extracted rows into `collector-output` for first-run verification.
8. After selectors and headers are confirmed, upsert rows into
   `gst_litigation_cases` using Supabase.

## Security Rule

Do not store GST portal passwords in WorkLine's cloud database. Use the local
Excel file only for the collector run.
