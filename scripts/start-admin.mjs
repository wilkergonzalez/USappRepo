import process from 'node:process';
import { buildAdminCommand, spawnManaged, terminateManaged } from './local-demo-utils.mjs';

const child = spawnManaged(buildAdminCommand(process.argv.slice(2)));
let stopping = false;

function stop(signal = 'SIGTERM') {
  if (!stopping) {
    stopping = true;
    terminateManaged(child, signal);
  }
}

process.on('SIGINT', () => stop('SIGINT'));
process.on('SIGTERM', () => stop('SIGTERM'));
child.on('error', (error) => {
  console.error(`Unable to start admin: ${error.message}`);
  process.exitCode = 1;
});
child.on('close', (code, signal) => {
  if (signal) process.exitCode = 128 + (signal === 'SIGINT' ? 2 : 15);
  else if (code !== null) process.exitCode = code;
});
