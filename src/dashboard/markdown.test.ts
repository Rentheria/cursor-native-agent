import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { renderMarkdown } from './markdown.js';

describe('renderMarkdown', () => {
  it('debería_escapar_HTML_peligroso', () => {
    const input = '<script>alert("xss")</script>';
    const output = renderMarkdown(input);
    assert.doesNotMatch(output, /<script>/);
    assert.match(output, /&lt;script&gt;/);
  });

  it('debería_renderizar_headings', () => {
    const input = '## Heading 2\n### Heading 3\n#### Heading 4';
    const output = renderMarkdown(input);
    assert.match(output, /<h2>Heading 2<\/h2>/);
    assert.match(output, /<h3>Heading 3<\/h3>/);
    assert.match(output, /<h4>Heading 4<\/h4>/);
  });

  it('debería_renderizar_bold_e_italic', () => {
    const input = '**bold text** and *italic text*';
    const output = renderMarkdown(input);
    assert.match(output, /<strong>bold text<\/strong>/);
    assert.match(output, /<em>italic text<\/em>/);
  });

  it('debería_renderizar_inline_code', () => {
    const input = 'Run `npm install` to start';
    const output = renderMarkdown(input);
    assert.match(output, /<code>npm install<\/code>/);
  });

  it('debería_renderizar_code_blocks', () => {
    const input = '```python\nprint("hello")\n```';
    const output = renderMarkdown(input);
    assert.match(output, /<pre><code class="language-python">print\(&quot;hello&quot;\)<\/code><\/pre>/);
  });

  it('debería_renderizar_listas_sin_orden', () => {
    const input = '- item 1\n- item 2\n- item 3';
    const output = renderMarkdown(input);
    assert.match(output, /<li>item 1<\/li>/);
    assert.match(output, /<li>item 2<\/li>/);
    assert.match(output, /<li>item 3<\/li>/);
  });

  it('debería_renderizar_listas_ordenadas', () => {
    const input = '1. first\n2. second\n3. third';
    const output = renderMarkdown(input);
    assert.match(output, /<li>first<\/li>/);
    assert.match(output, /<li>second<\/li>/);
    assert.match(output, /<li>third<\/li>/);
  });

  it('debería_renderizar_tablas', () => {
    const input = '| Col 1 | Col 2 |\n|---|---|\n| A | B |\n| C | D |';
    const output = renderMarkdown(input);
    assert.match(output, /<table>/);
    assert.match(output, /<th>Col 1<\/th>/);
    assert.match(output, /<th>Col 2<\/th>/);
    assert.match(output, /<td>A<\/td>/);
    assert.match(output, /<td>B<\/td>/);
    assert.match(output, /<td>C<\/td>/);
    assert.match(output, /<td>D<\/td>/);
  });

  it('debería_renderizar_links', () => {
    const input = '[Cursor](https://cursor.com)';
    const output = renderMarkdown(input);
    assert.match(output, /<a href="https:\/\/cursor\.com" target="_blank" rel="noopener noreferrer">Cursor<\/a>/);
  });

  it('debería_manejar_markdown_complejo_mixto', () => {
    const input = [
      '## Calculadora PS5',
      '',
      'Precios actuales:',
      '',
      '| Modelo | Precio |',
      '|---|---|',
      '| PS5 Digital | $399 |',
      '| PS5 Standard | $499 |',
      '',
      'Para comprar, ejecuta:',
      '',
      '```bash',
      'npm install ps5',
      '```',
      '',
      '**Importante**: verifica disponibilidad en *tu región*.',
    ].join('\n');

    const output = renderMarkdown(input);
    assert.match(output, /<h2>Calculadora PS5<\/h2>/);
    assert.match(output, /<table>/);
    assert.match(output, /<th>Modelo<\/th>/);
    assert.match(output, /<th>Precio<\/th>/);
    assert.match(output, /<td>PS5 Digital<\/td>/);
    assert.match(output, /<td>\$399<\/td>/);
    assert.match(output, /<pre><code class="language-bash">npm install ps5<\/code><\/pre>/);
    assert.match(output, /<strong>Importante<\/strong>/);
    assert.match(output, /<em>tu región<\/em>/);
  });

  it('no_debería_ejecutar_scripts_en_links', () => {
    const input = '[click me](javascript:alert("xss"))';
    const output = renderMarkdown(input);
    // The URL is escaped, so quotes become &quot;
    assert.match(output, /javascript:alert\(&quot;xss&quot;\)/);
    assert.doesNotMatch(output, /<script>/);
  });

  it('no_debería_filtrar_placeholders_LINK_en_código_inline', () => {
    // Regression test: inline code should be extracted before links
    // so placeholders never leak into output
    const input = 'Check `[link](url)` syntax in code';
    const output = renderMarkdown(input);
    assert.doesNotMatch(output, /LINK\d+/);
    assert.doesNotMatch(output, /\0/);
    assert.match(output, /<code>\[link\]\(url\)<\/code>/);
  });

  it('debería_envolver_listas_sin_orden_en_ul', () => {
    const input = '- item 1\n- item 2\n- item 3';
    const output = renderMarkdown(input);
    assert.match(output, /<ul>/);
    assert.match(output, /<\/ul>/);
    assert.match(output, /<li>item 1<\/li>/);
    assert.match(output, /<li>item 2<\/li>/);
    assert.match(output, /<li>item 3<\/li>/);
  });

  it('debería_envolver_listas_ordenadas_en_ol', () => {
    const input = '1. first\n2. second\n3. third';
    const output = renderMarkdown(input);
    assert.match(output, /<ol>/);
    assert.match(output, /<\/ol>/);
    assert.match(output, /<li>first<\/li>/);
    assert.match(output, /<li>second<\/li>/);
    assert.match(output, /<li>third<\/li>/);
  });

  it('no_debería_filtrar_placeholders_en_ningún_contexto', () => {
    const input = 'Text with `code [link](url)` and **bold [link](url)** and [real link](url)';
    const output = renderMarkdown(input);
    // No placeholders should leak
    assert.doesNotMatch(output, /LINK\d+/);
    assert.doesNotMatch(output, /CODE\d+/);
    assert.doesNotMatch(output, /BOLD\d+/);
    assert.doesNotMatch(output, /\0/);
    // Code should contain literal link markdown
    assert.match(output, /<code>code \[link\]\(url\)<\/code>/);
  });

  it('debería_colapsar_múltiples_líneas_en_blanco', () => {
    const input = 'Line 1\n\n\n\nLine 2\n\n\n\n\nLine 3';
    const output = renderMarkdown(input);
    // Should not have 3+ consecutive <br> or <p></p>
    assert.doesNotMatch(output, /<br>\s*<br>\s*<br>/);
    // Should have content for all three lines
    assert.match(output, /Line 1/);
    assert.match(output, /Line 2/);
    assert.match(output, /Line 3/);
  });

  it('debería_eliminar_líneas_en_blanco_al_inicio_y_final', () => {
    const input = '\n\n\nHola.\n\n\n';
    const output = renderMarkdown(input);
    // Should start with content, not empty tags
    assert.match(output, /^<p>Hola\.<\/p>$/);
  });

  it('debería_eliminar_párrafos_vacíos', () => {
    const input = 'Text\n\nMore text';
    const output = renderMarkdown(input);
    // Should not have empty <p></p> tags
    assert.doesNotMatch(output, /<p>\s*<\/p>/);
    assert.doesNotMatch(output, /<p>\s*<br>\s*<\/p>/);
  });

  it('debería_renderizar_código_corto_de_una_línea_como_inline', () => {
    const input = '```\nsrc/utils/helpers.ts\n```';
    const output = renderMarkdown(input);
    // Single short line should be inline code, not a pre block
    assert.match(output, /<p><code>src\/utils\/helpers\.ts<\/code><\/p>/);
    assert.doesNotMatch(output, /<pre>/);
  });

  it('debería_renderizar_código_largo_como_bloque', () => {
    const input = '```typescript\nfunction foo() {\n  return 42;\n}\n```';
    const output = renderMarkdown(input);
    // Multi-line code should be a pre block
    assert.match(output, /<pre><code class="language-typescript">/);
    assert.match(output, /function foo/);
  });
});
