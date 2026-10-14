import { mkdir, copyFile, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

// Exact official compiled assets; no generated lookalike and no TW compiler migration.
const root = fileURLToPath(new URL('../', import.meta.url));
const source = join(root, 'node_modules/basecoat-css');
const expectedVersion = '1.0.2';
const pkg = JSON.parse(await readFile(join(source, 'package.json'), 'utf8'));
if (pkg.name !== 'basecoat-css' || pkg.version !== expectedVersion) {
  throw new Error(`Expected basecoat-css@${expectedVersion}, got ${pkg.name}@${pkg.version}`);
}
const output = join(root, 'public/vendor/basecoat', expectedVersion);
await mkdir(output, { recursive: true });
const files = ['dist/basecoat.cdn.min.css', 'dist/js/basecoat.min.js', 'dist/js/drawer.min.js', 'LICENSE.md'];
const manifest = { package: pkg.name, version: expectedVersion, files: {} };
for (const file of files) {
  const name = file.split('/').pop();
  const bytes = await readFile(join(source, file));
  await copyFile(join(source, file), join(output, name));
  manifest.files[name] = { bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
}
await writeFile(join(output, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(JSON.stringify(manifest, null, 2));
