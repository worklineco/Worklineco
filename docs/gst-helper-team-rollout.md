# GST Helper — Rollout for 50+ Laptops (Self-Serve)

Each person installs **once** on their own laptop. You do not need to visit each PC.

## Send this to your team (copy/paste)

**Subject: One-time setup for GST “Get data” on WorkLine**

1. Open **https://worklineco.com/gst** and sign in.
2. Click **Download GST helper (Windows)**.
3. Open your **Downloads** folder → right-click **WorkLineGSTHelper-Windows.zip** → **Extract All**.
4. Open the extracted folder → double-click **Install WorkLine GST Helper.bat**.
   - If Windows warns you: click **More info** → **Run anyway** (do not use the old .vbs file).
5. On the website, click **Check helper connection**.
6. Put client GST portal login in **Downloads\WorkLineCo.xlsx** (column A = GSTIN, B = user ID, C = password).
7. Use **Get data** as usual (solve CAPTCHA in the browser when it opens).

**Time:** about 5–10 minutes first time (mostly download size).

## If Windows “Smart App Control” blocks the install

- Do **not** use `WorkLineGSTHelperSetup.vbs`.
- Use the **ZIP** and **.bat** file steps above.
- On the warning: **More info** → **Run anyway**.

## Verify on one laptop before emailing everyone

Open in browser: `http://127.0.0.1:48782/health`  
Should show: `{"status":"ready"}`

## Deploy note (you)

Each production deploy must build the ZIP:

```bash
npm run gst:helper:portable
```

This runs automatically in `npm run build` on Vercel.

Live file: `https://worklineco.com/WorkLineGSTHelper-Windows.zip`
