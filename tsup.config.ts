import { defineConfig } from 'tsup';

export default defineConfig({
  entry: { main: 'src/main.ts' },
  format: ['esm'],
  target: 'node18',
  clean: true,
  dts: true,
  sourcemap: false,
  banner: {
    js: '#!/usr/bin/env node',
  },
});
