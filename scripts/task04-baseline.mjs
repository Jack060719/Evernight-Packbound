import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const base = '1e2ac7e891835e85f9f31b02a1166cd99f9cbb52';
const manifestPath = 'docs/release/04-manifest.json';
const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', windowsHide: true, maxBuffer: 16 * 1024 * 1024 });
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const json = path => JSON.parse(readFileSync(path, 'utf8'));
const writeJson = (path, value) => writeFileSync(path, JSON.stringify(value, null, 2) + '\n');
function inside(root, path) {
  const target = resolve(root, path);
  if (isAbsolute(path) || !target.startsWith(resolve(root) + sep)) throw new Error(`Non-relative package path: ${path}`);
  return target;
}
function entry(root, path) {
  const bytes = readFileSync(inside(root, path));
  return { path, bytes: bytes.length, sha256: digest(bytes) };
}
function check(root, files) {
  for (const expected of files) {
    const actual = entry(root, expected.path);
    if (actual.bytes !== expected.bytes || actual.sha256 !== expected.sha256) throw new Error(`Hash mismatch: ${expected.path}`);
  }
}
function projectFiles(root) {
  return [...new Set(git(root, 'ls-files', '-z', '--cached', '--others', '--exclude-standard').split('\0').filter(Boolean))].sort();
}
function verify(root) {
  if (git(root, 'rev-parse', 'HEAD').trim() !== base) throw new Error('Unexpected base commit');
  const manifest = json(resolve(root, manifestPath));
  if (manifest.baseCommit !== base) throw new Error('Manifest base mismatch');
  check(root, manifest.files);
  const expected = [...manifest.files.map(file => file.path), manifestPath].sort();
  if (JSON.stringify(projectFiles(root)) !== JSON.stringify(expected)) throw new Error('Rebuilt file inventory differs');
  console.log(JSON.stringify({ status: 'PASS', baseCommit: base, files: manifest.files.length, manifestSha256: digest(readFileSync(resolve(root, manifestPath))) }));
}

const [command, first, second] = process.argv.slice(2);
if (command === 'pack') {
  const root = process.cwd();
  const destination = resolve(first);
  if (git(root, 'rev-parse', 'HEAD').trim() !== base) throw new Error('Pack only the specified Task 04 base');
  // Refuse an existing destination; never clear or reset a working tree.
  mkdirSync(destination);
  const paths = projectFiles(root).filter(path => path !== manifestPath);
  const manifest = json(resolve(root, manifestPath));
  manifest.files = paths.map(path => entry(root, path));
  writeJson(resolve(root, manifestPath), manifest);
  const blobs = new Map(git(root, 'ls-tree', '-rz', base).split('\0').filter(Boolean).map(line => {
    const [metadata, path] = line.split('\t');
    return [path, metadata.split(' ')[2]];
  }));
  const overlay = [];
  for (const path of [...paths, manifestPath]) {
    const bytes = readFileSync(inside(root, path));
    const blob = createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
    // Include byte differences such as CRLF, even when Git's normalized diff is empty.
    if (blob === blobs.get(path)) continue;
    const output = inside(destination, `overlay/${path}`);
    mkdirSync(dirname(output), { recursive: true });
    writeFileSync(output, bytes);
    overlay.push(`overlay/${path}`);
  }
  git(root, 'bundle', 'create', resolve(destination, 'base.bundle'), 'HEAD');
  copyFileSync(fileURLToPath(import.meta.url), resolve(destination, 'rebuild.mjs'));
  copyFileSync(resolve(root, 'docs/release/04-rebuild.md'), resolve(destination, 'README.md'));
  writeJson(resolve(destination, 'manifest.json'), {
    formatVersion: 1, task: '04', status: '04_READY_FOR_RE_REVIEW', baseCommit: base,
    projectManifest: `overlay/${manifestPath}`,
    files: ['base.bundle', 'rebuild.mjs', 'README.md', ...overlay].map(path => entry(destination, path)),
  });
  verify(root);
  console.log(JSON.stringify({ package: relative(root, destination), overlayFiles: overlay.length }));
} else if (command === 'restore') {
  const source = resolve(first);
  const target = resolve(second);
  const manifest = json(resolve(source, 'manifest.json'));
  if (manifest.baseCommit !== base) throw new Error('Package base mismatch');
  check(source, manifest.files);
  if (existsSync(target)) throw new Error('Restore requires a new, nonexistent target directory');
  git(source, 'clone', '--no-checkout', resolve(source, 'base.bundle'), target);
  git(target, '-c', 'core.autocrlf=false', 'checkout', '--detach', base);
  for (const file of manifest.files.filter(file => file.path.startsWith('overlay/'))) {
    const output = inside(target, file.path.slice('overlay/'.length));
    mkdirSync(dirname(output), { recursive: true });
    copyFileSync(inside(source, file.path), output);
  }
  verify(target);
} else if (command === 'verify') {
  verify(resolve(first ?? '.'));
} else {
  throw new Error('Usage: pack <new-package-dir> | restore <package-dir> <new-project-dir> | verify <project-dir>');
}
