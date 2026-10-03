import { Star } from 'lucide-react';
import { usePaperLibraryState, useLibraryPending } from './use-paper-library';
import { toggleFavorite, type FavoriteTransition } from './library-store';

interface FavoriteButtonProps {
  paperId: string;
  /** Render the "收藏 / 已收藏" label next to the star (default: icon-only). */
  labeled?: boolean;
  size?: 'sm' | 'md';
  className?: string;
  /** Called after the toggle settles (success or failure) so the host can refetch/sync. */
  onToggled?: (transition: FavoriteTransition) => void;
}

/**
 * The ONE favorite button used on every surface (Radar, Papers list/detail, SourceDetail,
 * recommendations, Library). Reads the shared store, so it is always current and updates
 * cross-page. Filled/outline star + "收藏/已收藏" text, aria-pressed + aria-busy/disabled,
 * stopPropagation (it lives inside cards that may navigate), and a per-action pending guard.
 */
export function FavoriteButton({ paperId, labeled = false, size = 'md', className = '', onToggled }: FavoriteButtonProps) {
  const state = usePaperLibraryState(paperId);
  const busy = useLibraryPending(paperId, 'favorite');
  const filled = state.isFavorite;
  const iconSize = size === 'sm' ? 13 : 15;

  return (
    <button
      type="button"
      aria-pressed={filled}
      aria-busy={busy}
      aria-label={filled ? '取消收藏' : '收藏'}
      title={filled ? '已收藏' : '收藏'}
      disabled={busy}
      onClick={(e) => {
        e.stopPropagation();
        void toggleFavorite(paperId).then((t) => onToggled?.(t));
      }}
      className={
        labeled
          ? `inline-flex items-center gap-1.5 rounded-[8px] border px-3 py-1.5 text-xs transition-colors disabled:cursor-wait disabled:opacity-60 ${
              filled
                ? 'border-[var(--primary)] bg-[var(--accent)] text-[var(--accent-foreground)]'
                : 'border-[var(--border)] bg-[var(--card)] text-[var(--foreground)] hover:border-[var(--primary)]'
            } ${className}`
          : `rounded p-1.5 transition-colors hover:bg-[var(--accent)] disabled:cursor-wait disabled:opacity-60 ${className}`
      }
    >
      <Star
        size={iconSize}
        className={`${busy ? 'animate-pulse' : ''} ${
          filled ? 'fill-[var(--primary)] text-[var(--primary)]' : 'text-[var(--muted-foreground)]'
        }`}
      />
      {labeled && <span>{filled ? '已收藏' : '收藏'}</span>}
    </button>
  );
}
