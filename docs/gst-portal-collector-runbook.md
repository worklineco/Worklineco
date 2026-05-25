# GST Portal Collector Runbook

This collector runs on the local Windows machine because the GST portal needs
manual CAPTCHA, browser login, and local credential handling. Do not run this
inside Vercel.

## 1. Prepare Excel

Create this file:

```text
C:\Users\SOMYA JAIN\Downloads\WorkLineCo.xlsx
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

The script will:

1. Read `Downloads\WorkLineCo.xlsx`.
2. Open the GST portal login page in Chrome or Edge.
3. Try to fill the GST user ID and password.
4. Wait while you manually solve CAPTCHA and sign in.
5. Wait while you open the litigation, notices, or proceedings table.
6. Extract visible table rows.
7. Save output under `collector-output`.

## 3. Verify Output

The first output is intentionally local JSON, for example:

```text
collector-output\gst-litigation-<GSTIN>-2026-05-25.json
```

Once the headers and rows are confirmed, the next step is to sync the extracted
rows into Supabase table `gst_litigation_cases`.

## Security Rules

- GST portal passwords stay in `Downloads\WorkLineCo.xlsx` only.
- Collector output is gitignored.
- CAPTCHA is always solved manually.
- The website should store litigation rows, not GST portal passwords.
