import { build } from 'esbuild';
import { cp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = fileURLToPath(new URL('../../', import.meta.url));
const out = path.join(root, 'dist/site');
await rm(out, { recursive: true, force: true });
await mkdir(path.join(out, 'app'), { recursive: true });
await cp(path.join(root, 'web/landing'), out, { recursive: true });
let html = await readFile(path.join(root, 'ui/index.html'), 'utf8');
html = html.replace('<title>Signal — Risk testing lab</title>', '<title>trustparty — Testing prototype</title>')
  .replace('href="/styles.css"', 'href="/app/styles.css"').replace('src="/app.js"', 'src="/app/app.js"')
  .replace('aria-label="Signal home"', 'aria-label="trustparty home"')
  .replace('<span class="brand-icon">◈</span> signal', '<span class="brand-icon" aria-hidden="true">●</span> trustparty')
  .replace('RISK INTELLIGENCE / LOCAL', 'TRUSTPARTY / TESTING PROTOTYPE')
  .replace('Local testing environment', 'Browser-only rules · no live calls')
  .replace('VERIFICATION BUDGET', 'PUBLIC PROTOTYPE').replace(' / $3.00 reserved', ' API spend')
  .replace('Loading the existing ledger…', 'No model API is used here.')
  .replace('Shared limit · reservations retained', 'No transcripts leave this browser')
  .replace('Running on your machine', 'Runs in this browser').replace('LOCAL ENVIRONMENT', 'RULES ONLY · NO LIVE CALLS')
  .replace('Follow the signal.', 'See what raises a warning.')
  .replace('>Mock · Free</button>', '>Rules · Free</button>')
  .replace('id="mode-live"', 'hidden id="mode-live"').replace('Assessment confidence', 'Synthetic indicator')
  .replace('Sensitive text is redacted before provider assessment, best effort.', 'Synthetic text recommended. No transcript uploads or phone monitoring.')
  .replace('In-memory call state · resets on restart · no audio ingestion', 'Tab memory only · reload to clear · no audio or invitations')
  .replace('New call</button>', 'New session</button>')
  .replace('</nav>', '<a class="nav-item" href="/">← Back to trustparty</a></nav>');
html = html.replace('<head>', '<head><meta http-equiv="Content-Security-Policy" content="default-src \'self\'; script-src \'self\'; style-src \'self\' \'unsafe-inline\'; connect-src \'none\'; img-src \'self\' data:; media-src \'none\'; object-src \'none\'; base-uri \'none\'; form-action \'none\'">');
await writeFile(path.join(out, 'app/index.html'), html);
await writeFile(path.join(out, 'app/styles.css'), (await readFile(path.join(root, 'ui/styles.css'), 'utf8')) + '\n' + (await readFile(path.join(root, 'web/dashboard-overrides.css'), 'utf8')));
const result = await build({ entryPoints: [path.join(root, 'ui/app.js')], outfile: path.join(out, 'app/app.js'),
  bundle: true, platform: 'browser', format: 'esm', target: ['es2022'], minify: true, metafile: true,
  plugins: [{ name: 'public-browser-adapters', setup(b) {
    b.onResolve({ filter: /^\.\/transport\.js$/ }, () => ({ path: path.join(root, 'src/browser-transport.ts') }));
    b.onResolve({ filter: /^node:crypto$/ }, () => ({ path: path.join(root, 'src/browser-crypto.ts') }));
  } }]
});
let commit;
try { commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(); }
catch { throw new Error('Build from a Git checkout to retain source provenance.'); }
await writeFile(path.join(out, 'version.json'), JSON.stringify({ application: 'trustparty', sourceRepository: 'https://github.com/MuhammedArham/ScanShield-AI', sourceCommit: commit, mode: 'browser-rules-only' }, null, 2) + '\n');
await writeFile(path.join(out, 'health.json'), JSON.stringify({ status: 'ok', mode: 'browser-rules-only' }) + '\n');
await writeFile(path.join(root, 'dist/site-build-meta.json'), JSON.stringify(result.metafile, null, 2));
console.log('Built trustparty landing + existing detector dashboard at dist/site');
