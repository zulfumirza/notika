interface AssetBadgeProps {
  label: string;
  colorClass: string;
  size?: 'sm' | 'md';
  darkText?: boolean;
}

export function AssetBadge({
  label,
  colorClass,
  size = 'md',
  darkText = false,
}: AssetBadgeProps) {
  const letter = label.trim().slice(0, 1).toUpperCase() || 'N';

  return (
    <span
      className={`badge-bevel inline-flex shrink-0 items-center justify-center rounded-full text-xs font-medium ${
        size === 'sm' ? 'h-6 w-6' : 'h-9 w-9'
      } ${colorClass} ${darkText ? 'text-slate-800' : 'text-white'}`}
    >
      {letter}
    </span>
  );
}
