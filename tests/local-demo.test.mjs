import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  buildAdminCommand,
  buildMobileCommand,
  buildDemoCommands,
  parseDemoArgs,
} from '../scripts/local-demo-utils.mjs';

const root = new URL('../', import.meta.url);

async function text(path) {
  return readFile(new URL(path, root), 'utf8');
}

test('root scripts point at the local demo launchers', async () => {
  const packageJson = JSON.parse(await text('package.json'));
  assert.equal(packageJson.scripts.admin, 'node scripts/start-admin.mjs');
  assert.equal(packageJson.scripts['mobile:web'], 'node scripts/start-mobile-web.mjs');
  assert.equal(packageJson.scripts.demo, 'node scripts/local-demo.mjs');
});

test('admin command forwards Next arguments in the admin cwd', () => {
  const command = buildAdminCommand(['--hostname', '127.0.0.1', '--port', '3001']);
  assert.equal(command.cwd.endsWith('/apps/admin'), true);
  assert.deepEqual(command.args, ['run', 'dev', '--', '--hostname', '127.0.0.1', '--port', '3001']);
  assert.equal(command.args.indexOf('--'), 2);
});

test('mobile command forwards Expo arguments in the mobile cwd', () => {
  const command = buildMobileCommand(['--port', '8083']);
  assert.equal(command.cwd.endsWith('/apps/mobile'), true);
  assert.deepEqual(command.args, ['run', 'web', '--', '--port', '8083']);
  assert.equal(command.args.indexOf('--'), 2);
});

test('demo options map ports to only their respective surfaces', () => {
  const options = parseDemoArgs(['--admin-port', '3001', '--mobile-port', '8083']);
  const commands = buildDemoCommands(options);
  assert.deepEqual(commands.admin.args.slice(-4), ['--hostname', '127.0.0.1', '--port', '3001']);
  assert.deepEqual(commands.mobile.args.slice(-2), ['--port', '8083']);
  assert.doesNotMatch(commands.admin.args.join(' '), /8083/);
  assert.doesNotMatch(commands.mobile.args.join(' '), /3001|127\.0\.0\.1/);
  assert.equal(JSON.stringify(commands).match(/SUPABASE|API|KEY/gi), null);
});

test('demo parser rejects malformed, unknown, out-of-range, and duplicate ports', () => {
  for (const args of [
    ['--unknown'],
    ['--admin-port'],
    ['--mobile-port', 'abc'],
    ['--admin-port', '0'],
    ['--mobile-port', '65536'],
    ['--admin-port', '3000', '--mobile-port', '3000'],
  ]) {
    assert.throws(() => parseDemoArgs(args), /Invalid|Unknown|requires|between|different/);
  }
});

test('demo fallback branches remain present in both surfaces', async () => {
  const mobile = await text('apps/mobile/src/lib/verification.ts');
  const admin = await text('apps/admin/src/lib/verifications.ts');
  assert.match(mobile, /Demo mode is active/);
  assert.match(admin, /Demo mode is active|demo/i);
  assert.match(mobile, /SUPABASE|supabase/i);
  assert.match(admin, /SUPABASE|supabase/i);
});
