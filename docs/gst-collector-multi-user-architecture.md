# GST Collector Multi-User Architecture

The WorkLine web app must serve many organisations and many users. GST portal
collection therefore has two parts:

## Cloud App

- Runs on Vercel.
- Stores organisations, users, roles, GSTINs, and litigation rows in Supabase.
- Enforces tenant isolation through `organisation_id` and RLS.
- Never stores GST portal passwords.

## Local Collector

- Runs on the user's own computer.
- Reads that user's local Excel file.
- Opens the GST portal in Chrome or Edge.
- Lets the user solve CAPTCHA manually.
- Extracts visible litigation, notices, or proceedings rows.
- Sends only extracted case rows back to WorkLine.

## Why This Is Required

Vercel cannot access a user's `Downloads` folder, cannot use an already trusted
desktop browser profile, and should not hold GST portal credentials. A local
collector keeps credentials under the user's control while the cloud app remains
multi-tenant and scalable.

## Product Path

1. Current: one-time Windows setup from the GST page installs the helper to
   `%LOCALAPPDATA%\WorkLine\GSTHelper`, registers `workline-gst://`, and starts
   the helper at sign-in.
2. Next: signed `.exe` installer (no PowerShell command for end users).
3. Later: organisation admin controls who can run GST sync and which GSTINs each
   user may collect.
