const ts = require('typescript');
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
let user, inserted;
const admin = { from(table) {
  return { select() { return this; }, eq() { return this; }, async single() { return { data: { organisation_id: 'test-org' } }; }, async insert(data) { inserted = data; return {}; } };
} };
const mocks = {
  '@supabase/ssr': { createServerClient: () => ({ auth: { getUser: async () => ({ data: { user } }) } }) },
  '@supabase/supabase-js': { createClient: () => admin },
  'next/headers': { cookies: async () => ({ getAll: () => [], set: () => {} }) },
  'next/server': { NextResponse: { json: (body, options) => ({ body, status: options?.status ?? 200 }) } },
  '@/lib/register-access': { isViewOnlyRegisterUser: u => u.app_metadata?.workline_role === 'Article Assistant', viewOnlyRegisterResponse: () => ({ status: 403 }) },
  '@/lib/user-teams': { normalizeTeam: value => String(value ?? '').toLowerCase().replace(/[^a-z0-9]/g, ''), readPrimaryTeam: u => u.user_metadata?.team || '' }
};
const compiled = ts.transpileModule(fs.readFileSync('app/api/gstr-9-9c/route.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const exportsObject = {};
vm.runInNewContext(compiled, { exports: exportsObject, require: name => { if (!mocks[name]) throw Error(name); return mocks[name]; }, process: { env: { NEXT_PUBLIC_SUPABASE_URL: 'test', SUPABASE_SERVICE_ROLE_KEY: 'test' } }, crypto: { randomUUID: () => 'test' } });
const request = { json: async () => ({ values: { 'Client Name': 'Example', 'Team Allocation': 'Forged Team' } }) };
(async () => {
  user = { id: 'test-user', app_metadata: { workline_role: 'Manager', workline_teams: ['Team 03','Team 08'] }, user_metadata: { team: 'Team 08' } };
  assert.equal((await exportsObject.PUT(request)).status, 200); assert.equal(inserted.custom_values.values['Team Allocation'], 'Team 08');
  user.user_metadata.team = 'Team 99'; await exportsObject.PUT(request); assert.equal(inserted.custom_values.values['Team Allocation'], 'Team 03');
  user.app_metadata.workline_teams = []; user.user_metadata.team = 'Team 04'; await exportsObject.PUT(request); assert.equal(inserted.custom_values.values['Team Allocation'], 'Team 04');
  user.user_metadata.team = ''; assert.equal((await exportsObject.PUT(request)).status, 400);
  user.app_metadata.workline_role = 'Article Assistant'; assert.equal((await exportsObject.PUT(request)).status, 403);
  console.log('PASS: team is derived server-side, trusted memberships constrain preference, legacy profiles work, missing team and view-only writes rejected.');
})().catch(error => { console.error(error); process.exitCode = 1; });



