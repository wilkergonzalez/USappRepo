import { spawn } from 'node:child_process';
import net from 'node:net';
import process from 'node:process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const npmExecutable = process.platform === 'win32' ? 'npm.cmd' : 'npm';

function packageCommand(packageDir, script, args) {
  return {
    command: npmExecutable,
    args: ['run', script, '--', ...args],
    cwd: resolve(repoRoot, 'apps', packageDir),
  };
}

export function buildAdminCommand(args = []) {
  const forwarded = args.length ? [...args] : ['--hostname', '127.0.0.1', '--port', '3000'];
  return packageCommand('admin', 'dev', forwarded);
}

export function buildMobileCommand(args = []) {
  const forwarded = args.length ? [...args] : ['--port', '8081'];
  return packageCommand('mobile', 'web', forwarded);
}

export function spawnManaged({ command, args, cwd }) {
  return spawn(command, args, {
    cwd,
    env: process.env,
    stdio: 'inherit',
    detached: process.platform !== 'win32',
  });
}

export function terminateManaged(child, signal = 'SIGTERM') {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;

  if (process.platform === 'win32') {
    const taskkill = spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
    const fallback = () => {
      if (child.exitCode === null && child.signalCode === null) {
        try {
          child.kill(signal);
        } catch {
          // The process exited while taskkill was cleaning up its tree.
        }
      }
    };
    taskkill.once('error', fallback);
    taskkill.once('close', fallback);
    return;
  }

  try {
    process.kill(-child.pid, signal);
  } catch {
    child.kill(signal);
  }
}

function parsePort(value, option) {
  if (!/^\d+$/.test(value)) throw new Error(`${option} requires a numeric port`);
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`${option} must be between 1 and 65535`);
  }
  return port;
}

export function parseDemoArgs(args = []) {
  const options = { adminPort: 3000, mobilePort: 8081, adminHostname: '127.0.0.1' };
  for (let index = 0; index < args.length; index += 1) {
    const option = args[index];
    if (option === '--admin-hostname') {
      const value = args[++index];
      if (!value || value.startsWith('--')) throw new Error('--admin-hostname requires a value');
      options.adminHostname = value;
    } else if (option === '--admin-port' || option === '--mobile-port') {
      const value = args[++index];
      if (value === undefined || value.startsWith('--')) throw new Error(`${option} requires a port`);
      const port = parsePort(value, option);
      if (option === '--admin-port') options.adminPort = port;
      else options.mobilePort = port;
    } else {
      throw new Error(`Unknown demo option: ${option}`);
    }
  }
  if (options.adminPort === options.mobilePort) {
    throw new Error('Admin and mobile ports must be different');
  }
  return options;
}

export function buildDemoCommands(options) {
  return {
    admin: packageCommand('admin', 'dev', ['--hostname', options.adminHostname, '--port', String(options.adminPort)]),
    mobile: packageCommand('mobile', 'web', ['--port', String(options.mobilePort)]),
  };
}

export function assertPortAvailable(port, host = '127.0.0.1') {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', (error) => {
      if (error.code === 'EADDRNOTAVAIL') {
        resolve();
      } else {
        reject(new Error(`Port ${port} is already in use`));
      }
    });
    server.listen({ port, host }, () => {
      server.close(() => resolve());
    });
  });
}
