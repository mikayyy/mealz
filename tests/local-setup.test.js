import test from 'node:test';
import assert from 'node:assert/strict';
import {validateLocalSettings} from '../scripts/local-supabase-lib.mjs';

test('local setup refuses hosted and non-loopback endpoints',()=>{
  for(const API_URL of ['https://example.supabase.co','http://192.168.1.2:54321','http://127.0.0.1:54322','https://localhost:54321','http://localhost:54321/remote','http://credentials@localhost:54321']){
    assert.throws(()=>validateLocalSettings({API_URL,PUBLISHABLE_KEY:'local-public',SECRET_KEY:'local-secret'}),/Only the local Supabase API/);
  }
});
test('local setup preserves separation of public and secret key mappings',()=>{
  assert.deepEqual(validateLocalSettings({API_URL:'http://127.0.0.1:54321',PUBLISHABLE_KEY:'public',SECRET_KEY:'secret'}),{url:'http://127.0.0.1:54321',publicKey:'public',secretKey:'secret'});
  assert.deepEqual(validateLocalSettings({API_URL:'http://localhost:54321',ANON_KEY:'legacy-public',SERVICE_ROLE_KEY:'legacy-secret'}),{url:'http://localhost:54321',publicKey:'legacy-public',secretKey:'legacy-secret'});
});
test('local setup fails when either credential class is missing',()=>{
  for(const status of [{API_URL:'http://127.0.0.1:54321',SECRET_KEY:'secret'},{API_URL:'http://127.0.0.1:54321',PUBLISHABLE_KEY:'public'}])assert.throws(()=>validateLocalSettings(status),/credentials are incomplete/);
});
