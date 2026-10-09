// Starts the API server (with auto-restart) and the Vite dev server together.
// Open http://localhost:5173 — API calls are proxied to http://localhost:8787.
import { spawn } from 'node:child_process';

const procs = [
  spawn(process.execPath, ['--watch', 'server/index.js'], { stdio: 'inherit', env: { ...process.env, NODE_ENV: 'development' } }),
  spawn(process.execPath, ['node_modules/vite/bin/vite.js'], { stdio: 'inherit' }),
];

const stop = () => {
  procs.forEach((p) => p.kill());
  process.exit();
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
procs.forEach((p) => p.on('exit', (code) => code && stop()));
