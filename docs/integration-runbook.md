# WorkLine Co Integration Runbook

This is the service connection order for WorkLine Co.

## 1. GitHub

Create a new GitHub repository for only the `WorkLine Co` app, not the older
parent workspace files.

Recommended repository name:

```text
worklineco
```

Connect method:

```bash
git init
git add .
git commit -m "Initial WorkLine Co foundation"
git branch -M main
git remote add origin https://github.com/YOUR_ACCOUNT/worklineco.git
git push -u origin main
```

## 2. Supabase

Create a Supabase project and save these values in `.env.local`:

```text
NEXT_PUBLIC_SUPABASE_URL=https://yowylsissueyznenvgmb.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```

Run the foundation SQL from:

```text
database/001_foundation_schema.sql
```

Authentication setting:

```text
User email = login id
```

## 3. Vercel

Import the GitHub repository into Vercel.

Project settings:

```text
Framework: Next.js
Root directory: .
Build command: npm run build
Install command: npm install
```

Add the same Supabase environment variables in Vercel.

## 4. GoDaddy Domain

After Vercel creates the project, add the domain in Vercel first.

Recommended product URL:

```text
app.worklineco.com
```

The root domain can also point to the app:

```text
worklineco.com
```

Then update GoDaddy DNS with the records Vercel provides. Usually this is:

```text
Type: CNAME
Name: app
Value: cname.vercel-dns-0.com or the exact CNAME shown by Vercel
```

If using the root domain, Vercel may ask for:

```text
Type: A
Name: @
Value: 76.76.21.21
```

Always follow the exact Vercel project instructions shown after adding the
domain.

## 5. Production Checks

- App opens on Vercel URL
- App opens on GoDaddy domain
- HTTPS certificate is active
- Supabase auth works
- Supabase RLS blocks cross-organisation data
- Payment status gates restrict suspended organisations
