# GST Portal Collector Plan

The GST portal collector should run locally on each user's machine, not inside
Vercel. Vercel cannot access a user's local Excel file, cannot keep a logged-in
browser session for the GST portal, and should not store GST portal credentials.

## First Client Input

Use an Excel file in each user's Downloads folder by default:

```text
<User Home>/Downloads/WorkLineCo.xlsx
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

1. Read the user's selected local Excel file.
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
8. Optionally save local HTML snapshots when selectors need diagnosis.
9. After selectors and headers are confirmed, sign into WorkLine as the local
   user and upsert rows into `gst_litigation_cases` using Supabase RLS.

For `worklineco.com`, the page button calls a helper on the user's own computer
at `http://127.0.0.1:48782`. The helper starts the collector locally, opens the
GST portal, finds the selected GSTIN in Excel column A, fills credentials from
columns B and C, and clicks login. This keeps the live Vercel app as the control
surface while the browser and credentials remain local.

## Security Rule

Do not store GST portal passwords in WorkLine's cloud database. Use the user's
local Excel file only for the collector run.

The collector may ask for the user's WorkLine login when `--sync` is used. That
login is used only to create a Supabase session for the current run, so the
database still applies organisation-level RLS and the collector never needs a
service-role key.
