import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChangeEvent, DragEvent } from 'react';
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
  const pickerRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const input = pickerRef.current;
    if (!input) return;
    input.setAttribute('webkitdirectory', '');
    input.setAttribute('directory', '');
  }, []);

  const openPicker = useCallback((reset = false) => {
    const input = pickerRef.current;
    if (!input) return;
    if (reset) input.value = '';
    input.click();
  }, []);

  const ingest = useCallback(
    async (files: File[]) => {
      const jpgs = [...files]
        .sort((a, b) => (a.webkitRelativePath || a.name).localeCompare(b.webkitRelativePath || b.name))
        .filter((f) => ACCEPTED.test(f.name));
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
          최애 AR 앨범
        </h1>
        <p
          style={{
            fontSize: 'var(--font-size-lg)',
            color: 'var(--text-secondary)',
            maxWidth: 520,
          }}
        >
          최애 사진을 드롭하면 3D 공간에 떠올라 살아 움직여요.
        </p>
      </div>

      <FrostPanel
        style={{
          width: 'min(560px, 90vw)',
          padding: '48px 32px',
          textAlign: 'center',
          borderStyle: 'dashed',
          borderColor: dragOver ? 'var(--color-accent)' : 'var(--border-medium)',
          transform: dragOver ? 'scale(1.01)' : 'scale(1)',
          transition: `border-color var(--duration-color) var(--ease-translate)`,
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {dragOver && (
          <div
            aria-hidden="true"
            style={{
              position: 'absolute',
              inset: 0,
              display: 'grid',
              placeItems: 'center',
              background: 'rgba(66, 134, 255, 0.08)',
              backdropFilter: 'blur(2px)',
              WebkitBackdropFilter: 'blur(2px)',
              color: 'var(--text-primary)',
              fontSize: 'var(--font-size-lg)',
              fontWeight: 600,
              letterSpacing: '-0.01em',
              pointerEvents: 'none',
            }}
          >
            놓으면 안의 이미지를 바로 읽어요
          </div>
        )}
        <label
          onDragEnter={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          style={{ display: 'block', cursor: 'pointer' }}
        >
          <input
            ref={pickerRef}
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
            여기에 사진이나 폴더를 드롭하세요
          </div>
          <div
            style={{
              fontSize: 'var(--font-size-md)',
              color: 'var(--text-tertiary)',
              lineHeight: 1.5,
            }}
          >
            폴더를 한 번 선택하면 안의 이미지를 모두 읽어요. 모든 처리는 브라우저
            안에서만 이루어져 사진이 기기 밖으로 나가지 않아요.
          </div>
        </label>
        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            gap: 12,
            flexWrap: 'wrap',
            marginTop: 24,
          }}
        >
          <button
            type="button"
            onClick={() => openPicker(false)}
            style={{
              appearance: 'none',
              border: '1px solid rgba(0, 0, 0, 0.12)',
              borderRadius: 9999,
              background: 'linear-gradient(180deg, rgba(255, 255, 255, 0.96), rgba(235, 236, 241, 0.84))',
              color: 'var(--text-primary)',
              boxShadow: '0 1px 0 rgba(255, 255, 255, 0.92) inset, 0 8px 18px rgba(0, 0, 0, 0.08)',
              fontFamily:
                '-apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display", system-ui, sans-serif',
              fontSize: 13,
              fontWeight: 500,
              letterSpacing: '-0.01em',
              lineHeight: 1,
              minHeight: 44,
              padding: '0 16px',
              cursor: 'pointer',
            }}
          >
            폴더 선택
          </button>
          <button
            type="button"
            onClick={() => openPicker(true)}
            style={{
              appearance: 'none',
              border: '1px solid rgba(0, 0, 0, 0.12)',
              borderRadius: 9999,
              background: 'linear-gradient(180deg, rgba(255, 255, 255, 0.96), rgba(235, 236, 241, 0.84))',
              color: 'var(--text-primary)',
              boxShadow: '0 1px 0 rgba(255, 255, 255, 0.92) inset, 0 8px 18px rgba(0, 0, 0, 0.08)',
              fontFamily:
                '-apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display", system-ui, sans-serif',
              fontSize: 13,
              fontWeight: 500,
              letterSpacing: '-0.01em',
              lineHeight: 1,
              minHeight: 44,
              padding: '0 16px',
              cursor: 'pointer',
            }}
          >
            새로 선택하기
          </button>
        </div>
      </FrostPanel>

    </div>
  );
}
