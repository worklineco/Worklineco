# GST Portal Collector Runbook

This collector runs on each user's local machine because the GST portal needs
manual CAPTCHA, browser login, and local credential handling. Do not run this
inside Vercel. The WorkLine web app is shared by every organisation; the GST
collector is a local helper that every authorised user can run for their own
assigned clients.

## 1. Prepare Excel

Create this file on the user's own computer:

```text
<User Home>\Downloads\WorkLineCo.xlsx
```

For the first client, fill row 2:

```text
A2 = GSTIN
B2 = GST portal user ID
C2 = GST portal password
```

Later, each next row can hold another client.

## 2. Run Collector

From the project folder:

```bash
npm run gst:collector
```

To use another Excel file:

```bash
npm run gst:collector -- --file "D:\GST\WorkLineCo.xlsx"
```

To read a different client row:

```bash
npm run gst:collector -- --row 3
```

The script will:

1. Read the user's local Excel file.
2. Open the GST portal login page in Chrome or Edge.
3. Try to fill the GST user ID and password.
4. Wait while you manually solve CAPTCHA and sign in.
5. Wait while you open the litigation, notices, or proceedings table.
6. Extract visible table rows.
7. Save output under `collector-output`.

From the GST Litigation Monitor, the `Get data` button starts this same local
collector in login-only mode for the selected GSTIN. It finds the selected GSTIN
in column A of the Excel file, opens `https://services.gst.gov.in/services/login`,
and fills the portal user ID and password from columns B and C. It clicks the GST
portal login button, then the user still handles any CAPTCHA or portal prompt
manually.

When using the live WorkLine site at `https://worklineco.com/gst`, start the
local helper first:

```bash
npm run gst:helper
```

Keep that helper window open, then click `Get data` on `worklineco.com/gst`.
The live site calls the helper at `http://127.0.0.1:48782`, so Vercel never sees
the GST portal password and never tries to run a browser session in the cloud.

Useful options:

```bash
npm run gst:collector -- --save-html
```

Saves local HTML snapshots under `collector-output\debug` so selectors can be
adjusted if the GST portal table changes.

```bash
npm run gst:collector -- --out "D:\GST\collector-output"
```

Writes extracted JSON and debug files to a custom local folder.

## 3. Verify Output

The first output is intentionally local JSON, for example:

```text
collector-output\gst-litigation-<GSTIN>-2026-05-25.json
```

Once the headers and rows are confirmed, the next step is to sync the extracted
rows into Supabase table `gst_litigation_cases`.

## 4. Sync Rows Into WorkLine

After the local JSON is verified for the client, run:

```bash
npm run gst:collector -- --sync --workline-email "user@example.com"
```

The collector will prompt for the WorkLine password if it is not passed through
`--workline-password` or the temporary `WORKLINE_PASSWORD` environment variable.
It signs into Supabase as that WorkLine user, resolves the user's organisation
through RLS, finds or creates the matching GSTIN registration, and upserts only
the extracted litigation rows.

To name a new GSTIN registration if it does not already exist:

```bash
npm run gst:collector -- --sync --client-name "Acme Private Limited"
```

To test extraction and file output without sending rows to Supabase:

```bash
npm run gst:collector -- --sync --dry-run
```

## Security Rules

- GST portal passwords stay in the user's local Excel file only.
- WorkLine passwords are used only for the current sync session and are not
  written to collector output.
- Collector output is gitignored.
- CAPTCHA is always solved manually.
- The website should store litigation rows, not GST portal passwords.
