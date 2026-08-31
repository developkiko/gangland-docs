# AI-CONTEXT.md — кратинка проекта для ИИ-ассистента

Этот файл — точка входа для LLM (Gemini/DeepSeek/etc.), помогающей с проектом.
Здесь только проверенные факты и текущее состояние. Детали в соседних файлах.
**Прогресс по фазам 0–6: [STATUS.md](STATUS.md) — обновляй его при изменении состояния.**

## Что это за проект

Web-порт (ремейк) RTS **GangLand** (MediaMob Studios, 2004, GOG-версия) на TypeScript.
Оригинал лежит рядом: `C:\Meine\gangland-online` (не в git). Проект — папка
`C:\Meine\gangland-online\web` (этот репозиторий). Цель — играбельная браузерная версия
с мультиплеером; всё бесплатно на этапе разработки (Cloudflare Free + Neon Free).

**Юридическое ограничение (не нарушать):** ассеты оригинала (текстуры/звук/скрипты)
принадлежат правообладателю. Они извлекаются ТОЛЬКО локально в `extracted/` (в .gitignore)
и никогда не публикуются и не коммитятся. В репозитории — только наш код и документация.

## Как запустить

```bash
npm install
npm run extract   # извлечь .lfm из ../Data → extracted/ + public/assets-index.json (нужны файлы игры!)
npm run dev       # http://localhost:5173 — Asset Browser (превью ассетов)
npm run build     # vite build (tsc --noEmit сначала)
```

Без файлов игры `npm run dev` всё равно работает — браузер покажет пустой список архивов.

## Стек

- Vite 6 + TypeScript (strict) + PixiJS 8 (пока только задействован косвенно; UI на DOM).
- Тесты не настроены; проверка — `npx tsc --noEmit` и визуальная в браузере.
- Окружение разработчика: Windows 10, Git Bash, **Node 24** (python НЕТ; node умеет
  запускать .ts напрямую через `--experimental-strip-types`). curl/PowerShell доступны.
- Ghidra 12.1.3 + JDK 21 — портативно в `C:\Meine\tools` (вне репозитория).

## Что уже сделано (подробности в README.md / REVERSE-ENGINEERING.md)

1. Формат контейнера `.lfm` полностью восстановлен и валидирован (`src/lib/lfm.mjs`).
2. 7 открытых архивов извлечены (~288 МБ): PNG/DDS/OGG/WAV/MMO/VTA/MMF.
3. DDS-декодер DXT1/3/5 в браузере (`src/lib/dds.ts`) — проверен визуально.
4. Каталоги 5 шифрованных архивов восстановлены из дампа памяти запущенной игры
   (`tools/recover-from-dump.mjs` + `tools/dump-mem.ps1`): 1234 файла поименованы.
5. 94/107 игровых скриптов расшифрованы (`extracted/lua/**.luac`, байткод Lua 5.0
   с кастомной 12-байтной шапкой).
6. maps.lfm разобран: 559 файлов, включая 37 карт кампании (Vegas/Little Italy/Poor/
   Docks/Ninja) — `extracted/maps/`.
7. Asset Browser: архивы, фильтр, превью PNG/DDS/аудио/текст/hex.

## Открытые задачи (в порядке приоритета)

1. **Добор шифрованных блоков** — тексты (text.lfm, 314 ini), характеристики юнитов
   (characters.lfm, 80 ini), map-скрипты (73 luac), icm_*.ini (13), locale.lfm.
   Быстрый путь: запустить миссию в игре → новый дамп памяти → carving
   (механика в tools/recover-from-dump.mjs). Сложный: реверс поточного шифра
   (есть ~180 КБ известных пар «шифр↔текст»: 94 блока .luac).
2. **Декомпилятор/дизассемблер байткода Lua 5.0** с кастомной шапкой
   `1B 4C 75 61 50 01 04 04 04 06 08 09` — превратить .luac в читаемые исходники.
   Кандидаты: unluac (Java), lua-decompiler — потребуют адаптации шапки.
3. **Парсер FWMP-карт** (см. docs/ASSET-FORMATS.md) + рендер тайлов/объектов в PixiJS.
4. **Форматы .mmo/.mmc (модели), .vta (анимации), .mmf (шрифты)** — не разобраны.
5. Ядро симуляции на TS (правила: см. расшифрованные .luac и Custom/Example в игре).
6. Мультиплеер: Cloudflare Durable Objects (комнаты) + Neon Postgres (профили).

## Подводные камни (уже набитые)

- `Data/*.lfm` рядом с репозиторием — в git НЕ входят. Пути: игра = `../Data` от web/.
- `.dds` и `X2.png` в user_interface — разные арты, не дубликаты.
- В именах файлов игры бывают опечатки (бэктики) — не «чинить» молча.
- Извлечённые каталоги из памяти: первое имя может нести мусорный байт-префикс.
- Свежий `public/assets-index.json` генерируется `npm run extract` — не править руками.
- dev-сервер раздаёт `extracted/` через кастомный middleware в `vite.config.ts`.

## Структура репозитория

```
web/
├── index.html, src/          Asset Browser (main.ts, style.css, lib/lfm.mjs, lib/dds.ts)
├── tools/                    экстрактор, карверы, восстановление из дампа, ghidra-скрипты
├── docs/                     REVERSE-ENGINEERING.md, ASSET-FORMATS.md, AI-CONTEXT.md
├── PORTING.md                стратегия порта, тул-чейн, статус
├── README.md                 быстрый старт и текущее состояние
└── public/assets-index.json  (генерируемый, в .gitignore)
```
