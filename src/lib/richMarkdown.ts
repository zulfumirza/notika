import { marked } from 'marked';
import TurndownService from 'turndown';

marked.setOptions({
  gfm: true,
  breaks: true,
});

const turndownService = new TurndownService({
  headingStyle: 'atx',
  bulletListMarker: '-',
  codeBlockStyle: 'fenced',
  emDelimiter: '*',
});

// Support GFM strikethrough (<del>, <s>)
turndownService.addRule('strikethrough', {
  filter: ['del', 's'],
  replacement: (content) => `~~${content}~~`,
});

function findDirectTaskCheckbox(node: Node): HTMLInputElement | null {
  if (!(node instanceof HTMLElement)) return null;
  const direct = node.querySelector(
    ':scope > input[type="checkbox"], :scope > p:first-child > input[type="checkbox"]'
  );
  return direct instanceof HTMLInputElement ? direct : null;
}

// Support GFM task list items
turndownService.addRule('taskListItem', {
  filter: (node) => {
    if (node.nodeName !== 'LI') return false;
    return findDirectTaskCheckbox(node) !== null;
  },
  replacement: (content, node) => {
    const checkbox = findDirectTaskCheckbox(node);
    const isChecked =
      checkbox !== null
        ? checkbox.checked || checkbox.hasAttribute('checked')
        : false;
    const cleaned = content
      .replace(/^\s+/, '')
      .replace(/\n+/g, '\n  ')
      .trim();
    return `- [${isChecked ? 'x' : ' '}] ${cleaned}\n`;
  },
});

// Preserve GFM tables cleanly when round-tripping HTML -> Markdown
turndownService.addRule('gfmTable', {
  filter: 'table',
  replacement: (_content, node) => {
    const table = node as HTMLTableElement;
    const rows = Array.from(table.querySelectorAll('tr'));
    if (rows.length === 0) return '';

    const matrix = rows.map((row) =>
      Array.from(row.querySelectorAll('th, td')).map((cell) =>
        (cell.textContent ?? '').replace(/\|/g, '\\|').trim()
      )
    );

    const header = matrix[0];
    if (!header || header.length === 0) return '';

    const colCount = header.length;
    const headerLine = `| ${header.join(' | ')} |`;
    const separatorLine = `| ${Array.from({ length: colCount }, () => '---').join(' | ')} |`;
    const bodyLines = matrix.slice(1).map((row) => {
      const padded = Array.from(
        { length: colCount },
        (_, i) => row[i] ?? ''
      );
      return `| ${padded.join(' | ')} |`;
    });

    return `\n\n${[headerLine, separatorLine, ...bodyLines].join('\n')}\n\n`;
  },
});

export function markdownToEditorHtml(markdown: string): string {
  const rendered = marked.parse(markdown, { async: false });
  if (typeof rendered !== 'string') {
    return '';
  }

  const trimmed = rendered.trim();
  if (typeof document === 'undefined') {
    return trimmed;
  }

  const container = document.createElement('div');
  container.innerHTML = trimmed;

  const checkboxes = container.querySelectorAll<HTMLInputElement>(
    'input[type="checkbox"]'
  );
  checkboxes.forEach((checkbox) => {
    checkbox.removeAttribute('disabled');
    checkbox.disabled = false;
    checkbox.setAttribute('contenteditable', 'false');
    checkbox.classList.add('cursor-pointer');

    const li = checkbox.closest('li');
    if (li) {
      li.classList.add('task-list-item');
      const ul = li.parentElement;
      if (ul && ul.tagName === 'UL') {
        ul.classList.add('contains-task-list');
      }
    }
  });

  return container.innerHTML;
}

export function editorHtmlToMarkdown(html: string): string {
  return turndownService.turndown(html).replace(/\n{3,}/g, '\n\n').trimEnd();
}

const TASK_LINE_REGEX = /^(\s*(?:[-*+]|\d+\.)\s+\[)([ xX])(\](?:\s.*|$))/;

export function toggleTaskAtLineInMarkdown(
  markdown: string,
  oneBasedLine: number
): string {
  const eol = markdown.includes('\r\n') ? '\r\n' : '\n';
  const lines = markdown.split(/\r?\n/);
  const idx = oneBasedLine - 1;
  if (idx < 0 || idx >= lines.length) {
    return markdown;
  }

  const currentLine = lines[idx];
  if (currentLine === undefined) {
    return markdown;
  }

  const match = TASK_LINE_REGEX.exec(currentLine);
  if (!match) {
    return markdown;
  }

  const [, prefix, stateChar, suffix] = match;
  const nextChar = stateChar === ' ' ? 'x' : ' ';
  lines[idx] = `${prefix}${nextChar}${suffix}`;
  return lines.join(eol);
}
