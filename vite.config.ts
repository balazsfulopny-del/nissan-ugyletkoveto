import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
export default defineConfig({ base: './', plugins: [preact()], build: { target: 'es2020', sourcemap: true }, test: { environment: 'node', testTimeout: 30000 } } as any);
