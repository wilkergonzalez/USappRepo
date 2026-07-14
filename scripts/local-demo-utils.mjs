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
