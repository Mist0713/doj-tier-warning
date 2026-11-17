import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const allowed = new Set(['--repository', '--bump', '--check']);
for (let i = 0; i < args.length; i++) {
  if (!allowed.has(args[i])) throw new Error(`Unknown option: ${args[i]}`);
  if (args[i] !== '--check') {
    if (!args[i + 1] || args[i + 1].startsWith('--')) throw new Error(`Missing value: ${args[i]}`);
    i++;
  }
}
const value = flag => { const i = args.indexOf(flag); return i < 0 ? undefined : args[i + 1]; };
const check = args.includes('--check');
const bump = value('--bump');
if (check && (bump || value('--repository'))) throw new Error('--check cannot change files.');
const pkgPath = path.join(root, 'package.json');
const userPath = path.join(root, 'doj-tier-warning.user.js');
const metaPath = path.join(root, 'doj-tier-warning.meta.js');
const pkg = JSON.parse(await readFile(pkgPath, 'utf8'));
const repository = value('--repository') || pkg.config?.githubRepository;
if (repository && !/^[A-Za-z0-9][A-Za-z0-9-]*\/[A-Za-z0-9_.-]+$/.test(repository)) {
  throw new Error('Expected a GitHub repository in OWNER/REPOSITORY format.');
}
if (bump) {
  const index = { major: 0, minor: 1, patch: 2 }[bump];
  if (index === undefined) throw new Error('Use --bump major, minor or patch.');
  if (!/^\d+\.\d+\.\d+$/.test(pkg.version)) throw new Error('Expected a major.minor.patch version.');
  const parts = pkg.version.split('.').map(Number);
  parts[index]++;
  for (let i = index + 1; i < parts.length; i++) parts[i] = 0;
  pkg.version = parts.join('.');
}
if (repository) {
  pkg.config = { ...pkg.config, githubRepository: repository };
  pkg.repository = { type: 'git', url: `https://github.com/${repository}.git` };
  pkg.homepage = `https://github.com/${repository}`;
}
const original = (await readFile(userPath, 'utf8')).replace(/\r\n/g, '\n');
const block = original.match(/^\/\/ ==UserScript==\n[\s\S]*?^\/\/ ==\/UserScript==/m)?.[0];
if (!block) throw new Error('Userscript metadata block not found.');
const fields = { version: pkg.version };
if (repository) Object.assign(fields, {
  homepageURL: `https://github.com/${repository}`,
  supportURL: `https://github.com/${repository}/issues`,
  updateURL: `https://raw.githubusercontent.com/${repository}/main/doj-tier-warning.meta.js`,
  downloadURL: `https://raw.githubusercontent.com/${repository}/main/doj-tier-warning.user.js`,
});
let header = block;
for (const [key, content] of Object.entries(fields)) {
  const line = `// @${key.padEnd(13)} ${content}`;
  const pattern = new RegExp(`^// @${key}\\s+.*$`, 'm');
  header = pattern.test(header) ? header.replace(pattern, line)
    : header.replace('// ==/UserScript==', `${line}\n// ==/UserScript==`);
}
const userscript = original.replace(block, header);
const metadata = `${header}\n`;
if (check) {
  if (!repository) throw new Error('Run setup-github.ps1 to configure the GitHub repository first.');
  if (userscript !== original) throw new Error('Version or update URLs are out of sync. Run node scripts/release.mjs.');
  if (await readFile(metaPath, 'utf8') !== metadata) throw new Error('Metadata file is out of sync. Run node scripts/release.mjs.');
  console.log(`Release metadata OK: ${repository} v${pkg.version}`);
} else {
  await writeFile(userPath, userscript);
  await writeFile(metaPath, metadata);
  await writeFile(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);
  const readmePath = path.join(root, 'README.md');
  const readme = await readFile(readmePath, 'utf8');
  const section = repository
    ? `<!-- userscript-install:start -->\n[설치 / 최신 버전으로 갱신](https://raw.githubusercontent.com/${repository}/main/doj-tier-warning.user.js)\n<!-- userscript-install:end -->`
    : '<!-- userscript-install:start -->\n최초 GitHub 게시 후 이 위치에 설치 링크가 생성됩니다.\n<!-- userscript-install:end -->';
  const marker = /<!-- userscript-install:start -->[\s\S]*?<!-- userscript-install:end -->/;
  await writeFile(readmePath, marker.test(readme) ? readme.replace(marker, section) : `${readme.trim()}\n\n${section}\n`);
  console.log(repository ? `Prepared ${repository} v${pkg.version}` : `Prepared v${pkg.version}; GitHub account will be resolved during setup.`);
}
