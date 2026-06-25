#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const originalResolveFilename = Module._resolveFilename;

Module._resolveFilename = function resolveAlias(request, parent, isMain, options) {
  if (request.startsWith('@/')) {
    return originalResolveFilename(
      path.join(root, 'src', request.slice(2)),
      parent,
      isMain,
      options
    );
  }
  return originalResolveFilename(request, parent, isMain, options);
};

require.extensions['.ts'] = function compileTypeScript(module, filename) {
  const source = fs.readFileSync(filename, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
    fileName: filename,
  }).outputText;
  module._compile(output, filename);
};

const { printBenchmarkReport } = require('../src/lib/generation/benchmarkReport.ts');

printBenchmarkReport().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
