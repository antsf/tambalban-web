import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const root = new URL('../', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');

test('Lighthouse builds the real UI with locked dependencies and local D1', () => {
  const workflow = read('.github/workflows/lighthouse.yml');
  assert.match(workflow, /^\s*run: npm ci\s*$/m);
  assert.match(workflow, /^\s*run: npm run build\s*$/m);
  assert.match(workflow, /wrangler d1 migrations apply DB --local/);
  const config = JSON.parse(read('lighthouserc.json'));
  assert.match(config.ci.collect.startServerCommand, /wrangler dev --local/);
});

test('R1: the V8 provider is declared and locked at the selected Vitest version', () => {
  const manifest = JSON.parse(read('worker/package.json'));
  const lock = JSON.parse(read('worker/package-lock.json'));
  const version = lock.packages['node_modules/vitest'].version;
  assert.equal(manifest.devDependencies['@vitest/coverage-v8'], version);
  assert.equal(lock.packages[''].devDependencies['@vitest/coverage-v8'], version);
  assert.equal(lock.packages['node_modules/@vitest/coverage-v8'].version, version);
});

test('R1: all active workflow installs use npm ci and CI runs the coverage script', () => {
  const ci = read('.github/workflows/ci.yml');
  const release = read('.github/workflows/release.yml');
  for (const workflow of [ci, release]) {
    assert.doesNotMatch(workflow, /^\s*run: npm install\s*$/m);
    assert.match(workflow, /^\s*run: npm ci\s*$/m);
    assert.match(workflow, /^\s*run: npm run test:ci\s*$/m);
  }
  assert.match(ci, /^\s*run: npm run test:coverage\s*$/m);
  assert.match(ci, /min_coverage: 55/);
  const { scripts } = JSON.parse(read('worker/package.json'));
  assert.match(scripts['test:coverage'], /--coverage\.reporter=lcov/);
  assert.match(scripts['test:coverage'], /--coverage\.thresholds\.lines=55/);
});
