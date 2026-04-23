// DOM wiring for the web app. This module is concatenated last by the build
// and runs in the main thread. Pure logic lives in the other modules.

const $ = (id) => document.getElementById(id);
const radioValue = (name) => {
  const el = document.querySelector(`input[name="${name}"]:checked`);
  return el ? el.value : null;
};

// === Privacy verification panel ===
$('verify-link').addEventListener('click', (e) => {
  e.preventDefault();
  const p = $('verify-panel');
  p.hidden = !p.hidden;
});

// === Tabs ===
for (const tab of document.querySelectorAll('[data-tab]')) {
  tab.addEventListener('click', () => {
    const name = tab.dataset.tab;
    for (const t of document.querySelectorAll('[data-tab]')) t.classList.toggle('active', t === tab);
    for (const p of document.querySelectorAll('[data-panel]')) p.hidden = p.dataset.panel !== name;
  });
}

// === Hash tab state ===
let hashFile = null;
let hashColumns = [];
let hashData = [];

const dropHash = $('drop-hash');
const fileHash = $('file-hash');
dropHash.addEventListener('click', () => fileHash.click());
dropHash.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileHash.click(); } });
dropHash.addEventListener('dragover', (e) => { e.preventDefault(); dropHash.classList.add('drag'); });
dropHash.addEventListener('dragleave', () => dropHash.classList.remove('drag'));
dropHash.addEventListener('drop', (e) => {
  e.preventDefault();
  dropHash.classList.remove('drag');
  if (e.dataTransfer.files[0]) loadHashFile(e.dataTransfer.files[0]);
});
fileHash.addEventListener('change', (e) => { if (e.target.files[0]) loadHashFile(e.target.files[0]); });

async function loadHashFile(f) {
  hashFile = f;
  const text = await f.text();
  try {
    const { header, data } = parseCSV(text);
    hashColumns = header;
    hashData = data;
    const colSel = $('col-hash');
    colSel.innerHTML = '';
    let preselect = header.findIndex((h) => /^e[\- ]?mail$/i.test(h));
    if (preselect < 0) preselect = 0;
    header.forEach((h, i) => {
      const opt = document.createElement('option');
      opt.value = String(i);
      opt.textContent = h;
      if (i === preselect) opt.selected = true;
      colSel.appendChild(opt);
    });
    $('hash-file-label').textContent = `${f.name} — ${data.length} rows`;
    $('hash-controls').hidden = false;
    $('hash-error').textContent = '';
  } catch (err) {
    $('hash-error').textContent = err.message;
  }
}

// === Recipe summary ===
const hmacToggle = $('hmac-toggle');
hmacToggle.addEventListener('change', () => {
  $('hmac-passphrase-wrap').hidden = !hmacToggle.checked;
  $('algo').disabled = hmacToggle.checked;
  updateRecipe();
});
$('algo').addEventListener('change', updateRecipe);
for (const r of document.querySelectorAll('input[name="case-hash"]')) r.addEventListener('change', updateRecipe);
updateRecipe();

function currentRecipe() {
  return {
    algorithm: $('algo').value,
    case: radioValue('case-hash') || 'lower',
    hmac: hmacToggle.checked,
  };
}
function updateRecipe() {
  $('recipe').textContent = 'Recipe: ' + recipeString(currentRecipe());
}

// === Hash button ===
$('btn-hash').addEventListener('click', async () => {
  $('hash-error').textContent = '';
  if (!hashFile) { $('hash-error').textContent = 'Please select a CSV first.'; return; }
  const colIdx = parseInt($('col-hash').value, 10);
  const emails = hashData.map((r) => r[colIdx] ?? '').filter((v) => v.length > 0);
  if (emails.length === 0) { $('hash-error').textContent = 'Selected column has no values.'; return; }
  const recipe = currentRecipe();
  const passphrase = recipe.hmac ? $('hmac-passphrase').value : '';
  if (recipe.hmac && !passphrase) { $('hash-error').textContent = 'HMAC mode requires a passphrase.'; return; }

  const worker = makeWorker();
  const id = Math.random().toString(36).slice(2);
  $('hash-progress').hidden = false;
  $('hash-progress').textContent = `Hashing 0 / ${emails.length}…`;

  const result = await new Promise((resolve, reject) => {
    worker.onmessage = (e) => {
      if (e.data.id !== id) return;
      if (e.data.type === 'progress') {
        $('hash-progress').textContent = `Hashing ${e.data.done} / ${e.data.total}…`;
      } else if (e.data.type === 'done') {
        resolve(e.data.result);
      } else if (e.data.type === 'error') {
        reject(new Error(e.data.message));
      }
    };
    worker.postMessage({
      id,
      type: 'hash',
      payload: {
        emails,
        algorithm: recipe.algorithm,
        caseMode: recipe.case,
        hmac: recipe.hmac,
        passphrase,
      },
    });
  }).catch((err) => { $('hash-error').textContent = err.message; return null; })
    .finally(() => worker.terminate());

  if (!result) return;
  $('hash-progress').textContent = `Hashed ${result.length} rows.`;
  $('hash-preview').textContent = result.slice(0, 3).map((h) => h.slice(0, 32) + '…').join('\n');

  const outHeader = [...hashColumns, 'hashed_email'];
  const queue = result.slice();
  const outData = hashData.map((r) => {
    const email = r[colIdx] ?? '';
    const hash = email.length > 0 ? queue.shift() : '';
    return [...r, hash];
  });
  const csv = stringifyCSV(outHeader, outData, { comments: ['recipe: ' + recipeString(recipe)] });
  triggerDownload(csv, (hashFile.name.replace(/\.csv$/i, '') || 'hashed') + '-hashed.csv');
});

$('btn-hash-clear').addEventListener('click', () => location.reload());

// === Compare tab ===
let cmpA = null;
let cmpB = null;
for (const side of ['a', 'b']) {
  const drop = $(`drop-${side}`);
  const file = $(`file-${side}`);
  drop.addEventListener('click', () => file.click());
  drop.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); file.click(); } });
  drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('drag'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('drag'));
  drop.addEventListener('drop', (e) => {
    e.preventDefault();
    drop.classList.remove('drag');
    if (e.dataTransfer.files[0]) loadCmp(side, e.dataTransfer.files[0]);
  });
  file.addEventListener('change', (e) => { if (e.target.files[0]) loadCmp(side, e.target.files[0]); });
}

async function loadCmp(side, f) {
  try {
    const { header, data } = parseCSV(await f.text());
    if (side === 'a') cmpA = { f, header, data };
    else cmpB = { f, header, data };
    const sel = $(`col-${side}`);
    sel.innerHTML = '';
    const pre = header.findIndex((h) => /^(hashed?[_\- ]?email|hash|sha\d*)$/i.test(h));
    const pick = pre >= 0 ? pre : 0;
    header.forEach((h, i) => {
      const opt = document.createElement('option');
      opt.value = String(i);
      opt.textContent = h;
      if (i === pick) opt.selected = true;
      sel.appendChild(opt);
    });
    $(`${side}-file-label`).textContent = `${f.name} — ${data.length} rows`;
    $(`${side}-picker-wrap`).hidden = false;
    $('cmp-error').textContent = '';
  } catch (err) {
    $('cmp-error').textContent = err.message;
  }
}

$('btn-cmp').addEventListener('click', () => {
  $('cmp-error').textContent = '';
  if (!cmpA || !cmpB) { $('cmp-error').textContent = 'Please select both CSVs.'; return; }
  const colA = parseInt($('col-a').value, 10);
  const colB = parseInt($('col-b').value, 10);
  const arrA = cmpA.data.map((r) => String(r[colA] ?? '')).filter(Boolean);
  const arrB = cmpB.data.map((r) => String(r[colB] ?? '')).filter(Boolean);
  const mode = radioValue('cmp-mode');
  let result;
  if (mode === 'overlap') result = intersection(arrA, arrB);
  else if (mode === 'a-minus') result = difference(arrA, arrB);
  else result = difference(arrB, arrA);
  const rows = [...result].map((v) => [v]);
  const csv = stringifyCSV(['hashed_email'], rows);
  $('cmp-result').textContent = `${result.size} rows in result.`;
  triggerDownload(csv, `compare-${mode}.csv`);
});

function triggerDownload(text, filename) {
  const blob = new Blob([text], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function makeWorker() {
  // WORKER_SOURCE is injected as a string constant by the build step.
  const blob = new Blob([WORKER_SOURCE], { type: 'application/javascript' });
  return new Worker(URL.createObjectURL(blob));
}
