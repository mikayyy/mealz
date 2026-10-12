#!/usr/bin/env node
import {readFileSync} from 'node:fs';
import {validateRelease} from './release-contract.js';
const read = path => readFileSync(new URL(`../${path}`, import.meta.url),'utf8');
const checks = validateRelease({pkg:JSON.parse(read('package.json')),html:read('index.html'),readme:read('README.md'),changelog:read('CHANGELOG.md')});
for(const check of checks) console.log(`${check.pass ? 'ok' : 'FAIL'}: ${check.name}`);
process.exitCode = checks.every(check=>check.pass) ? 0 : 1;