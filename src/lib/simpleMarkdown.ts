// Rich markdown to HTML converter (no external deps)
export function markdownToHtml(text: string): string {
  // First, extract and protect code blocks
  const codeBlocks: string[] = [];
  let processed = text.replace(/```(\w*)\n?([\s\S]*?)```/g, (_, lang, code) => {
    const idx = codeBlocks.length;
    const trimmed = code.trim();
    const language = lang || "text";
    // Encode raw code in a data attribute so the UI can copy it without HTML entities
    const encoded = encodeURIComponent(trimmed);
    codeBlocks.push(
      `<div class="wilson-code-wrapper" data-code="${encoded}">` +
        `<div class="wilson-code-header">` +
          `<span class="wilson-code-lang">${language}</span>` +
          `<button type="button" class="wilson-code-copy" data-copy-btn aria-label="Copy code">` +
            `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>` +
            `<span>Copy</span>` +
          `</button>` +
        `</div>` +
        `<pre class="wilson-code-block"><code class="language-${language}">${escapeHtml(trimmed)}</code></pre>` +
      `</div>`
    );
    return `\x00CB${idx}\x00`;
  });

  // Inline code (protect from further processing)
  const inlineCodes: string[] = [];
  processed = processed.replace(/`([^`]+)`/g, (_, code) => {
    const idx = inlineCodes.length;
    inlineCodes.push(`<code class="wilson-inline-code">${escapeHtml(code)}</code>`);
    return `\x00IC${idx}\x00`;
  });

  // Tables
  processed = processed.replace(
    /^(\|.+\|)\n(\|[\s:|-]+\|)\n((?:\|.+\|\n?)+)/gm,
    (_, header, _separator, body) => {
      const headers = header.split("|").filter((c: string) => c.trim());
      const rows = body.trim().split("\n").map((r: string) => r.split("|").filter((c: string) => c.trim()));
      let table = '<table class="wilson-table"><thead><tr>';
      headers.forEach((h: string) => { table += `<th>${h.trim()}</th>`; });
      table += "</tr></thead><tbody>";
      rows.forEach((row: string[]) => {
        table += "<tr>";
        row.forEach((cell: string) => { table += `<td>${cell.trim()}</td>`; });
        table += "</tr>";
      });
      table += "</tbody></table>";
      return table;
    }
  );

  // Horizontal rules
  processed = processed.replace(/^---+$/gm, '<hr class="wilson-hr"/>');

  // Headers
  processed = processed.replace(/^#### (.+)$/gm, '<h4 class="wilson-h4">$1</h4>');
  processed = processed.replace(/^### (.+)$/gm, '<h3 class="wilson-h3">$1</h3>');
  processed = processed.replace(/^## (.+)$/gm, '<h2 class="wilson-h2">$1</h2>');
  processed = processed.replace(/^# (.+)$/gm, '<h1 class="wilson-h1">$1</h1>');

  // Bold + Italic
  processed = processed.replace(/\*\*\*(.+?)\*\*\*/g, "<strong><em>$1</em></strong>");
  // Bold
  processed = processed.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  // Italic
  processed = processed.replace(/\*(.+?)\*/g, "<em>$1</em>");

  // Unordered lists
  processed = processed.replace(/^(?:[-*+] .+\n?)+/gm, (match) => {
    const items = match.trim().split("\n").map((l) => `<li>${l.replace(/^[-*+] /, "")}</li>`);
    return `<ul class="wilson-list">${items.join("")}</ul>`;
  });

  // Ordered lists
  processed = processed.replace(/^(?:\d+\. .+\n?)+/gm, (match) => {
    const items = match.trim().split("\n").map((l) => `<li>${l.replace(/^\d+\. /, "")}</li>`);
    return `<ol class="wilson-list wilson-ol">${items.join("")}</ol>`;
  });

  // Blockquotes
  processed = processed.replace(/^> (.+)$/gm, '<blockquote class="wilson-blockquote">$1</blockquote>');

  // Links
  processed = processed.replace(
    /\[([^\]]+)\]\(([^)]+)\)/g,
    '<a href="$2" target="_blank" rel="noopener" class="wilson-link">$1</a>'
  );

  // Paragraphs: double newlines
  processed = processed.replace(/\n{2,}/g, "</p><p>");
  // Single newlines to <br>
  processed = processed.replace(/\n/g, "<br/>");

  // Restore code blocks and inline codes
  processed = processed.replace(/\x00CB(\d+)\x00/g, (_, idx) => codeBlocks[parseInt(idx)]);
  processed = processed.replace(/\x00IC(\d+)\x00/g, (_, idx) => inlineCodes[parseInt(idx)]);

  // Wrap in paragraph if not already wrapped
  if (!processed.startsWith("<")) {
    processed = `<p>${processed}</p>`;
  }

  return processed;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
