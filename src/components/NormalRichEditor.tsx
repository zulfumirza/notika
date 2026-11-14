import { useCallback, useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import {
  Bold,
  Check,
  CheckSquare,
  Code,
  Heading1,
  Heading2,
  Italic,
  Link2,
  List,
  ListOrdered,
  Pilcrow,
  Quote,
  Strikethrough,
  X,
} from 'lucide-react';
import type { TranslationStrings } from '../i18n/translations';
import {
  editorHtmlToMarkdown,
  markdownToEditorHtml,
} from '../lib/richMarkdown';

interface NormalRichEditorProps {
  noteKey: string;
  content: string;
  isPlainText: boolean;
  t: TranslationStrings;
  onChangeContent: (nextContent: string) => void;
}

export function NormalRichEditor({
  noteKey,
  content,
  isPlainText,
  t,
  onChangeContent,
}: NormalRichEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const lastEmittedRef = useRef<string>(content);
  const lastKeyRef = useRef<string>('');

  const [showLinkInput, setShowLinkInput] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');
  const savedRangeRef = useRef<Range | null>(null);

  // Sync DOM only when switching notes or when content changed externally
  useEffect(() => {
    if (isPlainText) return;
    const el = editorRef.current;
    if (!el) return;

    const noteChanged = lastKeyRef.current !== noteKey;
    const externalChange = content !== lastEmittedRef.current;

    if (noteChanged || externalChange) {
      el.innerHTML = markdownToEditorHtml(content);
      lastKeyRef.current = noteKey;
      lastEmittedRef.current = content;
    }
  }, [noteKey, content, isPlainText]);

  const syncDomToMarkdown = useCallback(() => {
    const el = editorRef.current;
    if (!el) return;

    const checkboxes = el.querySelectorAll<HTMLInputElement>(
      'input[type="checkbox"]'
    );
    checkboxes.forEach((checkbox) => {
      if (checkbox.disabled) {
        checkbox.removeAttribute('disabled');
        checkbox.disabled = false;
      }
      if (checkbox.getAttribute('contenteditable') !== 'false') {
        checkbox.setAttribute('contenteditable', 'false');
      }
      if (checkbox.checked) {
        checkbox.setAttribute('checked', 'checked');
      } else {
        checkbox.removeAttribute('checked');
      }
    });

    const md = editorHtmlToMarkdown(el.innerHTML);
    lastEmittedRef.current = md;
    onChangeContent(md);
  }, [onChangeContent]);

  const runFormatCommand = (command: string, value?: string) => {
    const el = editorRef.current;
    if (!el) return;
    el.focus();
    document.execCommand(command, false, value);
    syncDomToMarkdown();
  };

  const insertInlineCode = () => {
    const el = editorRef.current;
    if (!el) return;
    el.focus();
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;

    const range = selection.getRangeAt(0);
    const selectedText = range.toString() || 'kod';
    const codeEl = document.createElement('code');
    codeEl.textContent = selectedText;
    range.deleteContents();
    range.insertNode(codeEl);

    const after = document.createRange();
    after.setStartAfter(codeEl);
    after.collapse(true);
    selection.removeAllRanges();
    selection.addRange(after);

    syncDomToMarkdown();
  };

  const insertTaskItem = () => {
    const el = editorRef.current;
    if (!el) return;
    el.focus();

    const ul = document.createElement('ul');
    ul.className = 'contains-task-list';
    const li = document.createElement('li');
    li.className = 'task-list-item';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.setAttribute('contenteditable', 'false');
    checkbox.className = 'cursor-pointer';
    const span = document.createElement('span');
    span.textContent = 'Yeni görev';
    li.appendChild(checkbox);
    li.appendChild(document.createTextNode(' '));
    li.appendChild(span);
    ul.appendChild(li);

    const selection = window.getSelection();
    if (selection && selection.rangeCount > 0 && el.contains(selection.anchorNode)) {
      const range = selection.getRangeAt(0);
      range.collapse(false);
      range.insertNode(ul);
    } else {
      el.appendChild(ul);
    }

    syncDomToMarkdown();
  };

  const openLinkPopover = () => {
    const selection = window.getSelection();
    if (selection && selection.rangeCount > 0) {
      savedRangeRef.current = selection.getRangeAt(0).cloneRange();
    }
    setLinkUrl('https://');
    setShowLinkInput(true);
  };

  const applyLink = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = linkUrl.trim();
    if (!trimmed) {
      setShowLinkInput(false);
      return;
    }

    const el = editorRef.current;
    if (!el) return;
    el.focus();

    const selection = window.getSelection();
    if (selection && savedRangeRef.current) {
      selection.removeAllRanges();
      selection.addRange(savedRangeRef.current);
    }

    document.execCommand('createLink', false, trimmed);
    setShowLinkInput(false);
    setLinkUrl('');
    savedRangeRef.current = null;
    syncDomToMarkdown();
  };

  if (isPlainText) {
    return (
      <div className="flex h-full min-h-0 flex-col bg-black">
        <div className="flex items-center justify-between border-b border-white/[0.08] bg-[#111113] px-4 py-2 text-xs text-[#A1A1AA]">
          <span>.txt — {t.modeNormal}</span>
        </div>
        <textarea
          aria-label={t.modeNormal}
          value={content}
          onChange={(event) => onChangeContent(event.target.value)}
          spellCheck={true}
          placeholder="..."
          className="mx-auto h-full w-full max-w-4xl flex-1 resize-none bg-transparent px-4 py-5 text-[15.5px] leading-[1.75] text-[#E4E4E7] placeholder-[#52525B] outline-none sm:px-6 sm:py-6 lg:px-10 lg:py-8"
        />
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-black">
      {/* Rich Formatting Toolbar */}
      <div className="flex items-center gap-1 overflow-x-auto border-b border-white/[0.08] bg-[#111113] px-3 py-2">
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => runFormatCommand('formatBlock', 'P')}
          title="P"
          aria-label="P"
          className="shrink-0 rounded-md p-2 text-[#A1A1AA] transition-colors hover:bg-[#1F1F23] hover:text-white sm:p-1.5"
        >
          <Pilcrow className="h-4 w-4" />
        </button>
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => runFormatCommand('formatBlock', 'H1')}
          title="Başlık 1"
          aria-label="Başlık 1"
          className="rounded-md p-1.5 text-[#A1A1AA] transition-colors hover:bg-[#1F1F23] hover:text-white"
        >
          <Heading1 className="h-4 w-4" />
        </button>
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => runFormatCommand('formatBlock', 'H2')}
          title="Başlık 2"
          aria-label="Başlık 2"
          className="rounded-md p-1.5 text-[#A1A1AA] transition-colors hover:bg-[#1F1F23] hover:text-white"
        >
          <Heading2 className="h-4 w-4" />
        </button>

        <div className="mx-1 h-4 w-px bg-white/[0.1]" />

        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => runFormatCommand('bold')}
          title="Kalın (Ctrl+B)"
          aria-label="Kalın"
          className="rounded-md p-1.5 text-[#A1A1AA] transition-colors hover:bg-[#1F1F23] hover:text-white"
        >
          <Bold className="h-4 w-4" />
        </button>
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => runFormatCommand('italic')}
          title="İtalik (Ctrl+I)"
          aria-label="İtalik"
          className="rounded-md p-1.5 text-[#A1A1AA] transition-colors hover:bg-[#1F1F23] hover:text-white"
        >
          <Italic className="h-4 w-4" />
        </button>
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => runFormatCommand('strikeThrough')}
          title="Üstü Çizili"
          aria-label="Üstü Çizili"
          className="rounded-md p-1.5 text-[#A1A1AA] transition-colors hover:bg-[#1F1F23] hover:text-white"
        >
          <Strikethrough className="h-4 w-4" />
        </button>
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={insertInlineCode}
          title="Satır İçi Kod"
          aria-label="Satır İçi Kod"
          className="rounded-md p-1.5 text-[#A1A1AA] transition-colors hover:bg-[#1F1F23] hover:text-white"
        >
          <Code className="h-4 w-4" />
        </button>

        <div className="mx-1 h-4 w-px bg-white/[0.1]" />

        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => runFormatCommand('insertUnorderedList')}
          title="Madde İşaretli Liste"
          aria-label="Madde İşaretli Liste"
          className="rounded-md p-1.5 text-[#A1A1AA] transition-colors hover:bg-[#1F1F23] hover:text-white"
        >
          <List className="h-4 w-4" />
        </button>
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => runFormatCommand('insertOrderedList')}
          title="Numaralı Liste"
          aria-label="Numaralı Liste"
          className="rounded-md p-1.5 text-[#A1A1AA] transition-colors hover:bg-[#1F1F23] hover:text-white"
        >
          <ListOrdered className="h-4 w-4" />
        </button>
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={insertTaskItem}
          title="Görev Kutusu Ekle"
          aria-label="Görev Kutusu Ekle"
          className="rounded-md p-1.5 text-[#A1A1AA] transition-colors hover:bg-[#1F1F23] hover:text-white"
        >
          <CheckSquare className="h-4 w-4" />
        </button>
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => runFormatCommand('formatBlock', 'BLOCKQUOTE')}
          title="Alıntı"
          aria-label="Alıntı"
          className="rounded-md p-1.5 text-[#A1A1AA] transition-colors hover:bg-[#1F1F23] hover:text-white"
        >
          <Quote className="h-4 w-4" />
        </button>
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={openLinkPopover}
          title="Bağlantı Ekle"
          aria-label="Bağlantı Ekle"
          className="rounded-md p-1.5 text-[#A1A1AA] transition-colors hover:bg-[#1F1F23] hover:text-white"
        >
          <Link2 className="h-4 w-4" />
        </button>

        {showLinkInput && (
          <form
            onSubmit={applyLink}
            className="ml-2 flex items-center gap-1 rounded-md border border-white/[0.1] bg-black px-2 py-0.5"
          >
            <input
              type="url"
              autoFocus
              value={linkUrl}
              onChange={(e) => setLinkUrl(e.target.value)}
              placeholder="https://..."
              className="w-44 bg-transparent text-xs text-white outline-none"
            />
            <button
              type="submit"
              aria-label="Bağlantıyı uygula"
              className="rounded p-1 text-[#34D399] hover:bg-[#18181B]"
            >
              <Check className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setShowLinkInput(false)}
              aria-label="Bağlantı eklemeyi iptal et"
              className="rounded p-1 text-[#A1A1AA] hover:bg-[#18181B]"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </form>
        )}
      </div>

      {/* ContentEditable Normal Rich Text Canvas */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div
          ref={editorRef}
          contentEditable
          suppressContentEditableWarning
          role="textbox"
          aria-multiline="true"
          aria-label="Normal zengin metin editörü"
          onInput={syncDomToMarkdown}
          onChange={(event) => {
            const target = event.target;
            if (target instanceof HTMLInputElement && target.type === 'checkbox') {
              if (target.checked) {
                target.setAttribute('checked', 'checked');
              } else {
                target.removeAttribute('checked');
              }
              syncDomToMarkdown();
            }
          }}
          className="markdown-preview mx-auto min-h-full max-w-3xl px-6 py-6 outline-none lg:px-8 lg:py-7"
        />
      </div>
    </div>
  );
}
