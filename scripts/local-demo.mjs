import { spawn } from 'node:child_process';
import process from 'node:process';
import { buildDemoCommands, parseDemoArgs } from './local-demo-utils.mjs';

let options;
try {
  options = parseDemoArgs(process.argv.slice(2));
} catch (error) {
  console.error(`local demo: ${error.message}`);
  process.exitCode = 2;
} 

if (options) {
  const commands = buildDemoCommands(options);
  const children = new Map();
  let shuttingDown = false;
  let exitCode = 0;

  console.log(`Admin demo: http://${options.adminHostname}:${options.adminPort}`);
  console.log(`Mobile web demo: http://localhost:${options.mobilePort} (or the Expo URL it prints)`);
  console.log('Supabase variables absent: existing local demo fallback is active.');

  for (const [name, command] of Object.entries(commands)) {
    const child = spawn(command.command, command.args, {
      cwd: command.cwd,
      env: process.env,
      stdio: 'inherit',
    });
    children.set(name, child);
    child.once('error', (error) => {
      if (!shuttingDown) {
        console.error(`${name} failed to start: ${error.message}`);
        exitCode = 1;
        shutdown('SIGTERM');
      }
    });
    child.once('close', (code, signal) => {
      if (!shuttingDown) {
        if (code !== 0 || signal) {
          console.error(`${name} stopped unexpectedly${signal ? ` (${signal})` : ` (exit ${code})`}`);
        }
        exitCode = 1;
        shutdown('SIGTERM');
      }
    });
  }

  process.once('SIGINT', () => {
    exitCode = 130;
    shutdown('SIGINT');
  });
  process.once('SIGTERM', () => {
    exitCode = 143;
    shutdown('SIGTERM');
  });

  function shutdown(signal) {
    if (shuttingDown) return;
    shuttingDown = true;
    for (const child of children.values()) {
      if (!child.killed) child.kill(signal);
    }
    Promise.all([...children.values()].map((child) => new Promise((resolve) => {
      if (child.exitCode !== null || child.signalCode !== null) resolve();
      else child.once('close', resolve);
    }))).then(() => {
      process.exitCode = exitCode;
    });
  }
}
