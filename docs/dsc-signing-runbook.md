# DSC PDF Signing (direct) - Runbook

WorkLine signs PDFs with the user's DSC USB token directly from
**Tools -> PDF & Indexing -> DSC filing**. No GSTSigner, emSigner, NIC tool,
or separate signer utility is needed on the PC.

## How it works

1. **Browser** (`lib/pdf-signing.ts`): draws the visible signature box
   (name + date/time + reason) on the chosen pages, adds the signature field
   with `/ByteRange` + `/Contents` placeholders, writes the real byte range.
2. **Local helper** (`scripts/dsc-signing-server.mjs`, v12, port 48783):
   - `GET /health` - helper status
   - `GET /certificates` - DSC certificates from the Windows store
     (`Cert:\CurrentUser\My`, valid + private key)
   - `POST /sign` - hashes the byte range and creates a detached CMS/PKCS#7
     signature via Windows CryptoAPI (PowerShell `SignedCms`). The token's
     CSP shows the PIN prompt. The helper embeds the signature and returns
     the signed PDF.
3. The signed file downloads as `<name>-signed.pdf` with a standard
   `adbe.pkcs7.detached` signature that Adobe Reader recognises.

## Per-PC setup (once)

1. Install the DSC token driver (ePass / ProxKey / mToken etc.) so the
   certificate appears in Windows (`certmgr.msc` -> Personal).
2. Run **Install DSC helper** from the DSC filing dialog
   (`/WorkLineDSCHelperSetup.vbs`). It installs to
   `%LOCALAPPDATA%\WorkLine\DSCHelper`, auto-starts at sign-in.
3. In WorkLine, open DSC filing and click **Check** - the certificate list
   should appear when the token is inserted.

PCs that already have an older helper see an **Update DSC helper** button;
running the same installer once upgrades them to v12.

## Releasing helper changes

1. Edit `scripts/dsc-signing-server.mjs`; bump `HELPER_VERSION`.
2. Bump the bundle name in `scripts/build-dsc-helper-bundle.mjs`,
   `scripts/install-workline-dsc-helper.ps1`, and
   `scripts/WorkLineDSCHelperSetup.vbs`, and
   `DSC_HELPER_REQUIRED_VERSION` in `app/pdf-indexing/page.tsx` if the web
   app requires the new version.
3. Run `npm run dsc:helper:bundle` and commit the new
   `public/dsc-helper-bundle-vNN.zip`.

## Testing without a token

`node scripts/test-dsc-pipeline.mjs <bundled lib/pdf-signing>` runs the whole
pipeline with an openssl software certificate and verifies the embedded CMS.
Bundle first: `npx esbuild lib/pdf-signing.ts --bundle --format=esm
--external:pdf-lib --outfile=.tmp-pdf-signing.mjs`.

## Known limits

- Signing an already digitally signed PDF re-writes the file, which
  invalidates the earlier signature (WorkLine signs the latest content).
- Password-protected PDFs are rejected with a clear message.
- macOS/Linux PCs get a "Windows required" message and can use the manual
  signing pack instead.
