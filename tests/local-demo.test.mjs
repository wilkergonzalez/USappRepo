import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import net from 'node:net';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import {
  buildAdminCommand,
  buildMobileCommand,
  buildDemoCommands,
  parseDemoArgs,
  assertPortAvailable,
  spawnManaged,
  terminateManaged,
} from '../scripts/local-demo-utils.mjs';

const root = new URL('../', import.meta.url);
const repoPath = fileURLToPath(root);

async function freePort() {
  const server = net.createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const { port } = server.address();
  await new Promise((resolve) => server.close(resolve));
  return port;
}

function waitForOutput(child, pattern, timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    let output = '';
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`Timed out waiting for ${pattern}`));
    }, timeoutMs);
    const onData = (chunk) => {
      output += chunk.toString();
      if (pattern.test(output)) {
        cleanup();
        resolve(output);
      }
    };
    const onClose = () => {
      cleanup();
      reject(new Error(`Launcher exited before ${pattern}`));
    };
    const cleanup = () => {
      clearTimeout(timer);
      child.stdout?.off('data', onData);
      child.stderr?.off('data', onData);
      child.off('close', onClose);
    };
    child.stdout?.on('data', onData);
    child.stderr?.on('data', onData);
    child.once('close', onClose);
  });
}

async function text(path) {
  return readFile(new URL(path, root), 'utf8');
}

test('root scripts point at the local demo launchers', async () => {
  const packageJson = JSON.parse(await text('package.json'));
  assert.equal(packageJson.scripts.admin, 'node scripts/start-admin.mjs');
  assert.equal(packageJson.scripts['mobile:web'], 'node scripts/start-mobile-web.mjs');
  assert.equal(packageJson.scripts.demo, 'node scripts/local-demo.mjs');
});

test('launchers provide deterministic defaults', () => {
  assert.deepEqual(buildAdminCommand().args, ['run', 'dev', '--', '--hostname', '127.0.0.1', '--port', '3000']);
  assert.deepEqual(buildMobileCommand().args, ['run', 'web', '--', '--port', '8081']);
});

test('admin command forwards Next arguments in the admin cwd', () => {
  const command = buildAdminCommand(['--hostname', '127.0.0.1', '--port', '3001']);
  assert.equal(command.cwd, resolve(repoPath, 'apps/admin'));
  assert.deepEqual(command.args, ['run', 'dev', '--', '--hostname', '127.0.0.1', '--port', '3001']);
  assert.equal(command.args.indexOf('--'), 2);
});

test('mobile command forwards Expo arguments in the mobile cwd', () => {
  const command = buildMobileCommand(['--port', '8083']);
  assert.equal(command.cwd, resolve(repoPath, 'apps/mobile'));
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

test('occupied ports are rejected before the demo starts', async () => {
  const server = net.createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const { port } = server.address();
  await assert.rejects(assertPortAvailable(port), /already in use/);
  await new Promise((resolve) => server.close(resolve));
});

test('combined launcher rejects an occupied port before spawning children', async () => {
  const server = net.createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const { port } = server.address();
  const child = spawn(process.execPath, [
    'scripts/local-demo.mjs',
    '--admin-port',
    String(port),
    '--mobile-port',
    String(port + 1),
  ], { cwd: repoPath, env: process.env, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '';
  child.stdout.on('data', (chunk) => { output += chunk; });
  child.stderr.on('data', (chunk) => { output += chunk; });
  const [code] = await once(child, 'close');
  await new Promise((resolve) => server.close(resolve));
  assert.equal(code, 2);
  assert.match(output, /Port .* is already in use/);
  assert.doesNotMatch(output, /Admin demo:/);
});

test('combined launcher terminates both surfaces on SIGTERM', async () => {
  const adminPort = await freePort();
  let mobilePort = await freePort();
  while (mobilePort === adminPort) mobilePort = await freePort();

  const child = spawn(process.execPath, [
    'scripts/local-demo.mjs',
    '--admin-port',
    String(adminPort),
    '--mobile-port',
    String(mobilePort),
  ], { cwd: repoPath, env: process.env, stdio: ['ignore', 'pipe', 'pipe'] });

  try {
    await Promise.all([
      waitForOutput(child, /Local:\s+http/),
      waitForOutput(child, new RegExp(`Waiting on http://localhost:${mobilePort}`)),
    ]);
    child.kill('SIGTERM');
    const [code, signal] = await once(child, 'close');
    assert.ok(code !== null || signal !== null);
    await assertPortAvailable(adminPort);
    await assertPortAvailable(mobilePort, '127.0.0.1');
    await assertPortAvailable(mobilePort, '::1');
  } finally {
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
  }
});

test('managed child termination closes the child process', async () => {
  const child = spawnManaged({
    command: process.execPath,
    args: ['-e', 'setTimeout(() => {}, 30000)'],
    cwd: repoPath,
  });
  const closed = once(child, 'close');
  terminateManaged(child, 'SIGTERM');
  const [code, signal] = await closed;
  assert.ok(code !== null || signal !== null);
});
