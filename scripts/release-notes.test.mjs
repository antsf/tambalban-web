import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';

const root = fileURLToPath(new URL('../', import.meta.url));
const workflow = readFileSync(join(root, '.github/workflows/release.yml'), 'utf8');
// Execute the actual workflow step, not a second implementation of its parser.
function step(name) {
  const block = workflow.split(`      - name: ${name}\n`)[1]?.split('\n      - ')[0];
  assert.ok(block, `Workflow step missing: ${name}`);
  const run = block.match(/^        run: (.*)$/m);
  assert.ok(run, `Workflow run missing: ${name}`);
  if (run[1] !== '|') return run[1] + '\n';
  return block.slice(block.indexOf(run[0]) + run[0].length).split('\n')
    .filter((line) => line.startsWith('          ')).map((line) => line.slice(10)).join('\n') + '\n';
}
function fixture(changelog, tag = 'v0.1.0', name = 'Extract CHANGELOG section for this tag') {
  const dir = mkdtempSync(join(process.env.TMPDIR || tmpdir(), 'tambalban-release-test-'));
  try {
    mkdirSync(join(dir, 'worker'));
    writeFileSync(join(dir, 'worker/package.json'), JSON.stringify({ version: '0.1.0' }));
    writeFileSync(join(dir, 'CHANGELOG.md'), changelog);
    cpSync(join(root, 'scripts'), join(dir, 'scripts'), { recursive: true });
    const result = spawnSync('bash', ['-e'], {
      cwd: name.startsWith('Verify tag') ? join(dir, 'worker') : dir,
      // Use the test runner's interpreter, not a possibly broken npm/MSYS PATH shim.
      input: 'node() { "$QA_NODE" "$@"; }\n' + step(name), encoding: 'utf8',
      env: { ...process.env, GITHUB_REF_NAME: tag, QA_NODE: process.execPath.replaceAll('\\', '/') },
    });
    assert.ifError(result.error);
    const output = join(dir, 'release_notes.md');
    return { ...result, notes: existsSync(output) ? readFileSync(output, 'utf8') : null };
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

test('R2: matching section is extracted without the next version', () => {
  const result = fixture('## [0.1.0] - 2026-08-06\n\n### Added\n- Real change.\n\n## [0.0.9]\n- Older change.\n');
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.notes, /Real change/);
  assert.doesNotMatch(result.notes, /Older change/);
});
test('R2: missing exact version fails before publication', () => {
  const result = fixture('## [0.1.1]\n- Another version.\n');
  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stderr, /Missing exact CHANGELOG section/);
});
test('R2: mismatching tag and manifest fail', () => {
  const result = fixture('', 'v0.1.1', 'Verify tag matches package.json version');
  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stdout, /does not match worker\/package.json version/);
});

for (const [label, body] of [
  ['empty', ''],
  ['whitespace-only', ' \n\t\n'],
  ['comment-only', '<!-- draft\n- Not published yet.\n-->\n'],
  ['heading-only', '### Added\n\n### Fixed ###\n'],
  ['setext heading-only', 'Added\n-----\n'],
  ['comments and headings only', '### Added\n<!-- TODO: release details -->\n### Fixed\n'],
]) {
  test(`R2: ${label} exact section fails without writing release notes`, () => {
    const result = fixture(`## [0.1.0]\n${body}\n## [0.0.9]\n- An older real change.\n`);
    assert.equal(result.status, 1, result.stderr);
    assert.match(result.stderr, /has no substantive release notes/);
    assert.equal(result.notes, null);
  });
}

test('R2: a different version sharing a prefix is not an exact section', () => {
  const result = fixture('## [0.1.00]\n- Wrong version.\n');
  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stderr, /Missing exact CHANGELOG section/);
  assert.equal(result.notes, null);
});

test('R2: comments cannot impersonate version headings or truncate valid notes', () => {
  const result = fixture('<!--\n## [0.1.0]\n- Fake notes.\n-->\n## [0.1.0]\n<!--\n## Internal draft\n-->\n### Added\n- Real change.\n');
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.notes, /Real change/);
  assert.doesNotMatch(result.notes, /Fake notes/);
});
