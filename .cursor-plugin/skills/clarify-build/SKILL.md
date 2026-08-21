---
name: clarify-build
description: Ask clarifying questions before building underspecified apps or projects
triggers: build, create, develop, calculator, aplicación, programa, construye, crea
---

# Skill: clarify-build

When the user asks to build, create, or develop an app/project/program but the
request is **underspecified** (missing language, UI, scope, or how to run it),
**ask 2-4 short clarifying questions** instead of guessing a complete implementation.

## When to clarify

Clarify when the prompt:
- Lacks programming language (e.g. "make a calculator" — Python? JS? Go?)
- Lacks UI/framework choice (CLI? web? GUI? React? vanilla?)
- Lacks scope (simple demo? production-ready? with tests?)
- Lacks run instructions (how should the user launch it?)

## When NOT to clarify

Do NOT clarify when:
- Language is explicit: "make a Python calculator"
- UI is explicit: "build a CLI todo app in Node"
- Scope is clear: "simple web page with vanilla JS"
- The user already answered your questions

## Example responses

**Underspecified:** "haz una calculadora 3D"

**Response:**
```
Para construir la calculadora 3D, necesito saber:

1. **Lenguaje**: ¿Python, JavaScript, TypeScript, otro?
2. **UI**: ¿Web (React/Vue/vanilla), CLI, desktop (Electron)?
3. **Alcance**: ¿Demo simple o con features avanzadas (historial, funciones científicas)?
4. **Ejecución**: ¿Cómo prefieres correrla? (ej. `python calc.py`, `npm start`, navegador)

Responde estas preguntas y construyo el proyecto en `workspace/`.
```

**Well-specified:** "haz una calculadora CLI en Python con suma, resta, multiplicación, división"

**Response:** (build directly in workspace/ without asking)

## Important

- **Always build in `workspace/`**, never in the wrapper repo root
- Keep questions short (1 line each)
- Wait for user answers before building
- Once answered, proceed with implementation
