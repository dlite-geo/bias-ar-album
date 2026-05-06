import { useState } from 'react';
import { FrostPanel } from './ui/FrostPanel';
import { useSpaceStore } from '../store/spaceStore';
import { usePhotoStore } from '../store/photoStore';

export function SaveSpaceModal({ onClose }: { onClose: () => void }) {
  const photos = usePhotoStore((s) => s.photos);
  const files = usePhotoStore((s) => s.files);
  const hashes = usePhotoStore((s) => s.hashes);
  const layout = usePhotoStore((s) => s.layout);
  const saveCurrent = useSpaceStore((s) => s.saveCurrent);
  const saveProgress = useSpaceStore((s) => s.saveProgress);

  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSave =
    photos.length > 0 &&
    files.length === photos.length &&
    hashes.length === photos.length &&
    hashes.every((h) => h);

  const onSave = async () => {
    if (!canSave || !layout) {
      setError(
        !layout
          ? 'Layout not ready yet — please wait a moment and try again.'
          : 'This space cannot be re-saved (it was loaded from cloud). Drop photos fresh to make a new one.',
      );
      return;
    }
    setBusy(true);
    setError(null);
    const photoMeta = photos.map((p, i) => ({
      name: p.name,
      size: files[i].size,
      contentHash: hashes[i],
      aspectRatio: p.aspectRatio,
      scale: layout[i].scale,
      position: layout[i].position,
    }));
    const seed = Math.floor(Math.random() * 1_000_000_000);
    const result = await saveCurrent(name || 'Untitled space', seed, photoMeta, files);
    setBusy(false);
    if (result.error) setError(result.error);
    else onClose();
  };

  const progressPct =
    saveProgress && saveProgress.total > 0
      ? Math.round((saveProgress.current / saveProgress.total) * 100)
      : 0;

  return (
    <div
      onClick={busy ? undefined : onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(20, 20, 20, 0.4)',
        zIndex: 50,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div onClick={(e) => e.stopPropagation()}>
        <FrostPanel style={{ width: 'min(420px, 90vw)', padding: 28 }}>
          <div
            style={{
              fontSize: 'var(--font-size-xl)',
              color: 'var(--text-primary)',
              marginBottom: 16,
              fontWeight: 600,
            }}
          >
            Save this space
          </div>
          <input
            type="text"
            placeholder="Name this space"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
            disabled={busy}
            style={{
              width: '100%',
              padding: '10px 12px',
              fontSize: 'var(--font-size-lg)',
              fontFamily: 'inherit',
              background: 'var(--surface-elevated)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-button)',
              color: 'var(--text-primary)',
              marginBottom: 16,
              outline: 'none',
            }}
          />

          {saveProgress && (
            <div style={{ marginBottom: 16 }}>
              <div
                style={{
                  fontSize: 'var(--font-size-md)',
                  color: 'var(--text-secondary)',
                  marginBottom: 8,
                }}
              >
                Uploading {saveProgress.current} / {saveProgress.total} photos…
              </div>
              <div
                style={{
                  width: '100%',
                  height: 4,
                  background: 'var(--border-subtle)',
                  borderRadius: 2,
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    width: `${progressPct}%`,
                    height: '100%',
                    background: 'var(--color-accent)',
                    transition: 'width var(--duration-color) var(--ease-translate)',
                  }}
                />
              </div>
            </div>
          )}

          {error && (
            <div
              style={{
                color: 'var(--color-system-red)',
                fontSize: 'var(--font-size-md)',
                marginBottom: 12,
              }}
            >
              {error}
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button
              onClick={onClose}
              disabled={busy}
              style={{
                background: 'transparent',
                color: 'var(--text-secondary)',
                border: '1px solid var(--border-subtle)',
                padding: '8px 16px',
                borderRadius: 'var(--radius-button)',
                fontSize: 'var(--font-size-md)',
                cursor: busy ? 'not-allowed' : 'pointer',
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
                opacity: busy ? 0.5 : 1,
              }}
            >
              Cancel
            </button>
            <button
              onClick={onSave}
              disabled={busy || !canSave}
              style={{
                background: 'var(--color-accent)',
                color: 'var(--text-on-accent)',
                border: 'none',
                padding: '8px 16px',
                borderRadius: 'var(--radius-button)',
                fontSize: 'var(--font-size-md)',
                cursor: busy || !canSave ? 'not-allowed' : 'pointer',
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
                opacity: busy || !canSave ? 0.5 : 1,
              }}
            >
              {busy ? '…' : 'Save'}
            </button>
          </div>
        </FrostPanel>
      </div>
    </div>
  );
}
