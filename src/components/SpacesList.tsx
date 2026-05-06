import { useEffect } from 'react';
import { FrostPanel } from './ui/FrostPanel';
import { useSpaceStore } from '../store/spaceStore';
import { useViewStore } from '../store/viewStore';
import { useAuthStore } from '../store/authStore';

export function SpacesList() {
  const list = useSpaceStore((s) => s.list);
  const loading = useSpaceStore((s) => s.loadingList);
  const fetchList = useSpaceStore((s) => s.fetchList);
  const setPendingSpace = useSpaceStore((s) => s.setPendingSpace);
  const deleteSpace = useSpaceStore((s) => s.deleteSpace);
  const setView = useViewStore((s) => s.setView);
  const signOut = useAuthStore((s) => s.signOut);

  useEffect(() => {
    fetchList();
  }, [fetchList]);

  const onOpen = (space: (typeof list)[number]) => {
    setPendingSpace(space);
    setView('reattach');
  };

  const onDelete = async (id: string) => {
    if (!confirm('Delete this space?')) return;
    await deleteSpace(id);
    fetchList();
  };

  return (
    <div className="w-full h-full flex flex-col items-center justify-center px-6 gap-6">
      <h1
        style={{
          fontSize: 'var(--font-size-hero-medium)',
          fontWeight: 600,
          letterSpacing: '-0.02em',
        }}
      >
        My spaces
      </h1>

      <FrostPanel style={{ width: 'min(560px, 90vw)', maxHeight: '60vh', overflow: 'auto', padding: 24 }}>
        {loading && (
          <div style={{ color: 'var(--text-tertiary)', fontSize: 'var(--font-size-md)' }}>Loading…</div>
        )}
        {!loading && list.length === 0 && (
          <div style={{ color: 'var(--text-tertiary)', fontSize: 'var(--font-size-md)' }}>
            No saved spaces yet. Drop photos to create one.
          </div>
        )}
        {!loading &&
          list.map((space) => (
            <div
              key={space.id}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '12px 0',
                borderBottom: '1px solid var(--border-subtle)',
              }}
            >
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <button
                  onClick={() => onOpen(space)}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--text-primary)',
                    fontSize: 'var(--font-size-lg)',
                    textAlign: 'left',
                    padding: 0,
                    cursor: 'pointer',
                    fontWeight: 500,
                  }}
                >
                  {space.name}
                </button>
                <span style={{ color: 'var(--text-tertiary)', fontSize: 'var(--font-size-sm)' }}>
                  {space.photo_meta.length} photos · {new Date(space.updated_at).toLocaleDateString()}
                </span>
              </div>
              <button
                onClick={() => onDelete(space.id)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--text-tertiary)',
                  fontSize: 'var(--font-size-sm)',
                  cursor: 'pointer',
                }}
                aria-label="delete"
              >
                ✕
              </button>
            </div>
          ))}
      </FrostPanel>

      <div style={{ display: 'flex', gap: 16 }}>
        <button
          onClick={() => setView('landing')}
          style={{
            background: 'transparent',
            color: 'var(--text-secondary)',
            border: '1px solid var(--border-subtle)',
            padding: '8px 16px',
            borderRadius: 'var(--radius-button)',
            fontSize: 'var(--font-size-md)',
            cursor: 'pointer',
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
          }}
        >
          ← New space
        </button>
        <button
          onClick={signOut}
          style={{
            background: 'transparent',
            color: 'var(--text-tertiary)',
            border: 'none',
            padding: '8px 16px',
            fontSize: 'var(--font-size-md)',
            cursor: 'pointer',
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
          }}
        >
          Sign out
        </button>
      </div>
    </div>
  );
}
