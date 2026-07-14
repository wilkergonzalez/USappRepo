import { spawn } from 'node:child_process';
import process from 'node:process';
import { buildMobileCommand } from './local-demo-utils.mjs';

const child = spawnCommand(buildMobileCommand(process.argv.slice(2)));
let stopping = false;

function stop(signal = 'SIGTERM') {
  if (!stopping) {
    stopping = true;
    child.kill(signal);
  }
}

process.on('SIGINT', () => stop('SIGINT'));
process.on('SIGTERM', () => stop('SIGTERM'));
child.on('error', (error) => {
  console.error(`Unable to start mobile web: ${error.message}`);
  process.exitCode = 1;
});
child.on('close', (code, signal) => {
  if (signal) process.exitCode = 128 + (signal === 'SIGINT' ? 2 : 15);
  else if (code !== null) process.exitCode = code;
});

function spawnCommand({ command, args, cwd }) {
  return spawn(command, args, { cwd, env: process.env, stdio: 'inherit' });
}
