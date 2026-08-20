# Cursor Plugin — cursor-native-agent

Empaqueta las **rules** y **skills** de este repo como un [Cursor Plugin](https://cursor.com/docs/plugins)
local (manifest `.cursor-plugin/plugin.json`). No incluye MCP: el wrapper CLI,
cron, Telegram y dashboard siguen siendo procesos Node aparte.

## Qué incluye

| Componente | Origen |
| --- | --- |
| Rules | `.cursor/rules` (reuso, sin duplicar) |
| Skills | `.cursor-plugin/skills/<name>/SKILL.md` |

## Fuente de verdad de las skills

El wrapper TypeScript (`loadAllSkills`) lee **`skills/*.md`** (archivos planos,
`readdir` no-recursivo). Eso no cambia.

Las copias bajo `.cursor-plugin/skills/<name>/SKILL.md` son el layout que exige
Cursor Plugin. **No son un fork**: regenerarlas con:

```bash
./scripts/sync-plugin-skills.sh
```

Edita siempre `skills/*.md` y vuelve a correr el sync antes de commitear.

El frontmatter oficial de Cursor solo documenta `name` + `description`. El campo
`triggers` es del wrapper interno; se conserva en las copias (Cursor lo ignora).

## Instalación local

Requisito: **Node ≥ 20** (para el wrapper CLI del repo; el plugin en sí son
markdown + JSON).

```bash
cd /path/to/cursor-native-agent
mkdir -p ~/.cursor/plugins/local
ln -sfn "$(pwd)" ~/.cursor/plugins/local/cursor-native-agent
```

Luego **Developer: Reload Window** (o reinicia Cursor) y revisa en
**Customize** que aparezcan rules/skills del plugin `cursor-native-agent`.

## Verificación

Tras el symlink, debe existir:

```bash
ls -la ~/.cursor/plugins/local/cursor-native-agent/.cursor-plugin/plugin.json
```

El reconocimiento completo en la UI de Cursor no se puede afirmar solo porque
existan los archivos; hace falta Reload Window y mirar Customize.
