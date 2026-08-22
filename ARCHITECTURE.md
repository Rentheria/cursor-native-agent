# Agente nativo de Cursor — diseño

> Vista de alto nivel, instalación y ejemplos de uso: ver [`README.md`](./README.md).
> Cómo contribuir: [`CONTRIBUTING.md`](./CONTRIBUTING.md). Este archivo cubre
> alcance, decisiones de diseño y arquitectura — no duplica la guía de uso.

## Objetivo
Agente personal de download-and-run corriendo 100% sobre Cursor CLI/Agent
(`cursor-agent` headless), que combina skills cargables, memoria persistente en
markdown, loop autónomo vía cron, y orquestación multi-agente con dispatch a
sub-agentes.

**No es SaaS multi-tenant:** cada persona lo clona y corre en su propia máquina
(tu cuenta Cursor, tu billing). El workspace default es `<repo>/workspace/`
(aislado, gitignored). Dashboard y chat en `127.0.0.1` con token generado en
`npm run setup`.

**Barra de seguridad:** suficientemente seguro para que extraños dejen
dashboard/Telegram/cron encendidos para uso local diario — no hardening de
internet público.

**Origen:** demo para el Cursor Meetup GDL del **27-ago-2026**, pero funciona
como agente general clonado en cualquier repo. El meetup es contexto histórico;
el framing actual es agente personal localhost.

## Alcance implementado

1. **Skills** — carpeta `skills/*.md`. Cada skill = frontmatter (nombre,
   descripción/trigger) + instrucciones. El agente principal decide cuál cargar
   según el prompt entrante (mismo patrón que `.claude/skills` de este workspace).
2. **Memoria** — `MEMORY.md` (índice, una línea por entrada) + `memory/*.md`
   (detalle). Lazy-load: el índice siempre se carga; el detalle entra por
   keywords del índice/frontmatter **o**, si no hay match literal, por
   similitud semántica local (TF-IDF + n-gramas hasheados, sin API key).
   Extensión opcional vía `CURSOR_NATIVE_AGENT_EMBEDDINGS_PROVIDER=custom`
   + módulo (`CURSOR_NATIVE_AGENT_EMBEDDINGS_MODULE`). La skill `remember`
   permite persistir entradas nuevas de forma **explícita** (bloque
   `MEMORY_WRITE` → escritura visible en stderr, nada silencioso).
3. **Loop autónomo** — cron del sistema corre un chequeo de salud del repo
   (git + índice de memoria + skills), lo diffea contra el tick anterior y
   dispara `cursor-agent -p` para triagearlo, sin intervención humana.
   Instalación: `npm run cron:install` (weekdays 9:00 AM, solo check-only).
4. **Orquestación multi-agente** — el agente principal puede despachar una
   subtarea a otra instancia de `cursor-agent` (worker headless) y recoger el
   resultado antes de reportar (patrón de dispatch desacoplado: log + wait + notify).
5. **Canales múltiples** — CLI interactivo, dashboard web (127.0.0.1 con chat
   habilitado por defecto, token en `.env`), y Telegram opcional (long polling,
   allowlist obligatoria, `TELEGRAM_BOT_TOKEN` fail-closed).
6. **Threads persistentes** — conversaciones guardadas en `threads/` (gitignored).
   Dashboard y Telegram mantienen contexto entre turnos. Telegram usa ID estable
   `telegram-chat-<chatId>`; `/start` crea o resetea. Dashboard muestra threads
   recientes en sidebar.

## Canal Telegram (implementado, opcional)

`npm run telegram` recibe mensajes de un bot vía **long polling**
(`getUpdates` + timeout) — no hace falta un servidor público ni webhooks.
Usa `fetch` nativo de Node (≥20); sin dependencias nuevas. **Cada chat mantiene
su propio thread persistente** (un thread por `chatId`), guardado en
`threads/telegram-chat-<id>.json` (gitignored).

Flujo:

```
Telegram (usuario) → getUpdates (long poll)
        │
        ▼
 extractInboundTextMessages
        │
        ▼
 runAgentTurn  (mismo pipeline unificado que CLI/dashboard:
                skills + memoria + thread context + cursor-agent -p)
        │
        ▼
 sendMessage (respuesta al chat; trocea si > 4096 chars;
              edita en vivo conforme llegan deltas)
```

- Token **obligatorio** en `TELEGRAM_BOT_TOKEN` (export en el shell o `.env`). Si falta, el comando falla con instrucciones claras antes de tocar la API. Nunca se
  hardcodea ni se inventa un token en el repo.
- Allowlist **obligatoria** en `TELEGRAM_ALLOWED_CHAT_IDS` (opcionalmente
  afinada con `TELEGRAM_ALLOWED_USER_IDS`). El mensaje entrante acaba en
  `cursor-agent --force`, así que un bot abierto es RCE: el canal falla
  cerrado (no arranca sin allowlist) y descarta en silencio lo que venga de
  chats no listados. La verificación vive en `dispatchInboundMessage`, pegada
  a la llamada al pipeline, para que ningún caller la rodee.
- **Confirmar antes de --force:** Telegram muestra inline keyboard (Confirmar/Cancelar)
  cuando el agente pide escribir bajo workspace. El bot espera callback_query
  (`/ok` o `/no` alternativos). Solo después de confirmar se ejecuta con `--force`.
- **Threads estables:** `/start` crea o resetea `telegram-chat-<chatId>.json`.
  Cada mensaje reutiliza ese thread. Callback_query de Confirmar/Cancelar también
  lo reutiliza para que el contexto persista.
- Código: `src/channels/telegram.ts` (loop), `telegram-api.ts` (cliente),
  `telegram-parse.ts` (parsing), `telegram-allowlist.ts` (autorización).
  Pipeline compartido: `src/core/agent-turn.ts`.
- Tests mockean `fetch` — no pegan a `api.telegram.org`.

## Fuera de alcance actual (documentado, no implementado)

- **WhatsApp** — requiere Meta Business + webhook HTTPS (ver sección "Futuro — WhatsApp" abajo).
- **SaaS multi-tenant** — este es un agente personal download-and-run, no un
  servicio cloud con autenticación de múltiples usuarios.
- **HTTPS/TLS** — dashboard solo escucha en `127.0.0.1`; no está diseñado para
  exposición pública.
- **Backups automáticos** — no hay snapshot automático de `MEMORY.md` + `memory/` + logs.
- **Windows Task Scheduler** — `cron:install` requiere Unix crontab; en Windows
  usar WSL o implementar alternativa con Task Scheduler (no implementado).
- **Provider de embeddings cloud** — punto de extensión documentado
  (`EMBEDDINGS_PROVIDER=custom` + módulo), pero no hay implementación de
  OpenAI/Cohere/etc incluida (solo TF-IDF local).
## Dashboard web (observabilidad local + chat)

`npm run dashboard` levanta un servidor HTTP nativo (`node:http`, sin
frameworks) en `127.0.0.1` con puerto `PORT` (default `3847`). Las conversaciones
persisten en threads (guardados en `threads/`, gitignored) y sobreviven a
refrescar la página. Sirve una página HTML que muestra:

1. **Threads de conversación** (lista en sidebar, crear nuevo, continuar existentes).
2. Últimas entradas de `logs/agent.ndjson` (turnos: prompt, skills matched,
   memoria, `cursorAgentMs`, `totalMs`).
3. Hallazgos `=== CRON FINDING … ===` de `logs/cron.log` (branch, tree, verdict, note).
4. Índice parseado de `MEMORY.md`.

Por defecto **incluye chat interactivo** (habilitado): JSON auxiliar en `/api/agent`,
`/api/cron`, `/api/memory`, `/api/health`, `/api/chat` (SSE). Código en `src/dashboard/` (parsers +
server + HTML). Tests: parseo de logs y rutas HTTP.

### Chat interactivo (habilitado por defecto)

Por defecto habilitado en localhost. Con `CURSOR_NATIVE_AGENT_DASHBOARD_CHAT=0`
(o `false`/`off`) se desactiva y el dashboard queda solo lectura (no registra
`POST /api/chat` ni muestra la UI).
El handler reutiliza `runAgentTurn` (mismo pipeline unificado que `npm run agent` /
Telegram) con streaming opt-in vía
`--output-format stream-json --stream-partial-output`.

**Threads persistentes:** Cada conversación se guarda automáticamente en
`threads/<id>.json` (gitignored). El dashboard lista threads recientes en el
sidebar, puedes crear nuevas conversaciones, y continuar threads existentes.
Refrescar la página reabre el último thread. Telegram mantiene un thread por
`chatId` (`telegram-chat-<id>`). El CLI sigue siendo one-shot (sin threads) a menos que uses `--resume <id>`.

**Autenticación:** Dashboard requiere `DASHBOARD_TOKEN` de `.env` (generado
automáticamente en `npm run setup`) para acceder a las APIs de chat y conversación.
Header `X-Dashboard-Token` o `Authorization: Bearer <token>`. Fail-closed: sin
token configurado, el dashboard no arranca en modo chat.

**Nota de seguridad (modo seguro):** esta ruta ejecuta prompts con `--trust`
sobre `<repo>/workspace/` (configurable vía `WORKSPACE_PATH`). **Sin `--force`
hasta confirmar:** cuando el agente pide escribir archivos, el dashboard muestra
modal de desbloqueo (Confirmar/Cancelar) y el backend espera `POST /api/unlock` con
`action: 'confirm'` o `'cancel'`. Solo después de confirmar se ejecuta con `--force`.
Además aplica verificación de origen (solo `127.0.0.1`/`localhost` o solicitudes sin Referer), cap de 256 KiB en el body
(413 si excede), y rate limit (un turno concurrente + 10/min → 429). **No exponer
a internet sin autenticación adicional.** CLI y Telegram también confirman antes
de `--force`; cron usa `--mode ask` (nunca escribe).
## Implementado además del alcance mínimo
- **Memoria semántica (embeddings locales)** — default TF-IDF + hashed
  char n-grams en `src/lib/embeddings/` (sin servicio de pago). El loader
  (`src/loaders/memory-loader.ts`) une keyword match + top-K semántico.
  Provider real opcional vía env (`custom` + módulo); si falta, cae a local.
- **Dashboard web** — servidor HTTP (`127.0.0.1`) con observabilidad (threads,
  logs, cron findings, índice de memoria) y chat interactivo habilitado por
  defecto. Autenticación vía `DASHBOARD_TOKEN` generado en setup. Modo seguro:
  confirmar antes de `--force`.
- **Threads persistentes** — conversaciones guardadas en disco (`threads/`,
  gitignored). Dashboard y Telegram mantienen contexto entre turnos; Telegram
  usa ID estable `telegram-chat-<chatId>`. CLI one-shot por defecto.
- **Skills de showcase** — `stage-pitch.md`, `code-spotlight.md` para demos en vivo.
- **Instalación automática de cron** — `npm run cron:install` arma job de
  weekday check-only sin intervención manual del usuario.

## Patrones de diseño aplicados

### Pipeline unificado (`runAgentTurn`)

Todos los canales (CLI, dashboard, Telegram, cron) comparten el mismo flujo:

```
prompt → skills-loader → memory-loader → delegation? → prompt-builder → cursor-agent -p
```

Diferencias por canal:
- **CLI:** one-shot, `--force --trust` directo (usuario ya tipeó el prompt).
- **Dashboard:** modo seguro (`--trust`, sin `--force` hasta confirmar), workspace en `<repo>/workspace/`.
- **Telegram:** modo seguro (`--trust`, sin `--force` hasta confirmar), workspace aislado por chat en `workspace/telegram/<chatId>/`.
- **Cron:** `--mode ask` (nunca escribe), sin workspace override.

### Modo seguro y confirmación

Dashboard y Telegram ejecutan en "modo seguro" (no `--force` automático). Cuando
el agente necesita escribir archivos:

1. Detecta bloque `<<<BUILD_REQUEST…>>>` en la salida del agente.
2. Muestra UI de confirmación (modal en dashboard, inline keyboard en Telegram).
3. Espera respuesta del usuario (`/ok` o `/no` en Telegram; `POST /api/unlock` en dashboard).
4. Solo después de confirmar, re-ejecuta con `--force`.

Esta confirmación protege contra escrituras no intencionales sin bloquear el flujo.

### Threads estables

- Dashboard: genera ID único por thread (`thread-<timestamp>-<random>`).
- Telegram: ID estable por chat (`telegram-chat-<chatId>`); `/start` crea o resetea.
- Ambos: mensajes se appendean vía `appendToThread`; contexto persiste entre turnos.
- Thread context se inyecta en el prompt vía `buildThreadContext` (últimos N
  exchanges, capped por char length).

### Fail-closed security

- **Dashboard token:** Sin `DASHBOARD_TOKEN` en `.env`, el chat no arranca (solo modo lectura).
- **Telegram allowlist:** Sin `TELEGRAM_ALLOWED_CHAT_IDS`, el bot no arranca; mensajes de chats no listados se ignoran.
- **Origin check:** Dashboard solo acepta requests de `127.0.0.1`/`localhost` (o sin Referer).
- **Rate limit:** Dashboard caps a un turno concurrente + 10/min; retorna 429 si excede.

## Decisiones de arquitectura clave

### ¿Por qué `cursor-agent` como único motor?

No hay fallback a otros CLIs (`aichat`, `copilot-cli`). Ventajas:
- Motor único → comportamiento consistente entre canales.
- Demo verificable del CLI de Cursor, que es el punto del meetup.
- Más fácil de diagnosticar: un solo path de ejecución, un solo log.

### ¿Por qué workspace en `<repo>/workspace/` en vez de `~/Documents`?

Aislamiento: el workspace vive dentro del repo clonado, no en un directorio
global. Cada quien clona el repo una vez, hace `npm run setup`, y el workspace
queda ahí. Ventajas:
- Gitignored por defecto, no spammea el home del usuario.
- Borrar el repo borra el workspace (cleanup limpio).
- Telegram puede aislar por chat (`workspace/telegram/<chatId>/`) sin colisiones.

### ¿Por qué threads en disco en vez de DB?

Simplicidad: un archivo JSON por thread, guardado en `threads/` (gitignored).
No requiere setup de DB, no requiere migración de schema. Para uso local
(cientos de threads, no millones) es suficiente y demoable en una charla sin
explicar DB external.

### ¿Por qué TF-IDF local en vez de embeddings cloud?

Cero config: el agente corre out-of-the-box sin API keys de OpenAI/Cohere/etc.
Para un demo de meetup (y uso personal) es suficiente. El punto de extensión
(`EMBEDDINGS_PROVIDER=custom` + módulo) permite swap transparente si el usuario
quiere un provider remoto — el código del agente no cambia.

### ¿Por qué cron weekday check-only en `cron:install`?

Trade-off: queremos que el usuario pueda instalar un tick autónomo sin gastar
llamadas al modelo en cada tick desatendido. `--check-only` corre el chequeo
de salud (git + memoria + skills) instantáneo, loguea en `logs/cron.log`, y
manda notificación Telegram solo si hay errores/warnings (no en ticks READY).
El usuario puede correr `npm run cron` sin `--check-only` manualmente cuando
quiera el triage completo del agente.

### ¿Por qué `git-commit` skill rechaza `git init`?

Seguridad conservadora: no queremos que el agente cree repos nuevos por
accidente (p. ej. si el usuario corre el agente en un directorio equivocado).
La skill falla con mensaje claro si no hay `.git`, y el usuario hace `git init`
a mano si de verdad quiere un repo nuevo.

## Estado del proyecto (post-meetup)

El meetup del 27-ago-2026 fue el lanzamiento público. El repo funciona como
agente personal para uso diario:

- Todos los canales implementados (CLI, dashboard, Telegram, cron).
- Threads persistentes, modo seguro con confirmación, fail-closed security.
- Skills + memoria semántica local funcionan out-of-the-box.
- Instalación en un comando (`npm run setup`).

El framing es **agente personal localhost**, no "demo de meetup". El meetup es
contexto histórico en el README; este doc de arquitectura refleja el estado
actual como producto usable.

## Referencia de patrones implementados (diseño reusable)

Estos patrones son reusables en otros proyectos (el diseño, no código propietario):

- **Skills cargables** — markdown con frontmatter (nombre, triggers) + cuerpo de
  instrucciones. Loader matchea por triggers exactos o fallback semántico.
- **Memoria índice+detalle** — `MEMORY.md` (índice siempre cargado) +
  `memory/*.md` (lazy-load por keywords o semántica). Patrón escalable a miles
  de entradas sin cargar todo en cada turno.
- **Dispatch headless desacoplado** — proceso separado (`cursor-agent` worker),
  log file (`logs/workers/`), wait hasta terminar (Promise), aviso al padre.
  Permite orquestación multi-agente sin necesidad de mensaje queue external.
- **Pipeline unificado** — un solo flujo (`runAgentTurn`) reutilizado por todos
  los canales (CLI, dashboard, Telegram, cron). Diferencias por canal
  (workspace, flags, confirmación) sin duplicar la lógica central.
- **Modo seguro con confirmación** — canales que ejecutan prompts del usuario
  (dashboard, Telegram) no usan `--force` automático; detectan intent de
  escritura y piden confirmación explícita antes de ejecutar. Reduce riesgo de
  escrituras accidentales sin bloquear el flujo.
- **Threads persistentes con ID estable** — Telegram usa `telegram-chat-<chatId>`
  (sobrevive a restart del bot); dashboard genera IDs únicos. Ambos appendean
  a JSON en disco; contexto se inyecta vía `buildThreadContext`.
- **Fail-closed security** — token/allowlist obligatorios; sin config, el canal
  no arranca (no cae a un default inseguro). Origin check, rate limit, cap de
  body size.
- **Memoria auto-escrita explícita** — skill `remember` indica al modelo cuándo
  persistir; el agente emite bloque `<<<MEMORY_WRITE…>>>`, el orquestador lo
  aplica (crea `memory/<slug>.md` + línea en `MEMORY.md`), y loguea visiblemente
  en stderr. Nada silencioso: el usuario ve que la memoria cambió.

Convención de contribuciones: ver [`CONTRIBUTING.md`](./CONTRIBUTING.md).

## Futuro — WhatsApp (solo diseño, no implementar aún)

WhatsApp **no** se implementa en este repo por ahora. A diferencia de Telegram
(un bot token + long polling desde cualquier máquina), WhatsApp Cloud API /
Meta Business exige infraestructura que no encaja en el demo local:

1. **Meta Business / WhatsApp Business Account** — app en Meta for Developers,
   número verificado, y tokens de acceso de corta/larga duración.
2. **Webhook HTTPS público** — Meta entrega mensajes con POST a una URL
   alcanzable desde internet (certificado TLS válido). No hay long polling
   equivalente al de Telegram; hace falta un túnel (`ngrok`, etc.) o un host
   expuesto, más verificación del challenge `hub.challenge` al suscribirse.
3. **Plantillas y políticas** — fuera de la ventana de 24h muchas respuestas
   requieren plantillas preaprobadas; el onboarding y la moderación son más
   pesados que un bot de Telegram creado con `@BotFather`.

Cuando se retome: reutilizar `runAgentTurn` (`src/core/agent-turn.ts`) como
transport-agnostic pipeline y añadir un adaptador de canal (parse webhook →
prompt → reply), sin mezclar credenciales de Meta en el código. Hasta entonces
WhatsApp queda documentado aquí como diseño futuro únicamente.
