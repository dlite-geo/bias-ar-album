import { useEffect, useRef } from 'react';
import { FrostPanel } from './ui/FrostPanel';
import { useHandStore } from '../store/handStore';
import { handTracker } from '../lib/handTracking';

const PREVIEW_WIDTH = 200;
const PREVIEW_HEIGHT = 150;

export function HandControl() {
  const enabled = useHandStore((s) => s.enabled);
  const status = useHandStore((s) => s.status);
  const errorMessage = useHandStore((s) => s.errorMessage);
  const setStatus = useHandStore((s) => s.setStatus);
  const previewRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!enabled) {
      handTracker.stop();
      setStatus('off');
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        setStatus('requesting-permission');
        await handTracker.start();
        if (cancelled) {
          handTracker.stop();
          return;
        }
        setStatus('active');
        // Mount the video element into the preview slot.
        const video = handTracker.getVideoElement();
        if (video && previewRef.current) {
          video.style.width = '100%';
          video.style.height = '100%';
          video.style.objectFit = 'cover';
          // Mirror horizontally so the user sees themselves naturally.
          video.style.transform = 'scaleX(-1)';
          previewRef.current.appendChild(video);
        }
      } catch (err) {
        if (cancelled) return;
        const msg =
          err instanceof Error
            ? err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError'
              ? 'Camera permission denied. Enable it in your browser settings.'
              : err.message
            : 'Failed to start hand tracking.';
        setStatus('error', msg);
      }
    })();

    return () => {
      cancelled = true;
      handTracker.stop();
    };
  }, [enabled, setStatus]);

  if (!enabled) return null;

  return (
    <div
      style={{
        position: 'absolute',
        bottom: 24,
        right: 24,
        zIndex: 10,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-end',
        gap: 8,
      }}
    >
      <FrostPanel
        style={{
          width: PREVIEW_WIDTH,
          height: PREVIEW_HEIGHT,
          padding: 0,
          overflow: 'hidden',
          position: 'relative',
        }}
      >
        <div
          ref={previewRef}
          style={{
            width: '100%',
            height: '100%',
            background: 'var(--surface-elevated)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {status !== 'active' && (
            <span style={{ color: 'var(--text-tertiary)', fontSize: 'var(--font-size-md)' }}>
              {status === 'requesting-permission' && 'Asking for camera…'}
              {status === 'loading-model' && 'Loading model…'}
              {status === 'error' && '⚠ Camera unavailable'}
              {status === 'off' && '—'}
            </span>
          )}
        </div>
      </FrostPanel>
      {errorMessage && (
        <FrostPanel style={{ padding: '8px 12px', maxWidth: PREVIEW_WIDTH }}>
          <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-system-red)' }}>
            {errorMessage}
          </span>
        </FrostPanel>
      )}
      <FrostPanel style={{ padding: '6px 10px' }}>
        <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-tertiary)' }}>
          🖐 Pinch to pan · 🤲 Two-hand pinch to zoom
        </span>
      </FrostPanel>
    </div>
  );
}
