/**
 * markdownUtils.js
 * Shared markdown → HTML renderer used across chat bubbles and the Morning Coach.
 */

export function escapeHTML(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export function inlineFormat(text) {
  text = text.replace(/`([^`]+)`/g, '<code class="os-inline-code">$1</code>');
  text = text.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  text = text.replace(/__([^_]+)__/g, '<strong>$1</strong>');
  text = text.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  text = text.replace(/_([^_]+)_/g, '<em>$1</em>');
  text = text.replace(/(₹[\d,]+(?:\.\d+)?(?:\s?(?:Lakh|Crore|L|Cr|K))?)/g, '<span class="os-highlight-price">$1</span>');
  text = text.replace(/(\+[\d.]+%|[-][\d.]+%)/g, (m) => {
    const cls = m.startsWith('+') ? 'os-pct-up' : 'os-pct-down';
    return `<span class="${cls}">${m}</span>`;
  });
  return text;
}

function parseTable(lines) {
  const rows = lines.filter(l => l.trim().startsWith('|'));
  if (rows.length < 2) return null;
  const headerCells = rows[0].trim().slice(1, -1).split('|').map(c => c.trim());
  const bodyRows = rows.slice(2);
  let html = '<div class="os-table-wrap"><table class="os-table"><thead><tr>';
  for (const cell of headerCells) html += `<th>${inlineFormat(cell)}</th>`;
  html += '</tr></thead><tbody>';
  for (const row of bodyRows) {
    const cells = row.trim().slice(1, -1).split('|').map(c => c.trim());
    html += '<tr>';
    for (const cell of cells) html += `<td>${inlineFormat(cell)}</td>`;
    html += '</tr>';
  }
  html += '</tbody></table></div>';
  return html;
}

export function formatHTML(text) {
  if (!text) return '';
  const lines = text.split('\n');
  let html = '';
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (trimmed.startsWith('```')) {
      const lang = trimmed.slice(3).trim();
      i++;
      let code = '';
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        code += escapeHTML(lines[i]) + '\n';
        i++;
      }
      html += `<div class="os-code-block"><div class="os-code-lang">${lang || 'code'}</div><pre><code>${code.trimEnd()}</code></pre></div>`;
      i++;
      continue;
    }

    if (/^[-*_]{3,}$/.test(trimmed)) {
      html += '<hr class="os-hr" />';
      i++;
      continue;
    }

    if (/^###\s/.test(trimmed)) {
      html += `<h4 class="os-bubble-h4">${inlineFormat(trimmed.replace(/^###\s/, ''))}</h4>`;
      i++; continue;
    }
    if (/^##\s/.test(trimmed)) {
      html += `<h3 class="os-bubble-h3">${inlineFormat(trimmed.replace(/^##\s/, ''))}</h3>`;
      i++; continue;
    }
    if (/^#\s/.test(trimmed)) {
      html += `<h2 class="os-bubble-h2">${inlineFormat(trimmed.replace(/^#\s/, ''))}</h2>`;
      i++; continue;
    }

    if (trimmed.startsWith('|') && i + 1 < lines.length && /^\|[-| :]+\|$/.test(lines[i + 1]?.trim())) {
      const tableLines = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        tableLines.push(lines[i]);
        i++;
      }
      const tableHTML = parseTable(tableLines);
      if (tableHTML) { html += tableHTML; continue; }
    }

    if (trimmed.startsWith('> ')) {
      let quote = '';
      while (i < lines.length && lines[i].trim().startsWith('> ')) {
        quote += inlineFormat(lines[i].trim().slice(2)) + ' ';
        i++;
      }
      html += `<blockquote class="os-blockquote">${quote.trim()}</blockquote>`;
      continue;
    }

    if (/^[-•*]\s/.test(trimmed)) {
      html += '<ul class="os-bubble-ul">';
      while (i < lines.length && /^[-•*]\s/.test(lines[i].trim())) {
        html += `<li>${inlineFormat(lines[i].trim().replace(/^[-•*]\s*/, ''))}</li>`;
        i++;
      }
      html += '</ul>';
      continue;
    }

    if (/^\d+\.\s/.test(trimmed)) {
      html += '<ol class="os-bubble-ol">';
      while (i < lines.length && /^\d+\.\s/.test(lines[i].trim())) {
        html += `<li>${inlineFormat(lines[i].trim().replace(/^\d+\.\s*/, ''))}</li>`;
        i++;
      }
      html += '</ol>';
      continue;
    }

    if (!trimmed) { i++; continue; }

    html += `<p class="os-bubble-p">${inlineFormat(trimmed)}</p>`;
    i++;
  }

  return html;
}
