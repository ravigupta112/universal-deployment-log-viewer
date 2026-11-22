import { defineConfig } from 'tsup';
import { readFileSync, writeFileSync } from 'node:fs';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  sourcemap: true,
  splitting: false,
  treeshake: true,
  external: ['react', 'react-dom', 'react/jsx-runtime'],
  outExtension({ format }) {
    return { js: format === 'cjs' ? '.js' : '.mjs' };
  },
  // Keeps Next.js App Router happy: esbuild strips module-level directives while bundling,
  // so the 'use client' directive is re-added to the very top of both outputs afterwards.
  async onSuccess() {
    for (const file of ['dist/index.js', 'dist/index.mjs']) {
      const src = readFileSync(file, 'utf8');
      if (!src.startsWith("'use client'")) writeFileSync(file, `'use client';\n${src}`);
    }
  },
});
