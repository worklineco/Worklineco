# WorkLine Co

Fresh foundation for WorkLine: a configurable ERP and workflow operating system
for professional firms.

## Current Scope

- Next.js app shell
- ERP module map
- Configurable role and hierarchy planning
- Organisation subscription state logic
- Supabase foundation schema draft
- Product foundation notes
- Web scraping guardrails

## Development

```bash
npm install
npm run dev
```

Open `http://localhost:3001` when running the dev server with `npm run dev -- -p 3001`.

## Infrastructure Plan

- GitHub for source control
- Supabase for auth, database, storage, and RLS
- Vercel for deployment
- GoDaddy DNS pointed to Vercel
- Domain: `worklineco.com`
- GitHub repository name: `worklineco`

See `docs/integration-runbook.md` for the exact connection order.

## Important Direction

The business layer should be configurable. The security layer should be strict.
