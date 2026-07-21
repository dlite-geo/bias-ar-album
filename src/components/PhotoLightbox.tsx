import { useEffect } from 'react';
import { usePhotoStore } from '../store/photoStore';

export function PhotoLightbox() {
  const selectedId = usePhotoStore((s) => s.selectedId);
  const photos = usePhotoStore((s) => s.photos);
  const setSelected = usePhotoStore((s) => s.setSelected);

  const photo = selectedId ? photos.find((p) => p.id === selectedId) : null;

  useEffect(() => {
    if (!photo) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelected(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [photo, setSelected]);

  if (!photo) return null;

  return (
    <div
      onClick={() => setSelected(null)}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(237, 237, 237, 0.85)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        zIndex: 100,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 48,
        cursor: 'zoom-out',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'relative',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          maxWidth: '100%',
          maxHeight: '100%',
        }}
      >
        <button
          type="button"
          aria-label="사진 닫기"
          onClick={() => setSelected(null)}
          style={{
            position: 'absolute',
            top: 12,
            left: '50%',
            transform: 'translateX(-50%)',
            width: 34,
            height: 34,
            borderRadius: 9999,
            border: '1px solid rgba(0, 0, 0, 0.12)',
            background: 'rgba(255, 255, 255, 0.92)',
            backdropFilter: 'blur(14px)',
            WebkitBackdropFilter: 'blur(14px)',
            boxShadow: '0 8px 24px rgba(0, 0, 0, 0.18)',
            color: 'rgba(0, 0, 0, 0.72)',
            fontFamily:
              '-apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display", system-ui, sans-serif',
            fontSize: 20,
            lineHeight: 1,
            display: 'grid',
            placeItems: 'center',
            cursor: 'pointer',
            zIndex: 1,
          }}
        >
          ×
        </button>
        <img
          src={photo.blobUrl}
          alt={photo.name}
          style={{
            display: 'block',
            maxWidth: '100%',
            maxHeight: '100%',
            objectFit: 'contain',
            borderRadius: 8,
            boxShadow: '0 20px 60px rgba(0, 0, 0, 0.18)',
            cursor: 'default',
          }}
        />
      </div>
    </div>
  );
}
