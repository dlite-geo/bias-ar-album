import { useCallback, useState } from 'react';
import type { ChangeEvent, CSSProperties, DragEvent } from 'react';
import { FrostPanel } from './ui/FrostPanel';
import { useViewStore } from '../store/viewStore';
import { usePhotoStore } from '../store/photoStore';
import { loadPhotoWithHash } from '../lib/loadPhoto';

const ACCEPTED = /\.(jpe?g|png|webp)$/i;

export function LandingScreen() {
  const setView = useViewStore((s) => s.setView);
  const setProgress = useViewStore((s) => s.setProgress);
  const setPhotos = usePhotoStore((s) => s.setPhotos);
  const [dragOver, setDragOver] = useState(false);

  const ingest = useCallback(
    async (files: File[]) => {
      const jpgs = files.filter((f) => ACCEPTED.test(f.name));
      if (jpgs.length === 0) return;

      setProgress(0, jpgs.length);
      setView('processing');

      const photos: Awaited<ReturnType<typeof loadPhotoWithHash>>['photo'][] = [];
      const accepted: File[] = [];
      const hashes: string[] = [];
      for (let i = 0; i < jpgs.length; i++) {
        try {
          const { photo, contentHash } = await loadPhotoWithHash(jpgs[i]);
          photos.push(photo);
          accepted.push(jpgs[i]);
          hashes.push(contentHash);
        } catch (err) {
          console.warn(`Skipping ${jpgs[i].name}:`, err);
        }
        setProgress(i + 1, jpgs.length);
      }

      setPhotos(photos, accepted, hashes);
      setView('space');
    },
    [setView, setProgress, setPhotos],
  );

  const onDrop = useCallback(
    (e: DragEvent<HTMLLabelElement>) => {
      e.preventDefault();
      setDragOver(false);
      const items = e.dataTransfer.files;
      ingest(Array.from(items));
    },
    [ingest],
  );

  const onPick = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (!files) return;
      ingest(Array.from(files));
    },
    [ingest],
  );

  return (
    <div className="w-full h-full flex flex-col items-center justify-center gap-8 px-6">
      <div className="flex flex-col items-center gap-3 text-center max-w-2xl">
        <h1
          style={{
            fontSize: 'var(--font-size-hero-large)',
            fontWeight: 600,
            letterSpacing: '-0.02em',
          }}
        >
          PinViz
        </h1>
        <p
          style={{
            fontSize: 'var(--font-size-lg)',
            color: 'var(--text-secondary)',
            maxWidth: 520,
          }}
        >
          Drop your trip photos and watch them come alive in a 3D space.
        </p>
      </div>

      <FrostPanel
        style={{
          width: 'min(560px, 90vw)',
          padding: '48px 32px',
          textAlign: 'center',
          borderStyle: 'dashed',
          borderColor: dragOver ? 'var(--color-accent)' : 'var(--border-medium)',
          transition: `border-color var(--duration-color) var(--ease-translate)`,
        }}
      >
        <label
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          style={{ display: 'block', cursor: 'pointer' }}
        >
          <input
            type="file"
            multiple
            accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
            onChange={onPick}
            style={{ display: 'none' }}
          />
          <div
            style={{
              fontSize: 'var(--font-size-xl)',
              color: 'var(--text-primary)',
              marginBottom: 8,
            }}
          >
            Drop your photos here
          </div>
          <div
            style={{
              fontSize: 'var(--font-size-md)',
              color: 'var(--text-tertiary)',
              lineHeight: 1.5,
            }}
          >
            JPG, PNG, and WebP. Click to choose files. Works entirely in your browser —
            your photos never leave your device.
          </div>
        </label>
      </FrostPanel>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          marginTop: 24,
          flexWrap: 'wrap',
          justifyContent: 'center',
        }}
      >
        <a
          href="https://discord.com/invite/SndB4Psg"
          target="_blank"
          rel="noopener noreferrer"
          style={DISCORD_STYLE}
        >
          💬 Join our Discord
        </a>
        <a
          href="https://www.trybluey.com/products/bluey-lite"
          target="_blank"
          rel="noopener noreferrer"
          style={BLUEY_STYLE}
        >
          ✨ Get Bluey Lite
        </a>
      </div>
    </div>
  );
}

const BUTTON_BASE: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 8,
  padding: '14px 28px',
  borderRadius: 999,
  fontSize: 'var(--font-size-lg)',
  fontWeight: 700,
  letterSpacing: '0.01em',
  textDecoration: 'none',
  boxShadow: '0 6px 20px rgba(0, 0, 0, 0.12)',
};

const DISCORD_STYLE: CSSProperties = {
  ...BUTTON_BASE,
  background: '#5865F2',
  color: '#ffffff',
};

const BLUEY_STYLE: CSSProperties = {
  ...BUTTON_BASE,
  background: 'var(--color-accent)',
  color: 'var(--text-primary)',
};
