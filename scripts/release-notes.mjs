import { readFileSync, writeFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);

try {
  const args = process.argv.slice(2);
  if (args.length && !(args.length === 2 && args[0] === '--output')) {
    throw new Error('Usage: node scripts/release-notes.mjs [--output FILE]');
  }
  const { version } = JSON.parse(readFileSync(new URL('worker/package.json', root), 'utf8'));
  const tag = process.env.GITHUB_REF_NAME;
  if (tag !== `v${version}`) {
    throw new Error(`Tag ${tag ?? '(missing)'} does not match worker/package.json version v${version}`);
  }
  // Hidden comments cannot supply notes or impersonate section boundaries.
  const lines = readFileSync(new URL('CHANGELOG.md', root), 'utf8')
    .replace(/<!--[\s\S]*?(?:-->|$)/g, '').split(/\r?\n/);
  const start = lines.findIndex((line) => line.match(/^## \[([^\]]+)\](?:[ \t].*)?$/)?.[1] === version);
  if (start < 0) throw new Error(`Missing exact CHANGELOG section [${version}]`);
  let end = start + 1;
  while (end < lines.length && !/^##(?:\s|$)/.test(lines[end])) end++;
  const notes = lines.slice(start + 1, end).join('\n').trim();
  const substantive = notes.replace(/^[ \t]*[^\n]+\n[ \t]*(?:=+|-+)[ \t]*(?=\n|$)/gm, '')
    .split('\n').filter((line) => !/^\s{0,3}#{1,6}(?:\s|$)/.test(line)).join('\n').trim();
  if (!substantive) throw new Error(`CHANGELOG section [${version}] has no substantive release notes`);
  if (args.length) writeFileSync(args[1], `${notes}\n`);
  else process.stdout.write(`${notes}\n`);
} catch (error) {
  console.error(`Release notes validation failed: ${error.message}`);
  process.exitCode = 1;
}
