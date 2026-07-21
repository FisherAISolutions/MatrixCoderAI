#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const Module = require('module');
const ts = require('typescript');

const root = process.cwd();
const originalResolve = Module._resolveFilename;

Module._resolveFilename = function resolveAlias(request, parent, isMain, options) {
  if (request.startsWith('@/')) {
    return originalResolve.call(
      this,
      path.join(root, 'src', request.slice(2)),
      parent,
      isMain,
      options
    );
  }
  return originalResolve.call(this, request, parent, isMain, options);
};

require.extensions['.ts'] = function loadTypeScript(module, filename) {
  const source = fs.readFileSync(filename, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
      jsx: ts.JsxEmit.ReactJSX,
    },
    fileName: filename,
  }).outputText;
  module._compile(output, filename);
};

async function main() {
  if (process.env.NODE_ENV === 'production') {
    console.error('Refusing to run live engineering benchmark in production mode.');
    process.exitCode = 1;
    return;
  }

  const {
    LIVE_ENGINEERING_BENCHMARK_CONFIRMATION,
    runLiveEngineeringBenchmark,
  } = require('../src/lib/engineering-benchmarks');

  const fixtureId = process.env.MATRIX_CODER_LIVE_BENCHMARK_ID;
  const confirmation = process.env.MATRIX_CODER_LIVE_BENCHMARK_CONFIRM;
  const allowLiveProvider =
    process.env.MATRIX_CODER_LIVE_BENCHMARK_PROVIDER === '1';

  console.log('Matrix Coder live engineering benchmark');
  console.log('WARNING: this command can make real model/API requests.');
  console.log('Fixture:', fixtureId ?? '(missing)');
  console.log('Provider enabled:', allowLiveProvider ? 'yes' : 'no');
  console.log(
    `Required confirmation: MATRIX_CODER_LIVE_BENCHMARK_CONFIRM=${LIVE_ENGINEERING_BENCHMARK_CONFIRMATION}`
  );

  const result = await runLiveEngineeringBenchmark({
    fixtureId: fixtureId ?? 'simple-business-website',
    confirmation,
    allowLiveProvider,
    limits: {
      maxTasks: Number(process.env.MATRIX_CODER_LIVE_BENCHMARK_MAX_TASKS ?? 14),
      maxAiRequests: Number(
        process.env.MATRIX_CODER_LIVE_BENCHMARK_MAX_AI_REQUESTS ?? 20
      ),
      maxTaskRepairAttempts: Number(
        process.env.MATRIX_CODER_LIVE_BENCHMARK_MAX_REPAIRS ?? 1
      ),
    },
    onProgress: (progress) => {
      console.log(
        `[${progress.runId}] ${progress.currentTaskTitle ?? 'idle'} ` +
          `${progress.aiRequestsUsed}/${progress.maxAiRequests} requests`
      );
    },
  });

  const outputDir =
    process.env.MATRIX_CODER_LIVE_BENCHMARK_OUTPUT_DIR ??
    path.join(root, '.next', 'matrix-benchmark-results');
  fs.mkdirSync(outputDir, { recursive: true });
  const outputPath = path.join(outputDir, `${result.runId}.json`);
  fs.writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  console.log(`Result saved to ${outputPath}`);
  console.log(JSON.stringify(result, null, 2));
  if (result.stopReason === 'safety-refused' || result.errors.length > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
