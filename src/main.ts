import './style.css';
import { decodeDds } from './lib/dds';

interface Entry { n: string; s: number; d?: string }
interface ArchiveInfo {
  name: string;
  file: string;
  status: 'ok' | 'encrypted';
  entries: number;
  bytes?: number;
  dataOffset?: number;
  exts?: Record<string, number>;
  files?: Entry[];
}
interface AssetsIndex {
  generated: string;
  game: string;
  archives: ArchiveInfo[];
}

const index: AssetsIndex = await (await fetch('/assets-index.json')).json();

// вырезанные карты кампании (см. tools/carve-maps.mjs) добавляем как псевдо-архив
try {
  const carved: { name: string; size: number; srcPath: string }[] =
    await (await fetch('/extracted/maps_carved/index.json')).json();
  index.archives.push({
    name: 'maps_carved',
    file: 'Data/maps.lfm (carved)',
    status: 'ok',
    entries: carved.length,
    bytes: carved.reduce((a, x) => a + x.size, 0),
    exts: { '.fmp': carved.length },
    files: carved.map((c) => {
      const parts = c.srcPath.split(/[\\/]/);
      const place = parts.length >= 2 ? `${parts[parts.length - 2]}/${parts[parts.length - 1].replace(/\.ini$/i, '')}` : c.srcPath;
      return { n: c.name, s: c.size, d: `${c.name} · ${place}` };
    }),
  });
} catch { /* карты ещё не вырезаны */ }

const archivesEl = document.getElementById('archives')!;
const filesEl = document.getElementById('files')!;
const filterEl = document.getElementById('filter') as HTMLInputElement;
const previewEl = document.getElementById('preview')!;
const statsEl = document.getElementById('stats')!;

const okArchives = index.archives.filter((a) => a.status === 'ok');
const totalFiles = okArchives.reduce((a, x) => a + x.entries, 0);
const totalBytes = okArchives.reduce((a, x) => a + (x.bytes ?? 0), 0);
const enc = index.archives.filter((a) => a.status === 'encrypted');
statsEl.textContent =
  `${index.game} · открыто: ${okArchives.length} архивов, ${totalFiles} файлов, ${(totalBytes / 1048576).toFixed(0)} MB · зашифровано: ${enc.map((a) => a.name).join(', ')}`;

let current: ArchiveInfo | null = null;

for (const a of index.archives) {
  const div = document.createElement('div');
  div.className = 'archive';
  const meta = a.status === 'ok'
    ? `${a.entries} файлов · ${((a.bytes ?? 0) / 1048576).toFixed(1)} MB`
    : `каталог зашифрован · данные с offset ${a.dataOffset}`;
  div.innerHTML = `<span class="badge ${a.status}">${a.status === 'ok' ? 'OK' : 'ENC'}</span>
    <div class="name">${a.name}</div><div class="meta">${meta}</div>`;
  div.addEventListener('click', () => selectArchive(a, div));
  archivesEl.appendChild(div);
}

function selectArchive(a: ArchiveInfo, div: HTMLElement) {
  current = a;
  document.querySelectorAll('.archive').forEach((x) => x.classList.remove('active'));
  div.classList.add('active');
  filterEl.disabled = a.status !== 'ok';
  filterEl.value = '';
  renderFiles();
}

function renderFiles() {
  filesEl.innerHTML = '';
  if (!current || current.status !== 'ok' || !current.files) return;
  const q = filterEl.value.toLowerCase();
  const items = q ? current.files.filter((f) => f.n.toLowerCase().includes(q)) : current.files;
  const LIMIT = 800;
  for (const f of items.slice(0, LIMIT)) {
    const li = document.createElement('li');
    li.textContent = f.d || f.n;
    const size = document.createElement('span');
    size.className = 'size';
    size.textContent = fmtSize(f.s);
    li.appendChild(size);
    li.addEventListener('click', () => {
      filesEl.querySelectorAll('li').forEach((x) => x.classList.remove('active'));
      li.classList.add('active');
      preview(f);
    });
    filesEl.appendChild(li);
  }
  if (items.length > LIMIT) {
    const li = document.createElement('li');
    li.textContent = `… и ещё ${items.length - LIMIT} (уточните фильтр)`;
    li.style.color = 'var(--muted)';
    filesEl.appendChild(li);
  }
}

filterEl.addEventListener('input', renderFiles);

async function preview(f: Entry) {
  if (!current) return;
  const url = `/extracted/${current.name}/${f.n}`;
  const ext = f.n.slice(f.n.lastIndexOf('.')).toLowerCase();
  previewEl.innerHTML = `<h2>${current.name}/${f.n} <span style="color:var(--muted)">(${fmtSize(f.s)})</span></h2>`;

  if (ext === '.png') {
    const img = document.createElement('img');
    img.src = url;
    img.alt = f.n;
    previewEl.appendChild(img);
    addCaption(`PNG ${img.naturalWidth || ''}`);
  } else if (ext === '.ogg' || ext === '.wav') {
    const audio = document.createElement('audio');
    audio.controls = true;
    audio.src = url;
    previewEl.appendChild(audio);
    addCaption('аудио, играй напрямую');
  } else if (ext === '.dds') {
    try {
      const img = decodeDds(await (await fetch(url)).arrayBuffer());
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      canvas.getContext('2d')!.putImageData(new ImageData(img.rgba, img.width, img.height), 0, 0);
      previewEl.appendChild(canvas);
      addCaption(`DDS разжат в браузере: ${img.width}×${img.height}, alpha есть`);
    } catch (e) {
      previewEl.innerHTML += `<div class="note">DDS не декодирован: ${(e as Error).message}</div>`;
    }
  } else if (ext === '.ini' || ext === '.txt' || ext === '.lua') {
    const text = await (await fetch(url)).text();
    const pre = document.createElement('pre');
    pre.textContent = text.slice(0, 20000);
    previewEl.appendChild(pre);
    addCaption('текст');
  } else {
    const buf = new Uint8Array(await (await fetch(url)).arrayBuffer());
    const pre = document.createElement('pre');
    pre.textContent = hexdump(buf.subarray(0, 512));
    previewEl.appendChild(pre);
    if (ext === '.dds') addCaption('DDS-текстура: рендер в браузере появится после конвертации в webp/atlas (фаза 0.5).');
    else addCaption(`формат ${ext}: разбор формата запланирован (см. PORTING.md).`);
  }
}

function addCaption(text: string) {
  const cap = document.createElement('div');
  cap.className = 'caption';
  cap.textContent = text;
  previewEl.appendChild(cap);
}

function fmtSize(n: number): string {
  return n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1048576).toFixed(1)} MB`;
}

function hexdump(buf: Uint8Array): string {
  const lines: string[] = [];
  for (let i = 0; i < buf.length; i += 16) {
    const row = [...buf.subarray(i, i + 16)];
    const hex = row.map((b) => b.toString(16).padStart(2, '0')).join(' ');
    const txt = row.map((b) => (b >= 0x20 && b < 0x7f ? String.fromCharCode(b) : '.')).join('');
    lines.push(`${i.toString(16).padStart(6, '0')}  ${hex.padEnd(47)}  ${txt}`);
  }
  return lines.join('\n');
}
