# cursor-native-agent

Agente personal construido **100% sobre `cursor-agent`** (Cursor CLI) — skills
en markdown + memoria índice+detalle con carga lazy + loop autónomo por cron +
orquestación multi-agente.

**¿Qué es?** Un agente que corre en TU cuenta de Cursor (tu subscripción, tu
billing). El cerebro es `cursor-agent` (CLI de Cursor); este paquete TypeScript
solo arma el contexto (skills + memoria) y delega todo el razonamiento.

**Modelo por defecto:** **Composer 2.5 Fast** — pinneado en `.env.example` vía
`CURSOR_AGENT_MODEL=composer-2.5-fast` para tono consistente en el demo del
meetup (27-ago-2026). Quitá esa línea, seteala a `auto`, o exportá tu propio
modelo con `CURSOR_AGENT_MODEL=<id>` (correlo con `cursor-agent models` para
ver IDs disponibles) — si está vacía o ausente, cursor-agent usa Auto.

**Cómo empezar en 3 pasos:**

```bash
git clone https://github.com/Rentheria/cursor-native-agent.git
cd cursor-native-agent
npm run setup
```

Requisitos: Node ≥ 20 y `cursor-agent` instalado ([ver abajo](#instalación-rápida)).

Para el walkthrough completo: [TUTORIAL.md](./TUTORIAL.md).

**Para uso personal (download-and-run):** Cada quien lo corre en su máquina.
Dashboard solo en `127.0.0.1`; token en `.env`; confirm before writes. Nunca
commitees `.env`. Ver sección "Para uso personal / seguridad" abajo.

**Cursor no distribuye este producto.** Es un wrapper de ejemplo alrededor del
CLI que vive fuera del IDE. En el IDE trabajas en un repo; esto es el agente
como su propia cosa, autenticado como tú, con markdown skills + memoria lazy +
opcional Telegram/cron/dashboard.

## Origen y demo

Este repo nació como demo pública para el Cursor Meetup GDL del 27-ago-2026,
pero funciona como agente general clonado en cualquier repo.

Checklist del talk: [DEMO-CHECKLIST.md](./DEMO-CHECKLIST.md)

## Para uso personal / seguridad

Este es un **agente personal download-and-run**: cada persona lo corre en su
propia máquina (tu cuenta Cursor, tu billing). No es SaaS multi-tenant.

**Modelo de seguridad:**

- **Dashboard** solo escucha en `127.0.0.1` (localhost). El chat requiere
  `DASHBOARD_TOKEN` de `.env` (generado automáticamente en `npm run setup`).
  Usa el header `X-Dashboard-Token` o `Authorization: Bearer`.
- **Agente** corre con `--trust` sobre el workspace. Dashboard y Telegram piden
  **Confirmar** antes de escribir archivos (`--force` bajo workspace/).
- **Nunca commitees `.env`** (contiene token, Telegram secrets). `threads/` y
  `workspace/` ya están en `.gitignore`.
- **Telegram** opcional; falla cerrado sin `TELEGRAM_ALLOWED_CHAT_IDS` (allowlist
  obligatoria).

No expongas el puerto del dashboard a internet sin autenticación adicional.
Barra de seguridad: suficientemente seguro para que extraños dejen
dashboard/Telegram/cron encendidos diariamente.

El meetup es contexto histórico (footnote); el framing es agente personal
localhost.

## Cursor Plugin (local)

Este repo también se puede cargar como [Cursor Plugin](https://cursor.com/docs/plugins)
desde `~/.cursor/plugins/local/`. Manifest, layout de skills y cómo instalarlo:

ver [`.cursor-plugin/README.md`](./.cursor-plugin/README.md).

Las skills del wrapper siguen en `skills/*.md` (fuente de verdad); el layout
anidado para Cursor se regenera con `./scripts/sync-plugin-skills.sh`.

## Cómo adaptarlo a tu repo

El agente lee todo desde la raíz del repo, así que adaptarlo es editar markdown:

1. Escribe tus propias skills en `skills/*.md` (frontmatter `name` +
   `description`/`triggers`, y el cuerpo son las instrucciones).
2. Sustituye las entradas de `MEMORY.md` por las tuyas y pon el detalle en
   `memory/*.md`. Las convenciones que hay ahí son ejemplos de este repo, no
   requisitos: bórralas o cámbialas.
3. Ajusta el prompt de cron en `src/orchestration/cron-tick.ts` si quieres otro
   trigger que no sea el estado de git.

**Workspace path:** Por defecto, el agente construye proyectos en `<repo>/workspace/`.
Si querés usar otro path (ej. `~/Documents/AGE`), seteá `WORKSPACE_PATH` en `.env`
(durante `npm run setup` se te pregunta Auto o Personalizado). Si está vacío o ausente,
usa `<repo>/workspace`. El agente ve el path resuelto en su contexto de prompt.

No hace falta tocar TypeScript para cambiar el comportamiento del agente.

## Instalación rápida

### Requisitos previos

1. **Node.js ≥ 20** (probado con Node 22+)
2. **Cursor CLI:**
   - macOS / Linux / WSL: `curl https://cursor.com/install -fsS | bash`
   - Windows PowerShell: `irm 'https://cursor.com/install?win32=true' | iex`
   - Docs: [cursor.com/docs/cli/installation](https://cursor.com/docs/cli/installation)
3. **Login:** `cursor-agent login` (abre navegador)

### Setup en un comando

```bash
# 1. Clonar el repo
git clone https://github.com/Rentheria/cursor-native-agent.git
cd cursor-native-agent

# 2. Instalar y configurar (chequea deps + cursor-agent + crea .env y workspace/)
#    Te pregunta dónde querés el workspace (Auto = <repo>/workspace, Personalizado = path absoluto)
npm run setup

# 3. Primer prompt
npm run agent -- "summarize file MEMORY.md"

# 4. (Opcional) Armar tick autónomo de salud
npm run cron:install
```

`npm run setup` crea `.env` con defaults seguros (modelo Composer 2.5 Fast,
Telegram omitido). Si corrés con TTY, te pregunta por el workspace path
(Auto = `<repo>/workspace`, Personalizado = path absoluto o relativo);
no-TTY usa Auto silenciosamente.

**Paso opcional:** después de `npm run setup`, corriendo `npm run cron:install`
arma un cron job que chequea la salud del repo cada día de semana (9:00 AM
local, solo chequeo sin gastar modelo). Si configuraste Telegram, recibís
notificación cuando hay errores/warnings; ticks READY quedan en silencio en
`logs/cron.log`.

Si `cursor-agent` no está en `PATH`, exporta `CURSOR_AGENT_BIN_PATH` o
instálalo según las instrucciones que `npm run setup` imprime.

**Variables de entorno:** `npm run setup` crea `.env` automáticamente con
defaults seguros (Composer 2.5 Fast, puerto 3847, chat habilitado, workspace
en `<repo>/workspace`, Telegram omitido). Los exports del shell ganan sobre
el archivo. Para personalizar, edita `.env` directamente o corre
`npm run onboard` para el flujo interactivo:

**Cambiar modelo:** el default es Composer 2.5 Fast (`CURSOR_AGENT_MODEL=composer-2.5-fast`
en `.env.example`). Para usar otro modelo, exportá `CURSOR_AGENT_MODEL=<id>` en
el shell o editalo en `.env`. Setealo a `auto` o dejalo vacío para que
cursor-agent use Auto (su default sin `--model`). Lista de IDs:
`cursor-agent models`.

Telegram requiere config obligatoria (`TELEGRAM_BOT_TOKEN`,
`TELEGRAM_ALLOWED_CHAT_IDS`) — el bot falla cerrado sin esas vars. Configúralo
con `npm run onboard` o exportando las vars directamente.

Instalación global opcional (comando `cursor-native-agent` disponible en
cualquier directorio):

```bash
npm run build        # compila TypeScript a dist/
npm install -g .
cursor-native-agent --interactive
```

## Uso

### One-shot (`npm run agent`)

Un prompt, un armado de contexto, una llamada a `cursor-agent -p`, y listo.

```bash
npm run agent -- "resume en 3 bullets el archivo MEMORY.md"
```

Qué esperar:

1. stderr muestra skills totales vs matched (p. ej. `summarize-file` si el
   prompt habla de resumir).
2. stderr muestra entradas del índice de memoria y detalles lazy cargados.
3. stdout va apareciendo en vivo conforme el modelo responde (streaming con
   `--output-format stream-json --stream-partial-output`), no de golpe al
   final. Los bloques `<<<MEMORY_WRITE…>>>` nunca se imprimen: el eco se corta
   al detectar el marcador y al cerrar se escribe la respuesta ya limpia.

Matching de skills: los triggers de cada skill son **palabras/frases completas**
(no subcadenas). Cada skill declara `triggers` en el frontmatter; sin ese campo
el loader falla. **Si ningún trigger matchea exactamente**, el loader intenta
un fallback semántico (TF-IDF local sobre nombre + descripción + triggers +
body de cada skill). Desactívalo con `CURSOR_NATIVE_AGENT_SEMANTIC_SKILLS=0`.
El match exacto siempre gana cuando existe. Stderr loguea qué ruta se usó
(`matched via exact triggers` / `matched via semantic fallback`).

Memoria: el índice `MEMORY.md` siempre se inyecta. Los detalles en `memory/*.md`
entran si el prompt matchea keywords del índice/frontmatter **o**, si no hay
match literal, por similitud semántica (TF-IDF local + n-gramas hasheados; sin
API key ni red). Podés desactivar lo semántico con
`CURSOR_NATIVE_AGENT_SEMANTIC_MEMORY=0`. Ver sección [Memoria semántica](#memoria-semántica).

Observabilidad silenciosa: cada turno appendea una línea a
`logs/agent.ndjson`. Para ver el detalle en stderr:

```bash
npm run agent -- --debug "hola"
# o: CURSOR_NATIVE_AGENT_DEBUG=1 npm run agent -- "hola"
```

Otros ejemplos:

```bash
# Dispara skill explain-error
npm run agent -- "explica este error: TypeError: Cannot read properties of undefined"

# Dispara skill git-commit (pide borrador, no ejecuta commit a menos que lo pidas)
npm run agent -- "propón un mensaje de commit Conventional Commits para los cambios actuales"

# Dispara skill remember (memoria que se escribe sola; stderr muestra [memory] …)
npm run agent -- "recuerda esto: en demos de meetup prefiero asiento en primera fila"

# Skills de showcase (demo en vivo)
npm run agent -- "dame un stage pitch de este repo"
npm run agent -- "spotlight src/orchestration/cron-tick.ts"
```

Memoria auto-escrita: la skill `remember` indica al modelo cuándo persistir. El
agente emite un bloque `<<<MEMORY_WRITE…MEMORY_WRITE>>>`; el orquestador lo
aplica (crea `memory/<slug>.md` + línea en `MEMORY.md`), imprime `[memory] …`
en **stderr** (nada silencioso) y quita el bloque del stdout. Así el archivo
cambia en vivo y el demo lo puede mostrar.

### REPL interactivo (`npm run chat`)

Sesión continua: carga skills/memoria una vez, crea un chat de
`cursor-agent` y reutiliza el mismo `chatId` en cada turno. El contexto
(skills + memoria) se inyecta **solo en el primer mensaje**; los siguientes
van crudos al mismo hilo.

```bash
npm run chat
# prompt> hola, qué skills tienes cargadas
# prompt> ahora resume MEMORY.md
# prompt> exit
```

Qué esperar:

- Al arrancar: `Loading skills and memory once…` y `Creating continuous chat session…`.
- Prompt `prompt>` en loop; `exit` o `.exit` cierra.
- Cada respuesta sale por stdout; errores del CLI por stderr.

También: `cursor-native-agent --interactive` / `-i` si lo instalaste global.

### Loop autónomo (cron)

`npm run cron` / `scripts/cron-tick.sh` corre **un chequeo de salud real** del
repo en el momento en que se dispara y luego llama
`cursor-agent -p --force --trust --mode ask` para que **triage** ese resultado,
sin intervención humana. El chequeo (`src/orchestration/repo-health.ts`) lee
disco y git en vivo:

| Chequeo | Severidad | Por qué importa |
|---|---|---|
| `MEMORY.md` apunta a un `memory/*.md` que no existe | error | el índice miente y el detalle nunca carga |
| `memory/*.md` que no está en `MEMORY.md` | warn | el archivo existe pero es inalcanzable por lazy-load |
| `skills/*.md` o `memory/*.md` sin el frontmatter requerido | error | revienta **todos** los turnos, no solo el cron |
| `git status --short` con cambios | warn | el árbol no está limpio para demo |
| git ilegible desde el cron | error | el trigger del tick está roto |

Cada tick además **compara contra el tick anterior** (`logs/cron-health.json`)
y reporta qué apareció, qué se resolvió y si el HEAD se movió. Por eso la
salida cambia con el estado del repo en lugar de repetir una plantilla.

El bloque `=== CRON FINDING … ===` al inicio de `logs/cron.log` trae branch,
latest, tree, la lista de hallazgos, el delta contra el tick previo,
`verdict: READY|WARN|BROKEN` y las dos líneas del agente (`note:` = qué es lo
más importante ahorita, `action:` = qué hacer). El transcript completo va
después. Stdout del tick (si se redirige desde crontab) a
`logs/cron.stdout.log`.

Prueba manual:

```bash
npm run cron
# En la charla, muestra solo el hallazgo:
tail -n 30 logs/cron.log

# Solo el chequeo, sin gastar una llamada a cursor-agent (instantáneo):
npm run cron -- --check-only
```

Demostrar que hace trabajo real (dos ticks, salidas distintas):

```bash
npm run cron -- --check-only                       # baseline
printf -- '---\nname: temp\ndescription: temp\n---\n\nx\n' > memory/temp.md
npm run cron -- --check-only                       # nuevo warn: memory/temp.md sin índice
rm memory/temp.md
npm run cron -- --check-only                       # el mismo warn ahora sale como "resolved"
```

Modo `ask` = el agente **no** edita archivos.

#### Instalación automática (nuevo en semana 3)

Un comando para armar un tick de salud en días de semana, mañana hora local:

```bash
npm run cron:install
```

Por defecto instala un cron que corre **lunes a viernes a las 9:00 AM** (hora
local), con el flag `--check-only` para no gastar llamadas al modelo en ticks
desatendidos. Solo el chequeo de salud (git + memoria + skills) corre; el
agente no triage.

**Notificaciones Telegram (opcional):** Si `TELEGRAM_BOT_TOKEN` y
`TELEGRAM_ALLOWED_CHAT_IDS` están configurados en `.env`, el tick **manda un
mensaje a Telegram solo cuando hay algo que reportar** (errores, warnings; no
en ticks READY). Fail-closed: sin token o sin allowlist, no envía, no rompe.

Para desinstalar:

```bash
npm run cron:uninstall
```

Personalizar schedule (p. ej. cada 30 minutos):

```bash
CURSOR_NATIVE_AGENT_CRON_SCHEDULE="*/30 * * * *" npm run cron:install
```

**Windows:** `cron:install` requiere `crontab` (Unix cron daemon). En Windows,
usá WSL para instalar el cron job, o considerá Task Scheduler como alternativa
(no implementado en este demo).

Requisitos: `cron` o `cronie` instalado. Si `crontab` no existe, el script
sale con código ≠ 0 y un mensaje claro.

Para verificar la instalación:

```bash
crontab -l
```

Deberías ver una línea con `cursor-native-agent <repoRoot>` seguida del comando
que corre `scripts/cron-tick.sh --check-only`.

#### crontab de usuario (instalación manual)

Si prefieres instalar manualmente sin `npm run cron:install`, aquí un ejemplo
cada hora en punto. Ajusta la ruta del repo y la versión de Node:

Ejemplo cada hora en punto. Ajusta la ruta del repo y la versión de Node:

```cron
PATH=$HOME/.nvm/versions/node/v22.0.0/bin:$HOME/.local/bin:/usr/local/bin:/usr/bin:/bin
0 * * * * $HOME/ruta/al/cursor-native-agent/scripts/cron-tick.sh >> $HOME/ruta/al/cursor-native-agent/logs/cron.stdout.log 2>&1
```

**Usa siempre el wrapper `scripts/cron-tick.sh`**, no `npm` a pelo: cron arranca
con un PATH mínimo y el wrapper carga nvm + `~/.local/bin` antes de invocarlo.
Si instalaste Node con nvm no existe `/usr/bin/npm`, y sin el wrapper fallan
`npm`/`node`/`cursor-agent`.

Trigger real = lo que ve `git status --short` + `git log -1`. Archivos en
`.gitignore` **no** aparecen como trigger. Un working tree dirty o un commit
nuevo sí.

Para comprobar un disparo: `grep cron-tick.sh /var/log/syslog` y la cola de
`logs/cron.log` / `logs/cron.stdout.log`.

#### systemd timer (opcional)

El tick le pasa un prompt a `cursor-agent`, así que **no lo corras como root**.
Este es el unit que corre hoy en la VPS de demo: usuario dedicado sin login,
sin capabilities y con el filesystem de solo lectura salvo lo que de verdad
escribe (el estado del agente y `logs/`). `systemd-analyze security` pasa de
`9.6 UNSAFE` (root, sin directivas) a `2.2 OK` con esto.

```ini
# /etc/systemd/system/cursor-native-agent-cron.service
[Unit]
Description=cursor-native-agent cron tick

[Service]
Type=oneshot
TimeoutStartSec=900

# Cuenta de servicio dedicada. Ojo: en un unit de SISTEMA `%h` es SIEMPRE
# /root, sin importar User=, por eso todas las rutas van absolutas.
User=cna
Group=cna
WorkingDirectory=/opt/cursor-native-agent
Environment=HOME=/var/lib/cursor-native-agent
Environment=PATH=/var/lib/cursor-native-agent/.local/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
ExecStart=/opt/cursor-native-agent/scripts/cron-tick.sh

NoNewPrivileges=true
CapabilityBoundingSet=
AmbientCapabilities=
ProtectSystem=strict
ProtectHome=true
# Lo único que escribe: el estado del agente (~/.cursor) y el log del tick.
ReadWritePaths=/var/lib/cursor-native-agent /opt/cursor-native-agent/logs
PrivateTmp=true
PrivateDevices=true
ProtectClock=true
ProtectControlGroups=true
ProtectKernelLogs=true
ProtectKernelModules=true
ProtectKernelTunables=true
ProtectProc=invisible
RestrictAddressFamilies=AF_INET AF_INET6 AF_UNIX
RestrictRealtime=true
RestrictSUIDSGID=true
LockPersonality=true
SystemCallArchitectures=native
# V8 necesita pkey_alloc, que @system-service no cubre.
SystemCallFilter=@system-service @pkey
UMask=0077
```

```ini
# /etc/systemd/system/cursor-native-agent-cron.timer
[Unit]
Description=Hourly cursor-native-agent tick

[Timer]
OnCalendar=hourly
Persistent=true

[Install]
WantedBy=timers.target
```

```bash
sudo useradd --system --create-home \
  --home-dir /var/lib/cursor-native-agent --shell /usr/sbin/nologin cna
sudo systemctl enable --now cursor-native-agent-cron.timer
systemd-analyze security cursor-native-agent-cron.service
```

Trampas verificadas en vivo al aplicarlo (todas dan errores poco obvios):

- **`SystemCallFilter=@system-service` a secas mata el proceso con SIGSYS.**
  Node llama `pkey_alloc` (syscall 330) al arrancar V8; hay que agregar
  `@pkey`. Se diagnostica con
  `journalctl -k | grep seccomp` → `syscall=330`.
- **`MemoryDenyWriteExecute=true` rompe el JIT de V8.** No la pongas.
- **`%h` en unit de sistema es `/root`, no el home de `User=`.** Si vienes de
  un unit con `User=root` y `ReadWritePaths=%h/.cursor`, al mover a un usuario
  dedicado esa línea deja de apuntar a donde crees; usa la ruta absoluta.
- **`ProtectSystem=strict` deja `logs/` de solo lectura** salvo que esté en
  `ReadWritePaths`, y el `~/.cursor` del usuario de servicio tiene que ser
  escribible o el agente no puede guardar estado.
- **El binario `cursor-agent` es un symlink absoluto** a
  `~/.local/share/cursor-agent/versions/<ver>/cursor-agent`. Si copias el
  estado de un usuario a otro, repunta el symlink o el nuevo usuario obtiene
  `Permission denied`.
- **git rechaza un checkout que no es del usuario del servicio**
  (`detected dubious ownership`), y el tick se queda sin trigger. En un deploy
  con `rsync` es lo normal: `sudo git config --system --add safe.directory
  /ruta/al/repo` (sobrevive al siguiente rsync; un `chown` no).

Si prefieres un **user unit** (`~/.config/systemd/user/`, sin root desde el
principio), aplica lo mismo pero con `ProtectHome=read-only` +
`ReadWritePaths=%h/.cursor %h/ruta/al/repo/logs`: ahí `%h` sí es tu home.

### Orquestación multi-agente

La delegación solo dispara con **dos frases canónicas** (a propósito, para que
en el demo en vivo no falle ni dispare de más):

1. `pídele a otro agente que <subtarea>`
2. `delega esto a <destino>: <subtarea>` — el separador puede ser `:`, `—`, `–`
   o un guion normal ` - ` (con espacios, para no partir en el de `sub-agente`)

Con cualquiera de ellas, el CLI despacha un **segundo** `cursor-agent`
(worker headless), loguea en `logs/workers/`, espera a que termine (aviso al
padre = Promise resolve + `notified=parent-promise` en
`logs/workers/active/<ref>.env`), y luego el agente principal llama **otro**
`cursor-agent` para reportar con la salida del worker. Son dos invocaciones
secuenciales de `cursor-agent` (worker → padre), no dos procesos en paralelo.

```bash
# Resumen vía worker (frase 1)
npm run agent -- "pídele a otro agente que resume en una frase el archivo MEMORY.md"

# Listado de skills vía worker (frase 2)
npm run agent -- "delega esto a un sub-agente: lista los nombres bajo skills/"
```

Qué esperar:

1. stderr: `Dispatching worker worker-<timestamp>…`
2. stderr: `Worker finished exit=… log=logs/workers/…`
3. stderr: `Calling parent cursor-agent to report worker result…`
4. stdout: informe del padre que resume la salida del worker.

Patrón de dispatch desacoplado (log + wait + notify). Motor **solo**
`cursor-agent` — sin cadena de fallback a otros CLIs.

### Canal Telegram (`npm run telegram`)

Bot de Telegram por **long polling** (sin servidor público). Cada mensaje de
texto pasa por el mismo pipeline que `npm run agent` (skills + memoria +
`cursor-agent -p`) y la respuesta se envía de vuelta al chat.

La respuesta se manda apenas empieza a generarse y se va **editando en vivo**
(`editMessageText`) conforme llegan los deltas, agrupados cada ~1.5 s o ~200
caracteres para no pegarle al rate limit de Telegram. Al cerrar el turno el
mensaje se reemplaza por la respuesta canónica (partida en varios mensajes si
excede los 4096 caracteres).

> **Allowlist obligatoria.** Un mensaje entrante termina en
> `cursor-agent --force` sobre tu máquina: un bot abierto es ejecución remota
> de código. Por eso el canal **falla cerrado** — sin
> `TELEGRAM_ALLOWED_CHAT_IDS` el bot ni siquiera arranca, y los mensajes de
> chats no listados se ignoran en silencio (se loguean, no se responden).

1. Crea un bot con [@BotFather](https://t.me/BotFather) y copia el token.
2. Exporta el token y la allowlist en tu shell (nunca los commits):

```bash
export TELEGRAM_BOT_TOKEN="<token from BotFather>"
export TELEGRAM_ALLOWED_CHAT_IDS="123456789,-1009876543210"  # obligatorio
export TELEGRAM_ALLOWED_USER_IDS="123456789"                 # opcional: afina por remitente
npm run telegram
```

¿No sabes tu chat ID? Arranca con un placeholder (`TELEGRAM_ALLOWED_CHAT_IDS=0`),
mándale un mensaje al bot y léelo del log
`[telegram] Ignored message from chat=… user=… (not in allowlist)`.

Qué esperar:

- Si falta `TELEGRAM_BOT_TOKEN` o `TELEGRAM_ALLOWED_CHAT_IDS`, el proceso sale
  con código ≠ 0 y un mensaje que explica cómo exportarlos — antes de hacer
  una sola llamada a la API.
- stderr: `[telegram] Long polling started (… allowlist: N chat(s))` y, por
  mensaje autorizado, `[telegram] Message from …` → logs del pipeline
  `[agent] …` → `[telegram] Replied to chat=…`.
- El bot responde en el chat de Telegram. Ctrl+C detiene el long poll.

No hace falta webhook ni URL pública: Node 20+ `fetch` llama a
`getUpdates?timeout=…`. Los tests mockean esa API; no requieren token real.

WhatsApp no está implementado (requiere Meta Business + webhook HTTPS); ver
la sección “Futuro — WhatsApp” en [`ARCHITECTURE.md`](./ARCHITECTURE.md).

### Dashboard web (`npm run dashboard`)

Servidor HTTP local mínimo (`node:http`, sin frameworks nuevos) para **observar**
el agente. Incluye **chat interactivo habilitado por defecto** para localhost;
desactívalo con `CURSOR_NATIVE_AGENT_DASHBOARD_CHAT=0` para modo solo lectura.

El chat pide confirmación antes de escribir cambios; los botones **Confirmar** y
**Cancelar** aparecen en el dashboard y Telegram (inline keyboard) cuando se necesita
`--force`. El token está en `.env` como `DASHBOARD_TOKEN` (después de `npm run setup`).

```bash
npm run dashboard
# http://127.0.0.1:3847/  (chat habilitado por defecto)

# Solo lectura (sin chat):
CURSOR_NATIVE_AGENT_DASHBOARD_CHAT=0 npm run dashboard

# Puerto custom:
PORT=4090 npm run dashboard
```

Qué muestra la página:

1. Últimas entradas de `logs/agent.ndjson` (timestamp, prompt, skills, memoria,
   `cursorAgentMs`, `totalMs`).
2. Hallazgos `=== CRON FINDING … ===` de `logs/cron.log`.
3. Índice de `MEMORY.md` (título, path, keywords).
4. **Chat interactivo** (por defecto) — caja de texto que envía prompts a
   `POST /api/chat` (SSE streaming).

Cada turno en `logs/agent.ndjson` registra latencias:

- `cursorAgentMs` — solo la llamada a `cursor-agent`
- `totalMs` — turno completo (carga de skills/memoria + modelo)

JSON opcional (útil para tests / curl): `/api/agent`, `/api/cron`,
`/api/memory`, `/api/health`. Puerto vía `PORT` (default `3847`). Escucha solo
en `127.0.0.1`.

#### Chat interactivo (habilitado por defecto)

El dashboard registra `POST /api/chat` (SSE) y muestra una caja de chat. Usa el
mismo `runAgentTurn` que `npm run agent` / Telegram, con streaming
(`--output-format stream-json --stream-partial-output`).

**Autenticación:** El dashboard usa cookies de sesión HttpOnly para localhost (happy path: abrís el dashboard y funciona). El token `DASHBOARD_TOKEN` (`.env`) se usa solo para APIs fuera del navegador o si borraste cookies. Modal "Desbloquear" como fallback.

```bash
# Chat habilitado (default):
npm run dashboard

# Desactivar chat (solo lectura):
CURSOR_NATIVE_AGENT_DASHBOARD_CHAT=0 npm run dashboard
```

**Autenticación:** El dashboard requiere `DASHBOARD_TOKEN` (generado automáticamente en `npm run setup` y guardado en `.env`). Al abrir el dashboard desde localhost, el servidor emite una cookie de sesión HttpOnly firmada que dura 7 días. El navegador incluye esta cookie automáticamente en cada request. **Happy path: abrís el dashboard y chateás directo, sin pegar tokens.** Solo necesitás el token si borraste cookies o llamás a la API desde fuera del navegador (curl, etc.).

**Seguridad y trust boundary:** Dashboard y Telegram ejecutan prompts en **modo seguro** (repoRoot cwd, `--trust`, sin `--force` hasta confirmar):

- **Confirmación de builds:** Solicitudes de build (apps, scripts) piden confirmación antes de escribir archivos.
- **Primera solicitud de build:** El sistema responde pidiendo `/ok` o `/no` (dashboard) o confirmación (Telegram).
- **Después de confirmar:** Se ejecuta el build con `--force`, escribiendo en el workspace configurado.
- **Workspace aislado por canal:**
  - Dashboard: escribe en `workspace/` (compartido, configurable vía `WORKSPACE_PATH`).
  - Telegram: cada chat ID aislado en `workspace/telegram/<chatId>/` (evita colisiones entre usuarios).
- **Reabrir conversaciones:** En el dashboard, hacer clic en un turno pasado lo carga en el chat con contexto (el siguiente mensaje incluye el prompt previo + respuesta para continuar el hilo).

CLI (`npm run agent`) conserva `--force` directo (el usuario ya tipeó el prompt en su terminal). Cron usa `--mode ask` (nunca escribe).

Además, el dashboard aplica verificación de origen (solo `127.0.0.1`/`localhost`), cap de 256 KiB en el body (413 si excede), y rate limit (un turno concurrente + 10/min → 429). **No expongas este puerto a internet sin autenticación adicional.**

## Arquitectura

Flujo one-shot (alto nivel):

```
prompt del usuario
        │
        ├─► skills-loader   — lee skills/*.md, match por triggers/keywords
        ├─► memory-loader   — MEMORY.md + detalle (keywords o semántica local)
        ├─► ¿delegación?    — si hay intent → worker (ver abajo)
        └─► prompt-builder  — concatena índice + detalles + skills + prompt
                    │
                    ▼
            cursor-agent -p "<prompt final>"
                    │
                    ▼
               respuesta en stdout
```

Flujo de delegación:

```
prompt con frase canónica
("pídele a otro agente que…" / "delega esto a…")
        │
        ▼
  detección de intent (src/core/delegation.ts)
        │
        ▼
  dispatchWorker → 2º cursor-agent (log en logs/workers/)
        │
        ▼
  espera (Promise) hasta exit del worker
        │
        ▼
  agente principal → 3er paso: cursor-agent reporta con la salida del worker
```

Cron:

```
npm run cron / scripts/cron-tick.sh
        │
        ├─► git status --short + git log -1 (+ branch)
        ├─► cursor-agent -p --force --trust --mode ask
        └─► append FINDING block → logs/cron.log (luego transcript)
```

Telegram:

```
npm run telegram
        │
        ├─► TELEGRAM_BOT_TOKEN (obligatorio)
        ├─► getUpdates long poll (fetch nativo)
        ├─► runAgentTurn (skills + memoria + cursor-agent)
        └─► sendMessage → chat
```

Dashboard (chat habilitado por defecto; modo seguro):

```
npm run dashboard
        │
        ├─► lee logs/agent.ndjson (+ cursorAgentMs / totalMs)
        ├─► lee logs/cron.log (bloques CRON FINDING)
        ├─► lee MEMORY.md (índice)
        ├─► GET / → HTML  |  GET /api/* → JSON
        └─► (chat habilitado por defecto; modo seguro: repoRoot cwd, sin --force, con --trust)
              POST /api/chat → runAgentTurn (SSE stream, origin check, rate limit)
              set CURSOR_NATIVE_AGENT_DASHBOARD_CHAT=0 to disable
```

Layout del código:

```
src/core/           entrypoint CLI, REPL, agent-turn, armado del prompt, invocación de cursor-agent
src/channels/       adaptadores de canal (Telegram long poll)
src/loaders/        lectura de skills y memoria (keywords + semántica)
src/orchestration/  cron tick (finding demoable) y dispatch de workers
src/dashboard/      servidor HTTP read-only (HTML + parsers de logs)
src/lib/            tipos, constantes, embeddings locales (TF-IDF)
skills/*.md         skills de ejemplo + showcase (stage-pitch, code-spotlight, …)
MEMORY.md           índice siempre cargado
memory/*.md         detalle lazy por keyword/semántica (también vía skill remember)
```

El diseño de alcance, plan por semanas y decisiones de producto están en
[`ARCHITECTURE.md`](./ARCHITECTURE.md). Esta sección del README basta para
entender qué hace el repo sin abrir ese archivo.

### Memoria semántica y skills

Por defecto el loader usa un backend **local** (TF-IDF sobre unigramas/bigramas
+ character n-grams hasheados) en `src/lib/embeddings/`. No requiere API key ni
configuración. Tanto memoria como skills comparten el mismo ranker local; los
knobs de ranking (top-K, threshold) son comunes.

| Variable | Default | Efecto |
| --- | --- | --- |
| `CURSOR_NATIVE_AGENT_SEMANTIC_MEMORY` | on | `0` / `false` / `off` desactiva el fallback semántico de memoria |
| `CURSOR_NATIVE_AGENT_SEMANTIC_SKILLS` | on | `0` / `false` / `off` desactiva el fallback semántico de skills |
| `CURSOR_NATIVE_AGENT_SEMANTIC_TOP_K` | `3` | Máximo de hits semánticos (compartido: memoria + skills) |
| `CURSOR_NATIVE_AGENT_SEMANTIC_THRESHOLD` | `0.12` | Score mínimo de similitud (cosine / TF-IDF; compartido) |
| `CURSOR_NATIVE_AGENT_EMBEDDINGS_PROVIDER` | `local` | `local` / `tfidf`, o `custom` |
| `CURSOR_NATIVE_AGENT_EMBEDDINGS_MODULE` | (vacío) | Ruta a un módulo ESM si `PROVIDER=custom` |
| `CURSOR_NATIVE_AGENT_DASHBOARD_CHAT` | on | `0` / `false` / `off` desactiva chat (dashboard solo lectura) |

Extensión (opcional, no rompe si falta):

```bash
# Módulo que exporte createEmbeddingProvider(): { id, embed(texts) }
export CURSOR_NATIVE_AGENT_EMBEDDINGS_PROVIDER=custom
export CURSOR_NATIVE_AGENT_EMBEDDINGS_MODULE=./path/to/my-provider.mjs
npm run agent -- "pregunta que no usa las keywords del índice"
```

Si el módulo no existe, no exporta la factory, o el provider es desconocido, el
loader imprime un aviso en stderr y sigue con TF-IDF local.

## Cómo mejorarlo / roadmap

Ideas abiertas — sin fechas ni compromisos. Útiles si quieres contribuir o
forkear:

- **Más canales** — WhatsApp (Meta Business + webhook; ver `ARCHITECTURE.md`)
  u otros transportes además de CLI / Telegram.
- **Provider de embeddings remoto** — implementar un módulo `custom` (OpenAI,
  etc.) contra el punto de extensión ya documentado; el default local no cambia.
- **Dashboard más rico** — workers activos, transcripts completos, auto-refresh
  (hoy hay un observatorio read-only mínimo: agent.ndjson + cron findings + MEMORY.md).
- **Backups automáticos** — snapshot de `MEMORY.md` + `memory/` + logs.
- **Más skills de ejemplo** — p. ej. revisión de PR, changelog, diagnóstico de
  CI fallido.
- **Más tests** — cobertura de loaders edge-case, REPL, y paths de error de
  `cursor-agent`.
- **Otros triggers de cron** — además de `git status` (p. ej. edad del último
  commit, tamaño de `logs/`, healthcheck HTTP local).
- **Mejoras al loader** — triggers compuestos, prioridades entre skills,
  exclusiones explícitas.

Ver también “Fuera de alcance” en `ARCHITECTURE.md` y [`CONTRIBUTING.md`](./CONTRIBUTING.md).

## Comandos de referencia

```bash
npm run setup                 # setup inicial (deps + .env + workspace/ + check cursor-agent)
npm run agent -- "<prompt>"   # orquesta skills/memoria → cursor-agent -p
npm run chat                  # REPL continuo
npm run cron                  # tick autónomo (git trigger + cursor-agent)
npm run cron:install          # instala cron job para ticks desatendidos (weekdays 9:00 AM)
npm run cron:uninstall        # desinstala cron job
npm run telegram              # bot Telegram (requiere TELEGRAM_BOT_TOKEN)
npm run dashboard             # observatorio HTTP + chat (PORT, default 3847)
npm run onboard               # configuración interactiva (modelo, workspace, Telegram)
npm run typecheck             # tsc --noEmit
npm run build                 # tsc (compila a dist/)
npm test                      # node:test en serie (--test-concurrency=1)
```

---

**Nota sobre el origen:** Este repo se creó para el Cursor Meetup GDL del
27-ago-2026 como demo en vivo, pero funciona como agente general clonado en
cualquier proyecto.
