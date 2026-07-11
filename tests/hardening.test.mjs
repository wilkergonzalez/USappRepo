import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);

async function text(path) {
  return readFile(new URL(path, root), 'utf8');
}

test('mobile exposes a real typecheck script', async () => {
  const packageJson = JSON.parse(await text('apps/mobile/package.json'));
  assert.equal(packageJson.scripts.typecheck, 'tsc --noEmit');
});

test('root verification scripts call package scripts', async () => {
  const packageJson = JSON.parse(await text('package.json'));
  assert.equal(packageJson.scripts['mobile:typecheck'], 'npm --prefix apps/mobile run typecheck');
  assert.equal(packageJson.scripts['admin:lint'], 'npm --prefix apps/admin run lint');
  assert.equal(packageJson.scripts.test, 'node --test tests/hardening.test.mjs');
});

test('CI runs the real verification gates', async () => {
  const ci = await text('.github/workflows/ci.yml');
  assert.match(ci, /run: npm run mobile:typecheck/);
  assert.doesNotMatch(ci, /npm --prefix apps\/mobile exec tsc/);
  assert.match(ci, /run: npm --prefix apps\/mobile ci/);
  assert.match(ci, /run: npm run admin:lint/);
  assert.match(ci, /run: npm test/);
});

test('mobile Supabase client has explicit persistent storage', async () => {
  const source = await text('apps/mobile/src/lib/supabase.ts');
  assert.match(source, /@react-native-async-storage\/async-storage/);
  assert.match(source, /storage:\s*AsyncStorage/);
  assert.match(source, /persistSession:\s*true/);
  assert.match(source, /flowType:\s*['"]pkce['"]/);
});

test('admin review RPC uses a caller-scoped client', async () => {
  const supabase = await text('apps/admin/src/lib/supabase.ts');
  const verifications = await text('apps/admin/src/lib/verifications.ts');
  assert.match(supabase, /getAdminUserClient/);
  assert.match(verifications, /getAdminUserClient\(input\.accessToken\)/);
  assert.match(verifications, /\.rpc\(['"]review_verification_submission/);
});

test('hardening migration removes profile self-insert and storage updates', async () => {
  const migration = await text('supabase/migrations/20260710_003_hardening.sql');
  assert.match(migration, /drop policy if exists profiles_insert_own on public\.profiles/i);
  assert.match(migration, /drop policy if exists verification_documents_update_own/i);
  assert.match(migration, /verification_documents_delete_unsubmitted/);
  assert.match(migration, /verification_one_pending_per_user_idx/);
  assert.match(migration, /invalid_storage_path/);
  assert.match(migration, /submission_fields_immutable/);
  assert.match(migration, /app\.verification_submission_rpc/);
  assert.match(migration, /pending_submission_exists/);
});

test('security-definer RPC grants are explicit', async () => {
  const migration = await text('supabase/migrations/20260710_003_hardening.sql');
  for (const functionName of [
    'is_admin',
    'save_my_profile',
    'submit_verification_document',
    'cast_bill_vote',
    'review_verification_submission',
  ]) {
    assert.match(migration, new RegExp(`grant execute on function public\\.${functionName}`));
    assert.match(migration, new RegExp(`revoke execute on function public\\.${functionName}`));
  }
});
