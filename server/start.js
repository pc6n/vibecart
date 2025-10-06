// ES Module wrapper for server
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const serverProcess = spawn('node', [
    '--experimental-modules',
    '--es-module-specifier-resolution=node',
    join(__dirname, 'dist', 'index.js')
], {
    stdio: 'inherit',
    env: {
        ...process.env,
        PORT: process.env.PORT || 1337
    }
});

serverProcess.on('error', (err) => {
    console.error('Failed to start server:', err);
    process.exit(1);
});

process.on('SIGTERM', () => {
    serverProcess.kill('SIGTERM');
});

process.on('SIGINT', () => {
    serverProcess.kill('SIGINT');
}); 