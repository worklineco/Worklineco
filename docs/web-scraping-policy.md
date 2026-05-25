# Web Scraping Policy

WorkLine Co can support scraping and intake automation, but it should prefer
official APIs, webhooks, exports, and user-authorised integrations wherever
available.

## Suitable Uses

- Reading publicly available compliance pages where permitted.
- Importing client-provided data from portals after explicit authorisation.
- Monitoring pages that allow automated access.
- Extracting metadata from uploaded documents and emails.

## Guardrails

- Respect robots.txt and site terms.
- Do not bypass logins, captchas, paywalls, or access controls.
- Prefer rate limits and cached pulls.
- Store source URL, pulled timestamp, and extraction confidence.
- Keep scraping jobs organisation-scoped.
- Review legal and contractual restrictions before using scraped data in
  production workflows.

## Recommended Approach

Start with manual uploads and official APIs. Add scraping only for specific,
approved workflows where no safer integration exists.
