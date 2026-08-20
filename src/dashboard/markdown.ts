import { escapeHtml } from './html.js';

/**
 * Renders a subset of markdown to safe HTML. Supports:
 * - Headings (##, ###, ####)
 * - Bold (**text**)
 * - Italic (*text*)
 * - Lists (- item, 1. item)
 * - Code blocks (```lang\ncode\n```)
 * - Inline code (`code`)
 * - Tables (| col | col |)
 * - Links ([text](url))
 *
 * All text is escaped to prevent XSS. No raw HTML is allowed.
 */
export function renderMarkdown(text: string): string {
  const lines = text.split('\n');
  const result: string[] = [];
  let inCodeBlock = false;
  let codeBlockLines: string[] = [];
  let codeBlockLang = '';
  let inTable = false;
  let tableRows: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';

    // Code block start/end
    if (line.trim().startsWith('```')) {
      if (!inCodeBlock) {
        inCodeBlock = true;
        codeBlockLang = line.trim().slice(3).trim();
        codeBlockLines = [];
        continue;
      } else {
        inCodeBlock = false;
        const code = codeBlockLines.join('\n');
        result.push(`<pre><code class="language-${escapeHtml(codeBlockLang)}">${escapeHtml(code)}</code></pre>`);
        codeBlockLines = [];
        codeBlockLang = '';
        continue;
      }
    }

    if (inCodeBlock) {
      codeBlockLines.push(line);
      continue;
    }

    // Table detection (| col | col |)
    if (line.trim().startsWith('|') && line.trim().endsWith('|')) {
      if (!inTable) {
        inTable = true;
        tableRows = [];
      }
      tableRows.push(line);
      continue;
    } else if (inTable) {
      // Table ended
      result.push(renderTable(tableRows));
      tableRows = [];
      inTable = false;
    }

    // Headings
    if (line.startsWith('#### ')) {
      result.push(`<h4>${renderInline(line.slice(5))}</h4>`);
      continue;
    }
    if (line.startsWith('### ')) {
      result.push(`<h3>${renderInline(line.slice(4))}</h3>`);
      continue;
    }
    if (line.startsWith('## ')) {
      result.push(`<h2>${renderInline(line.slice(3))}</h2>`);
      continue;
    }

    // Unordered list
    if (line.trim().startsWith('- ') || line.trim().startsWith('* ')) {
      const content = line.trim().slice(2);
      result.push(`<li>${renderInline(content)}</li>`);
      continue;
    }

    // Ordered list (1. item)
    const orderedMatch = /^\d+\.\s+(.*)$/.exec(line.trim());
    if (orderedMatch !== null) {
      result.push(`<li>${renderInline(orderedMatch[1] ?? '')}</li>`);
      continue;
    }

    // Empty line
    if (line.trim() === '') {
      result.push('<br>');
      continue;
    }

    // Regular paragraph
    result.push(`<p>${renderInline(line)}</p>`);
  }

  // Close table if still open
  if (inTable) {
    result.push(renderTable(tableRows));
  }

  return result.join('\n');
}

function renderInline(text: string): string {
  let result = text;
  const tokens: Array<{ type: string; content: string; original: string }> = [];

  // Extract and replace special tokens (links, bold, italic, code) with placeholders
  // Links [text](url)
  // Match link text (no ']'), then '(', then URL (greedy, but stop before the final ')')
  result = result.replace(/\[([^\]]+)\]\((.+)\)/g, (match, linkText: string, url: string) => {
    const idx = tokens.length;
    tokens.push({
      type: 'link',
      content: `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(linkText)}</a>`,
      original: match,
    });
    return `\0LINK${idx}\0`;
  });

  // Inline code `code`
  result = result.replace(/`(.+?)`/g, (match, code: string) => {
    const idx = tokens.length;
    tokens.push({
      type: 'code',
      content: `<code>${escapeHtml(code)}</code>`,
      original: match,
    });
    return `\0CODE${idx}\0`;
  });

  // Bold **text**
  result = result.replace(/\*\*(.+?)\*\*/g, (match, bold: string) => {
    const idx = tokens.length;
    tokens.push({
      type: 'bold',
      content: `<strong>${escapeHtml(bold)}</strong>`,
      original: match,
    });
    return `\0BOLD${idx}\0`;
  });

  // Italic *text*
  result = result.replace(/\*(.+?)\*/g, (match, italic: string) => {
    const idx = tokens.length;
    tokens.push({
      type: 'italic',
      content: `<em>${escapeHtml(italic)}</em>`,
      original: match,
    });
    return `\0ITALIC${idx}\0`;
  });

  // Escape remaining text
  result = escapeHtml(result);

  // Restore tokens
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (token !== undefined) {
      result = result.replace(`\0${token.type.toUpperCase()}${i}\0`, token.content);
    }
  }

  return result;
}

function renderTable(rows: string[]): string {
  if (rows.length === 0) {
    return '';
  }

  const result: string[] = ['<table>'];
  let isHeader = true;

  for (const row of rows) {
    // Skip separator row (|---|---|)
    if (/^\|[\s\-:]+\|$/.test(row.trim())) {
      isHeader = false;
      continue;
    }

    const cells = row
      .split('|')
      .slice(1, -1)
      .map((cell) => cell.trim());

    if (isHeader) {
      result.push('<thead><tr>');
      for (const cell of cells) {
        result.push(`<th>${renderInline(cell)}</th>`);
      }
      result.push('</tr></thead>');
      isHeader = false;
    } else {
      result.push('<tr>');
      for (const cell of cells) {
        result.push(`<td>${renderInline(cell)}</td>`);
      }
      result.push('</tr>');
    }
  }

  result.push('</table>');
  return result.join('\n');
}
