import './style.css';
import { Application, Graphics } from 'pixi.js';
import { decodeDds } from './lib/dds';
import { parseFmp } from './lib/fmp';

interface Entry { n: string; s: number; d?: string }
interface ArchiveInfo {
  name: string;
  file: string;
  status: 'ok' | 'encrypted';
  entries: number;
  bytes?: number;
  dataOffset?: number;
  exts?: Record<string, number>;
  recovered?: boolean;
  files?: Entry[];
}
interface AssetsIndex {
  generated: string;
  game: string;
  archives: ArchiveInfo[];
}

const archivesEl = document.getElementById('archives')!;
const filesEl = document.getElementById('files')!;
const filterEl = document.getElementById('filter') as HTMLInputElement;
const previewEl = document.getElementById('preview')!;
const statsEl = document.getElementById('stats')!;

// индекс ассетов генерируется локально (npm run extract) и в git не входит:
// на публичном деплое его нет — показываем лендинг вместо краха
async function loadIndex(): Promise<AssetsIndex | null> {
  try {
    const r = await fetch('/assets-index.json');
    if (!r.ok) return null;
    return (await r.json()) as AssetsIndex;
  } catch {
    return null;
  }
}

const index = await loadIndex();

if (!index) {
  renderLanding();
} else {
  initBrowser(index);
}

function renderLanding() {
  statsEl.textContent = 'онлайн-версия · ассеты игры не публикуются';
  document.querySelector('main')!.innerHTML = `
    <section class="landing">
      <h2>GangLand Web — проект web-порта</h2>
      <p>
        Это публичный деплой проекта ремейка RTS <b>GangLand</b> (MediaMob Studios, 2004).
        Браузер ассетов работает только локально: ресурсы игры извлекаются из
        собственной копии игрока и <b>не публикуются</b> (права принадлежат правообладателю).
      </p>
      <h3>Что уже сделано</h3>
      <ul>
        <li>формат архивов <code>.lfm</code> восстановлен и валидирован;</li>
        <li>7 открытых архивов извлечены (~288 МБ: PNG, DDS, OGG, WAV, модели, анимации, шрифты);</li>
        <li>DDS-декодер DXT1/3/5 в браузере;</li>
        <li>каталоги всех 12 архивов восстановлены — 1234 файла игры поименованы;</li>
        <li>94/107 игровых скриптов (байткод Lua 5.0) расшифрованы;</li>
        <li>все 37 карт кампании извлечены (Vegas, Little Italy, Poor, Docks, Ninja).</li>
      </ul>
      <h3>Запустить локально (нужна собственная копия игры)</h3>
      <pre>npm install
npm run extract   # извлечь ассеты из ../Data
npm run dev       # Asset Browser на http://localhost:5173</pre>
      <p class="links">
        <a href="https://github.com/developkiko/gangland-docs" target="_blank" rel="noopener">GitHub: код и документация</a>
        · <a href="https://github.com/developkiko/gangland-docs/blob/main/PORTING.md" target="_blank" rel="noopener">стратегия порта</a>
        · <a href="https://github.com/developkiko/gangland-docs/blob/main/docs/REVERSE-ENGINEERING.md" target="_blank" rel="noopener">отчёт по реверс-инженерии</a>
      </p>
    </section>`;
}

function initBrowser(index: AssetsIndex) {
  const okArchives = index.archives.filter((a) => a.status === 'ok');
  const totalFiles = okArchives.reduce((a, x) => a + x.entries, 0);
  const totalBytes = okArchives.reduce((a, x) => a + (x.bytes ?? 0), 0);
  const enc = index.archives.filter((a) => a.status === 'encrypted');
  statsEl.textContent =
    `${index.game} · открыто: ${okArchives.length} архивов, ${totalFiles} файлов, ${(totalBytes / 1048576).toFixed(0)} MB · зашифровано: ${enc.map((a) => a.name).join(', ')}`;
  if (!/^localhost$|^127\.0\.0\.1$/.test(location.hostname)) {
    statsEl.textContent += ' · онлайн: доступны только списки файлов';
  }

  let current: ArchiveInfo | null = null;

  for (const a of index.archives) {
    const div = document.createElement('div');
    div.className = 'archive';
    const meta = a.status === 'ok'
      ? `${a.entries} файлов · ${((a.bytes ?? 0) / 1048576).toFixed(1)} MB`
      : a.recovered
        ? `${a.entries} файлов (каталог восстановлен) · содержимое шифровано`
        : `каталог зашифрован · данные с offset ${a.dataOffset}`;
    div.innerHTML = `<span class="badge ${a.status}">${a.status === 'ok' || a.recovered ? 'OK' : 'ENC'}</span>
      <div class="name">${a.name}</div><div class="meta">${meta}</div>`;
    div.addEventListener('click', () => selectArchive(a, div));
    archivesEl.appendChild(div);
  }

  async function addCarved() {
    try {
      const carved: { name: string; size: number; srcPath: string }[] =
        await (await fetch('/extracted/maps_carved/index.json')).json();
      const a: ArchiveInfo = {
        name: 'maps_carved',
        file: 'Data/maps.lfm (carved)',
        status: 'ok',
        entries: carved.length,
        bytes: carved.reduce((acc, x) => acc + x.size, 0),
        exts: { '.fmp': carved.length },
        files: carved.map((c) => {
          const parts = c.srcPath.split(/[\\/]/);
          const place = parts.length >= 2 ? `${parts[parts.length - 2]}/${parts[parts.length - 1].replace(/\.ini$/i, '')}` : c.srcPath;
          return { n: c.name, s: c.size, d: `${c.name} · ${place}` };
        }),
      };
      index.archives.push(a);
      const div = document.createElement('div');
      div.className = 'archive';
      div.innerHTML = `<span class="badge ok">OK</span>
        <div class="name">${a.name}</div><div class="meta">${a.entries} файлов · ${((a.bytes ?? 0) / 1048576).toFixed(1)} MB</div>`;
      div.addEventListener('click', () => selectArchive(a, div));
      archivesEl.appendChild(div);
    } catch { /* карты ещё не вырезаны */ }
  }
  void addCarved();

  function selectArchive(a: ArchiveInfo, div: HTMLElement) {
    current = a;
    document.querySelectorAll('.archive').forEach((x) => x.classList.remove('active'));
    div.classList.add('active');
    filterEl.disabled = !a.files;
    filterEl.value = '';
    renderFiles();
  }

  function renderFiles() {
    filesEl.innerHTML = '';
    if (!current || !current.files) return;
    const query = filterEl.value.toLowerCase();
    const items = query ? current.files.filter((f) => f.n.toLowerCase().includes(query)) : current.files;
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

    const res = await fetch(url);
    if (!res.ok) {
      const note = document.createElement('div');
      note.className = 'note';
      note.textContent = 'Содержимое недоступно: ассеты игры не публикуются и существуют только локально (npm run extract). Здесь показан список файлов.';
      previewEl.appendChild(note);
      const pre = document.createElement('pre');
      pre.textContent = `${current.name}/${f.n}\nразмер: ${f.s} байт`;
      previewEl.appendChild(pre);
      return;
    }
    const buf = await res.arrayBuffer();
    const blob = (type: string) => URL.createObjectURL(new Blob([buf], { type }));

    if (ext === '.png') {
      const img = document.createElement('img');
      img.src = blob('image/png');
      img.alt = f.n;
      previewEl.appendChild(img);
      addCaption('PNG');
    } else if (ext === '.dds') {
      try {
        const img = decodeDds(buf);
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        canvas.getContext('2d')!.putImageData(new ImageData(img.rgba, img.width, img.height), 0, 0);
        previewEl.appendChild(canvas);
        addCaption(`DDS разжат в браузере: ${img.width}×${img.height}, alpha есть`);
      } catch (e) {
        previewEl.innerHTML += `<div class="note">DDS не декодирован: ${(e as Error).message}</div>`;
      }
    } else if (ext === '.ogg' || ext === '.wav') {
      const audio = document.createElement('audio');
      audio.controls = true;
      audio.src = blob(ext === '.ogg' ? 'audio/ogg' : 'audio/wav');
      previewEl.appendChild(audio);
      addCaption('аудио, играй напрямую');
    } else if (ext === '.ini' || ext === '.txt' || ext === '.lua') {
      const pre = document.createElement('pre');
      pre.textContent = new TextDecoder().decode(buf).slice(0, 20000);
      previewEl.appendChild(pre);
      addCaption('текст');
    } else if (ext === '.fmp') {
      try {
        const map = parseFmp(new Uint8Array(buf));
        const cell = 12;
        const app = new Application();
        await app.init({ width: map.gridB * cell + 2, height: map.gridA * cell + 2, background: '#101216' });
        const g = new Graphics();
        for (let gy = 0; gy < map.gridA; gy++) {
          for (let gx = 0; gx < map.gridB; gx++) {
            const v = map.grid[gy * map.gridB + gx];
            if (v !== 0) {
              g.rect(gx * cell + 1, gy * cell + 1, cell - 2, cell - 2)
                .fill({ color: v === 1 ? 0xd8a048 : 0x6fbf73, alpha: 0.9 });
            }
          }
        }
        app.stage.addChild(g);
        previewEl.appendChild(app.canvas);
        addCaption(`FWMP ${map.gridA}×${map.gridB}: занято ${map.occupied} тайлов из ${map.gridA * map.gridB}. Исходник: ${map.srcPath}. Раскладка объектов карты.`);
      } catch (e) {
        const pre = document.createElement('pre');
        pre.textContent = hexdump(new Uint8Array(buf).subarray(0, 512));
        previewEl.appendChild(pre);
        addCaption(`FMP не отрендерен: ${(e as Error).message}`);
      }
    } else {
      const pre = document.createElement('pre');
      pre.textContent = hexdump(new Uint8Array(buf).subarray(0, 512));
      previewEl.appendChild(pre);
      if (ext === '.luac') addCaption('байткод Lua 5.0 (кастомная шапка) — декомпилятор запланирован.');
      else addCaption(`формат ${ext}: разбор формата запланирован (см. docs/ASSET-FORMATS.md).`);
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
}
