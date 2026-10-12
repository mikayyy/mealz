import test from 'node:test';
import assert from 'node:assert/strict';
import {validateRelease} from '../scripts/release-contract.js';
const fixture = () => ({pkg:{version:'0.23.0',release:{state:'candidate'}},html:'<title>mealz v0.23.0</title><script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.116.0"></script>',readme:'## Current release\n\n**v0.23.0** (release candidate; unreleased)\n\n## History\n**v0.22.0**',changelog:'# Changelog\n\n## v0.23.0 — release candidate (unreleased)\n\n## v0.22.0 — 2026-09-25'});
const passes = input => validateRelease(input).every(check=>check.pass);
test('consistent candidate passes',()=>assert.equal(passes(fixture()),true));
/** @type {Array<[string, (f: ReturnType<typeof fixture>) => void]>} */
const cases = [
  ['historical README version is insufficient',f=>{f.readme='## Current release\n**v0.22.0** (released)\n## History\n**v0.23.0**'}],
  ['title prefix is insufficient',f=>{f.html=f.html.replace('v0.23.0<','v0.23.01<')}],
  ['candidate cannot claim released README',f=>{f.readme=f.readme.replace('release candidate; unreleased','released')}],
  ['candidate cannot claim dated release',f=>{f.changelog=f.changelog.replace('release candidate (unreleased)','2026-10-06')}],
  ['historical changelog entry is insufficient',f=>{f.changelog='## v0.24.0 — release candidate (unreleased)\n'+f.changelog}],
  ['duplicate current sections fail',f=>{f.readme+='\n## Current release\n**v0.23.0** (release candidate; unreleased)'}],
  ['second unpinned SDK script fails',f=>{f.html+='<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>'}]
];
for(const [name,modify] of cases) test(name,()=>{const f=fixture();modify(f);assert.equal(passes(f),false)});
