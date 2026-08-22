# Tutorial rápido — cursor-native-agent

Guía corta para clonar, instalar y correr el primer prompt. Para el diseño
completo: `README.md` y `ARCHITECTURE.md`.

Outputs pegados aquí salieron de una pasada real el **2026-08-12** en este
host (Node vía nvm, `cursor-agent` en `~/.local/bin`). Los tuyos pueden variar
en versiones o timings; la forma de las líneas sí debe coincidir.

## Quickstart (3 pasos)

Si ya tienes Node ≥ 20 y `cursor-agent` instalado:

```bash
git clone https://github.com/Rentheria/cursor-native-agent.git
cd cursor-native-agent
npm run setup
```

`npm run setup` instala deps, chequea que `cursor-agent` esté disponible,
crea `.env` con defaults seguros, y crea `workspace/` (directorio para
proyectos de usuario). Al final imprime los tres comandos siguientes.

## Requisitos previos

| Pieza | Versión / nota |
|---|---|
| **Node.js** | ≥ 20 (probado con Node 22+) |
| **Cursor CLI** | binario `cursor-agent` instalado |
| **Cuenta Cursor** | sesión iniciada (`cursor-agent login`) |

### 1. Instalar Cursor CLI

Si aún no tienes el Cursor CLI, instálalo según tu sistema operativo:

| Sistema | Comando de instalación |
|---|---|
| **macOS / Linux / WSL** | `curl https://cursor.com/install -fsS \| bash` |
| **Windows PowerShell** | `irm 'https://cursor.com/install?win32=true' \| iex` |

Más detalles en la [documentación oficial de instalación](https://cursor.com/docs/cli/installation).

El binario `cursor-agent` quedará en:
- Unix: `~/.local/bin/cursor-agent` (o `~/.cursor/bin` según versión)
- Windows: `%LOCALAPPDATA%\cursor-agent\cursor-agent.exe`

Verifica la instalación:

| Sistema | Comando |
|---|---|
| **macOS / Linux / WSL** | `which cursor-agent` |
| **Windows PowerShell** | `Get-Command cursor-agent` o `where cursor-agent` |

Luego verifica la versión:

```bash
cursor-agent --version
```

Salida esperada (Unix):

```text
/home/you/.local/bin/cursor-agent
2026.08.11-e8db854
```

Salida esperada (Windows):

```text
C:\Users\you\AppData\Local\cursor-agent\cursor-agent.exe
2026.08.11-e8db854
```

Si el comando no encuentra el binario, revisa que esté en tu `PATH`:
- Unix: `~/.local/bin`
- Windows: `%LOCALAPPDATA%\cursor-agent`

O exporta `CURSOR_AGENT_BIN_PATH=/ruta/absoluta/a/cursor-agent` (ver `.env.example`).

### 2. Iniciar sesión en Cursor

El agente corre en tu cuenta de Cursor (el uso se cobra/corre en tu subscripción).
Antes del primer prompt:

```bash
cursor-agent login
```

Abre el navegador para autenticarte. Tras confirmar, verifica:

```bash
cursor-agent status
```

Debe mostrar tu cuenta logueada.

### 3. Clonar el repo

El repositorio es público. Podés clonarlo directamente con HTTPS:

```bash
git clone https://github.com/Rentheria/cursor-native-agent.git
cd cursor-native-agent
```

También podés usar el `gh` CLI si lo preferís:

```bash
gh repo clone Rentheria/cursor-native-agent
cd cursor-native-agent
```

## Quickstart

Una vez dentro del directorio clonado (después de `git clone …`):

```bash
npm run setup
```

Salida esperada (cursor-agent presente):

```text
=== cursor-native-agent setup ===

[setup] Installing dependencies...
up to date, audited 7 packages in 415ms

found 0 vulnerabilities
[setup] Creating default configuration...
[onboarding] Created default configuration in .env
[setup] cursor-agent found: /home/you/.local/bin/cursor-agent
[setup] Creating workspace/ directory...
[setup] Created /home/you/cursor-native-agent/workspace

✅ Setup complete!

Next steps:

  1. Try the agent with a prompt:
     npm run agent -- "summarize file MEMORY.md"

  2. Start the dashboard (includes chat):
     npm run dashboard
     Then open http://127.0.0.1:3847

  3. Optional: Configure Telegram bot
     npm run onboard
     (or set TELEGRAM_BOT_TOKEN + TELEGRAM_ALLOWED_CHAT_IDS)

Learn more: README.md and TUTORIAL.md
```

Si cursor-agent no está en PATH, verás instrucciones de instalación y el
script saldrá con código no-cero. Instala `cursor-agent` según tu sistema
operativo (ver sección anterior) y vuelve a correr `npm run setup`.

### Primer prompt

Ahora que `npm run setup` completó, prueba el agente:

```bash
npm run agent -- "summarize file MEMORY.md"
```

Salida esperada:

```text
[agent] Loading skills…
[agent] Skills loaded: 8; matched: summarize-file
[agent] Loading memory index + relevant details…
[agent] Memory index entries: 2; details loaded: agent-architecture
[agent] Calling cursor-agent -p …
…
```

Si ves `matched: summarize-file` y `details loaded: …`, el orquestador está
armando contexto correctamente. El párrafo final lo escribe `cursor-agent`.

**Configuración interactiva (opcional):** `npm run setup` usa defaults
automáticos (Composer 2.5 Fast, puerto 3847, workspace en `<repo>/workspace`,
Telegram omitido). Para personalizar interactivamente (elegir otro modelo,
configurar Telegram, etc.), corre:

```bash
npm run onboard
```

Esto sobrescribe `.env` con tus elecciones.

**Nota sobre matching de skills:** el loader intenta **primero match exacto**
de trigger (palabras/frases completas, no subcadenas). Si ningún trigger
matchea, **cae a semántico** (TF-IDF local sobre nombre + descripción + body de
cada skill). Stderr loguea `matched via exact triggers` o `matched via semantic
fallback`. Desactiva el fallback con `CURSOR_NATIVE_AGENT_SEMANTIC_SKILLS=0`.

## Sobre el modelo y el billing

- **Modelo por defecto:** **Composer 2.5 Fast** — el onboarding configura
  `CURSOR_AGENT_MODEL=composer-2.5-fast` por default para tono consistente en el demo del
  meetup (27-ago-2026). Si querés usar Auto (selección automática de modelo de Cursor),
  seteá `CURSOR_AGENT_MODEL=auto` en el shell o editalo en `.env`. Para otros modelos,
  exportá `CURSOR_AGENT_MODEL=<id>`. Lista de IDs: `cursor-agent models`.
- **Billing:** el uso corre en tu cuenta/subscripción de Cursor. No es un
  servicio separado; es TU agente personal corriendo sobre TU cuenta.

Chequeo estático (opcional pero barato):

```bash
npm run typecheck   # tsc --noEmit → silencioso, exit 0
npm test            # 246/246 pass (node:test, --test-concurrency=1)
```

## Workspace para proyectos de usuario

Cuando le pides al agente construir algo (ej. "haz una calculadora", "make a todo app",
"splitter de gastos en HTML vanilla"), el código y los artefactos van a `workspace/` — **no**
en el repo del wrapper. Ese directorio está gitignoreado (salvo su README). El agente detecta
intención de build automáticamente por frases como "haz un/una", "make a", "build a" o nombres
de artefactos (app, calculadora, splitter, proyecto, etc.). Si el prompt de build está
underspecified, el agente puede pedirte 2-4 aclaraciones antes de construir (lenguaje, UI,
alcance, cómo correrlo). Prompts bien especificados construyen directamente sin preguntar.

## Comandos principales

| Comando | Qué hace | Env vars |
|---|---|---|
| `npm run setup` | Instala deps, crea .env, chequea cursor-agent, crea workspace/ | Ninguna requerida |
| `npm run agent -- "<prompt>"` | Orquesta skills + memoria y llama `cursor-agent -p` | Opcional: `CURSOR_AGENT_BIN_PATH`, `CURSOR_AGENT_MODEL` (default: composer-2.5-fast; seteá a `auto` para Auto), `CURSOR_NATIVE_AGENT_DEBUG=1` |
| `npm run dashboard` | Observatorio HTTP en `127.0.0.1` (logs + MEMORY + chat) | `PORT` (default `3847`). Chat habilitado por defecto; `CURSOR_NATIVE_AGENT_DASHBOARD_CHAT=0` para solo lectura |
| `npm run cron` / `scripts/cron-tick.sh` | Health check real + triage en modo `ask` (Linux/macOS) | Wrapper carga nvm/`~/.local/bin`. Systemd (Linux): setea `HOME` y `PATH` (ver abajo) |
| `npm run telegram` | Canal Telegram → mismo pipeline | **Requiere** `TELEGRAM_BOT_TOKEN` + `TELEGRAM_ALLOWED_CHAT_IDS` (ver `.env.example`) |

Copia `.env.example` → `.env` si quieres config en un solo archivo (Unix:
`cp .env.example .env`, Windows: `copy .env.example .env`). Las vars
ya exportadas en el shell **no** se pisan.

### Trust boundary para canales remotos

Dashboard y Telegram corren en **safe mode** por default: workspace de usuario aislado,
sin `--force` hasta confirmar builds. CLI (`npm run agent`) conserva `--force` directo
(la persona ya tipeó el prompt en su terminal).

**Confirmación de builds:**
- Telegram y dashboard piden confirmación antes de construir apps/scripts que escriben archivos.
- Primer prompt de build: te preguntan `/ok` o `/no`.
- Después de `/ok`: se ejecuta el build con `--force` (escribe bajo el workspace configurado).
- Telegram builds aísla por chat: cada chat ID escribe en `workspace/telegram/<chatId>/`; dashboard escribe en `workspace/`.

**Reabrir conversaciones:**
- En el dashboard, hacer clic en un turno pasado lo carga en el chat actual.
- El siguiente mensaje incluye contexto (prompt previo + respuesta) para continuar el hilo.

Esto permite correr el dashboard y Telegram **sin babysitting** (personal agent, bot-like).

### Mini demos útiles

```bash
# Dashboard con chat (default)
npm run dashboard
# → [dashboard] chat: ENABLED (POST /api/chat)

# Dashboard solo lectura (chat off)
CURSOR_NATIVE_AGENT_DASHBOARD_CHAT=0 npm run dashboard
# → [dashboard] chat: off …

# Con chat habilitado, prueba POST /api/chat vía curl:
# curl sin Origin/Referer (permitido para pruebas locales):
# curl -N -X POST http://127.0.0.1:3847/api/chat \
#   -H 'content-type: application/json' \
#   -d '{"prompt":"en una frase: qué es MEMORY.md"}'
#
# Nota: el dashboard solo acepta POSTs desde localhost/127.0.0.1
# (Origin check). Requests de otros orígenes se rechazan con 403.

# Cron (mismo entrypoint que el timer)
./scripts/cron-tick.sh
# → [cron] Calling cursor-agent -p …
# → === CRON FINDING … ===

# Multi-agente (frase canónica)
npm run agent -- "delega esto a un sub-agente: lista los nombres de archivos bajo skills/"
# → Dispatching worker … / Worker finished exit=0 log=logs/workers/…
```

## Casos de fallo reales (y cómo salir)

Solo incidentes verificados en este repo / host / tickets. No inventados.

### 1. `HOME: unbound variable` (systemd + `cron-tick.sh`)

`scripts/cron-tick.sh` arranca con `set -euo pipefail` y usa `$HOME` para nvm
y `~/.local/bin`. Un unit de systemd **no** exporta `HOME` por defecto.

Repro local (mismo fallo que muerde el timer sin `Environment=HOME=…`):

```bash
env -i PATH=/usr/bin:/bin bash --noprofile --norc -c \
  'set -euo pipefail; export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"'
```

```text
bash: line 1: HOME: unbound variable
```

**Fix:** en el unit, fija home y PATH absolutos (como en `README.md`):

```ini
Environment=HOME=/var/lib/cursor-native-agent
Environment=PATH=/var/lib/cursor-native-agent/.local/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
ExecStart=/opt/cursor-native-agent/scripts/cron-tick.sh
```

### 2. `/usr/bin/npm` no existe (nvm-only hosts)

Ejemplo viejo de crontab usaba `/usr/bin/npm run cron`. En este host:

```bash
ls /usr/bin/npm
```

```text
ls: cannot access '/usr/bin/npm': No such file or directory
```

`npm` vive bajo nvm (`~/.nvm/versions/node/…/bin/npm`). Por eso existe
`scripts/cron-tick.sh`: carga nvm + `~/.local/bin` y luego `exec npm run cron`.
Documentado al vivo en el commit `a8a1a3e` (*fix(cron): load nvm/PATH in
cron-tick…*).

**Fix:** crontab / systemd siempre vía el wrapper, nunca `/usr/bin/npm` a pelo.

### 3. `spawn cursor-agent ENOENT` (dashboard / PATH pobre)

Captura real que disparó C3PO-T2: el dashboard lanzado sin `~/.local/bin` en
`PATH` (aunque `which cursor-agent` en la shell interactiva sí lo veía):

```text
Failed to spawn cursor-agent: spawn cursor-agent ENOENT. Is cursor-agent on PATH?
```

Tras el fix (`766d71e` + mensaje de ayuda), el error guía al override:

```text
Failed to spawn cursor-agent: spawn cursor-agent ENOENT. Is cursor-agent on PATH? Or set CURSOR_AGENT_BIN_PATH to the absolute path of the binary.
```

**Fix (elige uno):**

1. Deja que el resolver encuentre `~/.local/bin/cursor-agent` (default actual), o
2. En `.env`:

```bash
CURSOR_AGENT_BIN_PATH=/home/you/.local/bin/cursor-agent
```

## Qué no hace este tutorial

No sustituye `README.md` / `ARCHITECTURE.md`. No cubre el pitch de 20 min
(skills `stage-pitch` / `code-spotlight`). Si algo truena distinto a los tres
casos de arriba, anota el error exacto antes de “arreglar a ciegas”.
