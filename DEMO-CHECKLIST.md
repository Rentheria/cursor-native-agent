# Checklist demo — Cursor Meetup GDL (27-ago-2026)

Producto: [cursor-native-agent](https://github.com/Rentheria/cursor-native-agent)  
Último ensayo en box: PASS (REHEARSAL-2026-08-22.md, HEAD con #21–#23)  
Framing: **agente personal download-and-run** (no SaaS). Meetup = lanzamiento, no el fin.

---

## 1. La noche anterior (o la mañana del 27)

- [ ] `git clone` fresco de `main` (o `git pull` en un clone limpio). Confirmar tip reciente (#23+).
- [ ] `npm run setup` (no solo `npm install`).
- [ ] Abrir `.env` y copiar `DASHBOARD_TOKEN` (el setup **no** lo imprime al terminal).
- [ ] `TELEGRAM_BOT_TOKEN` + `TELEGRAM_ALLOWED_CHAT_IDS` (tu chat) en `.env`.
- [ ] `WORKSPACE_PATH` vacío o apuntando a `<repo>/workspace`.
- [ ] `npm run typecheck` y `npm test` en verde.
- [ ] Ensayo completo en **la laptop del talk** (no solo en el box):
  1. Dashboard pitch → build → Confirmar  
  2. Telegram `/start` → pitch → build → Confirmar  
- [ ] Cargar deck / PDF; probar proyector o mirror una vez.
- [ ] Cerrar cualquier otro `npm run telegram` / poller en otras máquinas (solo **un** `getUpdates`).
- [ ] Cargar batería / cargador; Wi‑Fi del venue o hotspot de respaldo.
- [ ] Cursor CLI autenticado en esa máquina (`cursor-agent` responde).

---

## 2. 30–45 min antes (backstage)

- [ ] Repo limpio: `git status` sin basura de ensayos previos (o workspace limpio).
- [ ] Terminal 1: `npm run dashboard` → abre `http://127.0.0.1:<PORT>`.
- [ ] Unlock del dashboard con el token (sessionStorage).
- [ ] Terminal 2 (solo si demuestras Telegram): `npm run telegram` — **una sola** instancia.
- [ ] Smoke rápido:
  - Dashboard: `qué hace este repo` → pitch canned (~instantáneo, sin modelo).
  - (Opcional) Telegram: `/start` → mismo pitch.
- [ ] Dejar Confirmar **sin** disparar aún el build grande (ahorra tiempo/API).
- [ ] Silenciar notificaciones; ocultar otras ventanas con secrets.

---

## 3. Guion sugerido en escena (~15 min + demo)

### Framing (30–60 s)
- Esto es un **agente personal** que cualquiera clona y corre en su máquina/cuenta Cursor.
- No es un producto multi-tenant en la nube.
- Piezas: skills + memoria markdown + cron + dashboard/Telegram sobre `cursor-agent`.

### Demo A — Pitch canned (seguro, sin modelo)
- En dashboard o CLI: **`qué hace este repo`**
- Debe responder el stage-pitch en español al instante.
- Señal a la audiencia: esto no llama al modelo; es una skill determinística.

### Demo B — Build con confianza (el momento Confirmar)
- Prompt de build corto, p. ej. `haz un archivo hello-meetup.txt que diga hola` (o calculadora mínima).
- Aparecen botones Confirmar / Cancelar (ES).
- Narrar: en dashboard/Telegram no corre --force hasta que confirmas.
- Pulsar Confirmar → mostrar el archivo en workspace/.
- (Opcional) Mencionar Cancelar / /no.

### Demo C — Telegram (si hay tiempo / señal)
- /start → hilo telegram-chat-<id>.
- Mismo pitch o build corto.
- Confirmar en el teléfono; hilo estable (fix #22).

### Cierre
- Repo público: clona → npm run setup → tu agente en tu cuenta.
- Punto de seguridad: localhost + token + allowlist + Confirmar.

---

## 4. Frases exactas (copiar/pegar)

| Uso | Texto |
|-----|--------|
| Pitch ES | qué hace este repo |
| Pitch EN (backup) | what does this repo do |
| Build corto | haz un archivo hello-meetup.txt con el texto hola meetup |
| Cancelar (CLI/texto) | /no o botón Cancelar |
| Confirmar (texto) | /ok o botón Confirmar |
| Telegram reset | /start |

---

## 5. Plan B (si algo falla)

| Fallo | Qué hacer |
|-------|-----------|
| Modelo lento / cuota | Quédate en pitch canned + mostrar código/skills; no improvisar builds largos |
| Dashboard no unlock | Pegar DASHBOARD_TOKEN desde .env; si falta, npm run setup otra vez |
| Telegram mudo / 409 conflict | Matar otros pollers; un solo npm run telegram |
| Confirmar no responde | Usar /ok en el chat; o demo solo dashboard |
| Wi-Fi cae | CLI local + pitch canned; Telegram queda fuera |
| Fonts CDN lentas | Ignorar; UI sigue usable |
| Build pide aclarar (clarify) | Prompt más concreto (archivo único, texto fijo) |

---

## 6. Qué NO hacer el día del talk

- No abrir el dashboard fuera de 127.0.0.1.
- No screen-share el .env con el token visible.
- No correr dos bots Telegram con el mismo token.
- No git push --force / reescribir main.
- No demos SaaS / auth cloud / desplegar a internet.
- No builds enormes que dejen la sala esperando.

---

## 7. Post-talk (opcional, mismo día)

- [ ] Apagar dashboard y telegram.
- [ ] Nota rápida: qué falló / qué preguntaron (para memoria del repo).
- [ ] Agradecer / link del repo en el chat del meetup.

---

## Evidencia previa

- Ensayo box: PASS — Dashboard + Telegram pitch/build/Confirmar.
- Audit: uso diario 4/5, meetup 4/5.
- PRs clave demo: #11 trust, #15 token, #16 Confirmar ES, #19 /start thread, #21 polish, #22 confirm threadId, #23 docs/cap.

Done: non-draft PR with DEMO-CHECKLIST.md + README one-liner.
