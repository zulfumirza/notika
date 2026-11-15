import EmojiPicker, {
  EmojiStyle,
  Theme,
  type EmojiClickData,
} from 'emoji-picker-react';
import {
  BookOpen,
  Bookmark,
  Calendar,
  CheckSquare,
  Code2,
  FileText,
  Flame,
  Folder,
  FolderOpen,
  Heart,
  Lightbulb,
  Lock,
  Rocket,
  RotateCcw,
  Sparkles,
  Star,
  Terminal,
  X,
} from 'lucide-react';
import {
  NOTE_COLOR_IDS,
  type NoteColorId,
  type NoteIconId,
} from '../../shared/noteAppearance';
import type { TranslationStrings } from '../i18n/translations';

export interface NoteColorStyle {
  dotClass: string;
  iconTextClass: string;
  badgeClass: string;
  borderAccentClass: string;
}

export const NOTE_COLOR_STYLES: Record<NoteColorId, NoteColorStyle> = {
  default: {
    dotClass: 'bg-[#71717A]',
    iconTextClass: 'text-[#71717A]',
    badgeClass: 'bg-white/[0.05] text-[#A1A1AA] border-white/[0.08]',
    borderAccentClass: 'border-white/[0.08]',
  },
  emerald: {
    dotClass: 'bg-emerald-400',
    iconTextClass: 'text-emerald-400',
    badgeClass: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
    borderAccentClass: 'border-emerald-500/35',
  },
  sky: {
    dotClass: 'bg-sky-400',
    iconTextClass: 'text-sky-400',
    badgeClass: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
    borderAccentClass: 'border-sky-500/35',
  },
  violet: {
    dotClass: 'bg-violet-400',
    iconTextClass: 'text-violet-400',
    badgeClass: 'bg-violet-500/15 text-violet-300 border-violet-500/30',
    borderAccentClass: 'border-violet-500/35',
  },
  amber: {
    dotClass: 'bg-amber-400',
    iconTextClass: 'text-amber-400',
    badgeClass: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
    borderAccentClass: 'border-amber-500/35',
  },
  rose: {
    dotClass: 'bg-rose-400',
    iconTextClass: 'text-rose-400',
    badgeClass: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
    borderAccentClass: 'border-rose-500/35',
  },
  indigo: {
    dotClass: 'bg-indigo-400',
    iconTextClass: 'text-indigo-400',
    badgeClass: 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30',
    borderAccentClass: 'border-indigo-500/35',
  },
  orange: {
    dotClass: 'bg-orange-400',
    iconTextClass: 'text-orange-400',
    badgeClass: 'bg-orange-500/15 text-orange-300 border-orange-500/30',
    borderAccentClass: 'border-orange-500/35',
  },
  teal: {
    dotClass: 'bg-teal-400',
    iconTextClass: 'text-teal-400',
    badgeClass: 'bg-teal-500/15 text-teal-300 border-teal-500/30',
    borderAccentClass: 'border-teal-500/35',
  },
};

export function getNoteColorStyle(color?: NoteColorId): NoteColorStyle {
  return NOTE_COLOR_STYLES[color ?? 'default'] ?? NOTE_COLOR_STYLES.default;
}

function getEmojiSizeClass(className: string): string {
  if (className.includes('h-5')) return 'text-base';
  if (className.includes('h-3.5')) return 'text-xs';
  if (className.includes('h-3')) return 'text-[11px]';
  return 'text-sm';
}

export function NoteIconGlyph({
  icon,
  isLocked,
  isFolder,
  isExpanded,
  className = 'h-4 w-4',
}: {
  icon?: NoteIconId;
  isLocked?: boolean;
  isFolder?: boolean;
  isExpanded?: boolean;
  className?: string;
}) {
  if (isLocked) {
    return <Lock className={className} />;
  }

  switch (icon) {
    case 'sparkles':
      return <Sparkles className={className} />;
    case 'book':
      return <BookOpen className={className} />;
    case 'code':
      return <Code2 className={className} />;
    case 'lightbulb':
      return <Lightbulb className={className} />;
    case 'check-square':
      return <CheckSquare className={className} />;
    case 'star':
      return <Star className={className} />;
    case 'heart':
      return <Heart className={className} />;
    case 'rocket':
      return <Rocket className={className} />;
    case 'bookmark':
      return <Bookmark className={className} />;
    case 'terminal':
      return <Terminal className={className} />;
    case 'calendar':
      return <Calendar className={className} />;
    case 'flame':
      return <Flame className={className} />;
    case 'file':
    case undefined:
    case '':
      if (isFolder) {
        return isExpanded ? (
          <FolderOpen className={className} />
        ) : (
          <Folder className={className} />
        );
      }
      return <FileText className={className} />;
    default:
      return (
        <span
          aria-hidden="true"
          className={`inline-flex shrink-0 items-center justify-center leading-none select-none ${className} ${getEmojiSizeClass(className)}`}
        >
          {icon}
        </span>
      );
  }
}

interface NoteAppearancePickerProps {
  icon?: NoteIconId;
  color?: NoteColorId;
  busy?: boolean;
  defaultKind?: 'note' | 'project';
  pickerHeight?: number;
  t: TranslationStrings;
  onSelect: (next: { icon: NoteIconId | null; color: NoteColorId | null }) => void;
}

export function NoteAppearancePicker({
  icon,
  color,
  busy = false,
  defaultKind = 'note',
  pickerHeight = 300,
  t,
  onSelect,
}: NoteAppearancePickerProps) {
  const activeColor: NoteColorId = color ?? 'default';
  const colorStyle = getNoteColorStyle(color);

  const handleEmojiClick = (emojiData: EmojiClickData) => {
    if (busy) return;
    onSelect({
      icon: emojiData.emoji,
      color: color ?? null,
    });
  };

  return (
    <div className="space-y-3">
      <div>
        <div className="mb-2 text-[11px] font-medium tracking-wide text-[#A1A1AA] uppercase">
          {t.noteColorLabel}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {NOTE_COLOR_IDS.map((colorId) => {
            const style = NOTE_COLOR_STYLES[colorId];
            const selected = activeColor === colorId;
            return (
              <button
                key={colorId}
                type="button"
                disabled={busy}
                onClick={() =>
                  onSelect({
                    icon: icon ?? null,
                    color: colorId === 'default' ? null : colorId,
                  })
                }
                aria-label={colorId}
                aria-pressed={selected}
                className={`flex h-7 w-7 items-center justify-center rounded-full border transition-transform hover:scale-110 disabled:opacity-50 ${
                  selected
                    ? 'border-white ring-2 ring-white/30'
                    : 'border-white/15'
                }`}
              >
                <span className={`h-4 w-4 rounded-full ${style.dotClass}`} />
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between gap-2">
          <span className="text-[11px] font-medium tracking-wide text-[#A1A1AA] uppercase">
            {t.noteIconLabel}
          </span>
          <div className="flex items-center gap-1.5">
            {icon && (
              <span
                className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-xs ${
                  color
                    ? colorStyle.badgeClass
                    : 'border-white/[0.1] bg-white/[0.04] text-[#E4E4E7]'
                }`}
              >
                <NoteIconGlyph
                  icon={icon}
                  isFolder={defaultKind === 'project'}
                  className="h-3.5 w-3.5"
                />
              </span>
            )}
            {icon && (
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  onSelect({
                    icon: null,
                    color: color ?? null,
                  })
                }
                aria-label={t.resetAppearance}
                className="inline-flex h-6 items-center gap-1 rounded-md border border-white/[0.08] bg-[#111113] px-2 text-[11px] text-[#A1A1AA] transition-colors hover:border-white/[0.16] hover:text-white disabled:opacity-50"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
        </div>

        <div
          className={`notika-emoji-picker overflow-hidden rounded-xl ${
            busy ? 'pointer-events-none opacity-60' : ''
          }`}
        >
          <EmojiPicker
            theme={Theme.DARK}
            colorScheme="dark"
            emojiStyle={EmojiStyle.NATIVE}
            lazyLoadEmojis={true}
            cssLayer="epr"
            width="100%"
            height={pickerHeight}
            previewConfig={{ showPreview: false }}
            searchPlaceholder={t.emojiSearchPlaceholder}
            onEmojiClick={handleEmojiClick}
          />
        </div>
      </div>

      {(icon || color) && (
        <button
          type="button"
          disabled={busy}
          onClick={() => onSelect({ icon: null, color: null })}
          className="inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-lg border border-white/[0.08] bg-[#111113] px-3 text-xs font-medium text-[#A1A1AA] transition-colors hover:border-white/[0.16] hover:text-white disabled:opacity-50"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          <span>{t.resetAppearance}</span>
        </button>
      )}
    </div>
  );
}
