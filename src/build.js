import { build } from 'esbuild';
import { builtinModules } from 'module';

const nodePrefixPlugin = {
  name: 'node-prefix',
  setup(build) {
    build.onResolve({ filter: /.*/ }, (args) => {
      if (builtinModules.includes(args.path)) {
        return {
          path: `node:${args.path}`,
          external: true,
        };
      }
    });
  },
};

build({
  entryPoints: ['src/discord/server.ts'],
  bundle: true,
  platform: 'node',
  target: 'node20',
  outfile: 'dist/index.js',
  format: 'esm',
  plugins: [nodePrefixPlugin],
  allowOverwrite: true,
  treeShaking: true,
}).catch(() => process.exit(1));
