import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const src = (p) => readFile(join(root, 'src', p), 'utf8');

function stripExports(code) {
  return code
    .replace(/^export\s+function\s+/gm, 'function ')
    .replace(/^export\s+const\s+/gm, 'const ')
    .replace(/^export\s+class\s+/gm, 'class ')
    .replace(/^export\s+let\s+/gm, 'let ')
    .replace(/^export\s+\{[^}]*\};?\s*$/gm, '');
}

function cspHash(s) {
  return 'sha256-' + createHash('sha256').update(s).digest('base64');
}

async function main() {
  const template = await src('template.html');
  const css = await src('styles.css');

  const workerSource = stripExports([
    await src('hash.mjs'),
    await src('worker.mjs'),
  ].join('\n\n'));

  const mainSource = stripExports([
    await src('csv.mjs'),
    await src('recipe.mjs'),
    await src('hash.mjs'),
    await src('compare.mjs'),
    `const WORKER_SOURCE = ${JSON.stringify(workerSource)};`,
    await src('app.mjs'),
  ].join('\n\n'));

  const scriptHash = cspHash(mainSource);
  const styleHash = cspHash(css);

  const html = template
    .replace('{{CSS}}', css)
    .replace('{{JS}}', mainSource)
    .replace('{{CSP_SCRIPT_HASH}}', scriptHash)
    .replace('{{CSP_STYLE_HASH}}', styleHash);

  await writeFile(join(root, 'index.html'), html);
  console.log(`Wrote index.html (${html.length} bytes)`);
  console.log(`  script CSP: ${scriptHash}`);
  console.log(`  style  CSP: ${styleHash}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
