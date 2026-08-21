# Agente nativo de Cursor — diseño

> Vista de alto nivel, instalación y ejemplos de uso: ver [`README.md`](./README.md).
> Cómo contribuir: [`CONTRIBUTING.md`](./CONTRIBUTING.md). Este archivo cubre
> alcance, plan por semanas y decisiones de diseño — no duplica la guía de uso.

## Objetivo
Agente autónomo corriendo 100% sobre Cursor CLI/Agent (`cursor-agent` headless), que
replica un patrón ya probado en producción (skills cargables, memoria persistente
en markdown, loop autónomo vía cron, orquestación multi-agente con dispatch a
sub-agentes).

Corre primero en terminal local (validación rápida). Una vez funcionando de
verdad, el mismo repo se puede desplegar en un host remoto sin cambios de
arquitectura.

Motivación: demo pública para el Cursor Meetup GDL del **jueves 27-ago-2026**.
Hoy no existe un ejemplo público de "agente con skills+memoria+orquestación
construido 100% con Cursor" — este repo es ese ejemplo, y queda reusable como
plantilla.

## Alcance imprescindible para el 27-ago

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
   dispara `cursor-agent -p "<prompt>"` para triagearlo, sin intervención
   humana (mismo patrón de tick autónomo en hosts compartidos).
4. **Orquestación multi-agente** — el agente principal puede despachar una
   subtarea a otra instancia de `cursor-agent` (worker headless) y recoger el
   resultado antes de reportar (patrón de dispatch desacoplado: log + wait + notify).
5. **Canal para la charla** — CLI interactivo alcanza para el demo en vivo.
   Telegram (long polling) queda como canal opcional autorizado post-fase-1;
   no es bloqueante para el 27.

## Canal Telegram (autorizado, opcional)

`npm run telegram` recibe mensajes de un bot vía **long polling**
(`getUpdates` + timeout) — no hace falta un servidor público ni webhooks.
Usa `fetch` nativo de Node (≥20); sin dependencias nuevas.

Flujo:

```
Telegram (usuario) → getUpdates (long poll)
        │
        ▼
 extractInboundTextMessages
        │
        ▼
 runAgentTurn  (mismo pipeline que npm run agent:
                skills + memoria + cursor-agent -p)
        │
        ▼
 sendMessage (respuesta al chat; trocea si > 4096 chars)
```

- Token **obligatorio** en `TELEGRAM_BOT_TOKEN` (export en el shell / secret
  manager). Si falta, el comando falla con instrucciones claras. Nunca se
  hardcodea ni se inventa un token en el repo.
- Allowlist **obligatoria** en `TELEGRAM_ALLOWED_CHAT_IDS` (opcionalmente
  afinada con `TELEGRAM_ALLOWED_USER_IDS`). El mensaje entrante acaba en
  `cursor-agent --force`, así que un bot abierto es RCE: el canal falla
  cerrado (no arranca sin allowlist) y descarta en silencio lo que venga de
  chats no listados. La verificación vive en `dispatchInboundMessage`, pegada
  a la llamada al pipeline, para que ningún caller la rodee.
- Código: `src/channels/telegram.ts` (loop), `telegram-api.ts` (cliente),
  `telegram-parse.ts` (parsing), `telegram-allowlist.ts` (autorización).
  Pipeline compartido: `src/core/agent-turn.ts`.
- Tests mockean `fetch` — no pegan a `api.telegram.org`.

## Fuera de alcance para el 27 (documentado, no bloqueante)
- WhatsApp / otros canales de Meta Business (ver sección Futuro abajo)
- Backups automáticos
## Dashboard web (observabilidad local)

`npm run dashboard` levanta un servidor HTTP nativo (`node:http`, sin
frameworks) en `127.0.0.1` con puerto `PORT` (default `3847`). Sirve una página
HTML que muestra:

1. Últimas entradas de `logs/agent.ndjson` (turnos: prompt, skills matched,
   memoria, `cursorAgentMs`, `totalMs`).
2. Hallazgos `=== CRON FINDING … ===` de `logs/cron.log` (branch, tree, verdict, note).
3. Índice parseado de `MEMORY.md`.

Por defecto **incluye chat interactivo** (habilitado): JSON auxiliar en `/api/agent`,
`/api/cron`, `/api/memory`, `/api/health`. Código en `src/dashboard/` (parsers +
server + HTML). Tests: parseo de logs y rutas HTTP.

### Chat interactivo (habilitado por defecto)

Por defecto habilitado en localhost. Con `CURSOR_NATIVE_AGENT_DASHBOARD_CHAT=0`
(o `false`/`off`) se desactiva y el dashboard queda solo lectura (no registra
`POST /api/chat` ni muestra la UI).
El handler reutiliza `runAgentTurn` (mismo pipeline que `npm run agent` /
Telegram) con streaming opt-in vía
`--output-format stream-json --stream-partial-output`.

**Nota de seguridad:** esta ruta ejecuta prompts en **modo seguro** (workspace
cwd, **sin** `--force` ni `--trust`). Además aplica verificación de origen (solo
`127.0.0.1`/`localhost` o solicitudes sin Referer), cap de 256 KiB en el body
(413 si excede), y rate limit (un turno concurrente + 10/min → 429). **No exponer
a internet sin autenticación.** CLI y Telegram sí usan `--force --trust`; cron
usa `--mode ask`.
## Implementado además del alcance mínimo
- **Memoria semántica (embeddings locales)** — default TF-IDF + hashed
  char n-grams en `src/lib/embeddings/` (sin servicio de pago). El loader
  (`src/loaders/memory-loader.ts`) une keyword match + top-K semántico.
  Provider real opcional vía env (`custom` + módulo); si falta, cae a local.

## Plan de ejecución (fechas reales, CST)
- **Semana 1 (03-ago → 10-ago):** repo base + skills loader + memoria markdown,
  corriendo y probado en terminal local. ✅
- **Semana 2 (10-ago → 17-ago):** loop autónomo (cron) + orquestación
  multi-agente (dispatch a worker headless).
  - Cron: `npm run cron` / `scripts/cron-tick.sh` + docs de instalación en
    `README.md` (crontab / systemd timer). Cada tick corre el chequeo de
    `src/orchestration/repo-health.ts` (git + links del índice de memoria +
    frontmatter de skills/memoria), lo diffea contra `logs/cron-health.json`
    del tick anterior, y le pide a `cursor-agent` un triage (`note:`/`action:`)
    sobre esa evidencia; el agente no se edita a sí mismo (`--mode ask`). El
    hallazgo legible (`=== CRON FINDING … ===`) queda al inicio de
    `logs/cron.log` para mostrarlo en ~30s en la charla (`tail -n 30`).
    `npm run cron -- --check-only` corre solo el chequeo, sin llamar al agente.
  - Multi-agente: detección acotada a frases canónicas en
    `src/core/delegation.ts` (`pídele a otro agente que…`, `delega esto a…`) →
    `dispatchWorker` (`src/orchestration/worker-dispatch.ts`) spawnea otro
    `cursor-agent` con log en `logs/workers/` y notificación al padre al
    terminar → el agente principal reporta. Skill: `skills/delegate-worker.md`.
- **Semana 3a:** verificación en vivo en terminal local. Cron de usuario
  instalado y disparado por el demonio `cron` (no a mano); delegación punta a
  punta con prompt real. Lecciones:
  - Cron necesita `scripts/cron-tick.sh` (carga nvm + `~/.local/bin`); el
    ejemplo con `/usr/bin/npm` falla en hosts que solo tienen Node vía nvm.
  - Trigger = solo lo visible a `git status --short` (gitignored no cuenta).
  - Delegación = dos `cursor-agent` **secuenciales** (worker, luego padre que
    reporta); el padre espera al hijo vía Promise.
- **Semana 3 (17-ago → 24-ago):** pulir demo, memoria semántica local
  (embeddings sin API key + punto de extensión), walkthrough de la charla,
  probar el mismo repo en un host remoto si aplica. Dashboard de solo lectura
  (`npm run dashboard`) para observar agent.ndjson / cron findings / MEMORY.md
  en local sin tocar el motor.
- **24-ago → 27-ago:** buffer + ensayo de la charla.

## Quién ejecuta qué
- El **agente de coding** (`cursor-agent` headless) construye — es el motor real
  que se va a mostrar en la charla, tiene sentido que sea quien lo escriba.
- El **agente orquestador** diseña, revisa cada entrega contra este doc, y reporta
  al operador solo en hitos reales (fin de cada semana o bloqueo real), no a diario.

## Verificación
Cada pieza se da por hecha solo si corre de verdad en terminal (no "compila" o
"el código se ve bien"). Al cerrar cada semana, se corrobora con comandos reales
(no folder(s) sin probar) antes de cerrar el hito.

## Referencia de patrones a replicar (diseño, no código propietario)
- Protocolo de skills + memoria + sync entre agentes (markdown cargable).
- Índice `MEMORY.md` + detalle `memory/*.md` — patrón índice+detalle lazy.
- Dispatch headless desacoplado (proceso separado, log file, wait hasta
  terminar, aviso al padre).
- Estado compartido opcional entre agentes (archivo de estado + log append-only).
- Convención de contribuciones: ver `CONTRIBUTING.md`.

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
