import { useSpaceStore } from '../store/spaceStore';

export function LoadingSpaceScreen() {
  const progress = useSpaceStore((s) => s.loadProgress);
  const current = progress?.current ?? 0;
  const total = progress?.total ?? 0;
  const pct = total === 0 ? 0 : Math.round((current / total) * 100);

  return (
    <div className="w-full h-full flex flex-col items-center justify-center gap-6">
      <div
        style={{
          fontSize: 'var(--font-size-xl)',
          color: 'var(--text-primary)',
          letterSpacing: '0.02em',
        }}
      >
        Restoring your space…
      </div>
      <div
        style={{
          width: 320,
          height: 4,
          background: 'var(--border-subtle)',
          borderRadius: 2,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            width: `${pct}%`,
            height: '100%',
            background: 'var(--color-accent)',
            transition: 'width var(--duration-color) var(--ease-translate)',
          }}
        />
      </div>
      <div
        style={{
          fontSize: 'var(--font-size-md)',
          color: 'var(--text-tertiary)',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {current} / {total} photos
      </div>
    </div>
  );
}
