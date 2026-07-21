import { Fragment, useEffect, useRef, useState } from 'react';
import { FrostPanel } from './ui/FrostPanel';
import { useHandStore } from '../store/handStore';
import { handTracker } from '../lib/handTracking';
import { HandOverlay } from './HandOverlay';
import { FaceEmojiLayer } from './FaceEmojiLayer';

/**
 * Full-screen AR backdrop behind the transparent 3D canvas. In 'camera' mode the live
 * (mirrored) webcam fills the viewport; in 'black'/'white' modes the webcam stays hidden
 * (it still feeds hand tracking) and only the hands are visualized. Also owns the
 * webcam start/stop lifecycle driven by the hand-control toggle.
 */
export function CameraLayer() {
  const enabled = useHandStore((s) => s.enabled);
  const status = useHandStore((s) => s.status);
  const errorMessage = useHandStore((s) => s.errorMessage);
  const setStatus = useHandStore((s) => s.setStatus);
  const background = useHandStore((s) => s.background);
  const faceEmoji = useHandStore((s) => s.faceEmoji);
  const faceEmojiGlyph = useHandStore((s) => s.faceEmojiGlyph);
  const controlMode = useHandStore((s) => s.controlMode);
  const bgRef = useRef<HTMLDivElement>(null);
  const [showHint, setShowHint] = useState(true);

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
      } catch (err) {
        if (cancelled) return;
        const msg =
          err instanceof Error
            ? err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError'
              ? '카메라 권한이 거부됐어요. 브라우저 설정에서 허용해주세요.'
              : err.message
            : '손 인식을 시작하지 못했어요.';
        setStatus('error', msg);
      }
    })();

    return () => {
      cancelled = true;
      handTracker.stop();
    };
  }, [enabled, setStatus]);

  // The video element stays mounted in EVERY mode while tracking is active — browsers
  // pause media elements that get detached from the document, which would silently kill
  // hand tracking. Hidden-camera modes just make it invisible.
  useEffect(() => {
    const container = bgRef.current;
    if (!container) return;
    if (status !== 'active') {
      container.replaceChildren();
      return;
    }
    const video = handTracker.getVideoElement();
    if (video) {
      video.style.width = '100%';
      video.style.height = '100%';
      video.style.objectFit = 'cover';
      // Mirror so the user sees themselves naturally (matches the mirrored landmarks).
      video.style.transform = 'scaleX(-1)';
      video.style.visibility = background === 'camera' ? 'visible' : 'hidden';
      if (video.parentElement !== container) container.appendChild(video);
      if (video.paused) void video.play().catch(() => {});
    }
  }, [status, background]);

  // Detach the video only when the layer itself unmounts.
  useEffect(() => () => bgRef.current?.replaceChildren(), []);

  // Auto-dismiss the gesture cheat sheet after a few seconds.
  useEffect(() => {
    if (status !== 'active') return;
    setShowHint(true);
    const t = setTimeout(() => setShowHint(false), 7000);
    return () => clearTimeout(t);
  }, [status]);

  const backdropColor = !enabled
    ? 'var(--surface, #ededed)'
    : background === 'black'
      ? '#000'
      : background === 'white'
        ? '#fff'
        : '#111';

  return (
    <>
      {/* Backdrop: live webcam in 'camera' mode, solid color otherwise. */}
      <div
        ref={bgRef}
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 0,
          overflow: 'hidden',
          background: backdropColor,
        }}
      />

      {/* Hand visualization: full hands over solid backdrops, aim cursor only in camera mode. */}
      {enabled && status === 'active' && <HandOverlay />}

      {/* Camera mode privacy option: cover detected faces with an emoji. */}
      {enabled && status === 'active' && background === 'camera' && faceEmoji && (
        <FaceEmojiLayer emoji={faceEmojiGlyph} />
      )}

      {enabled && status !== 'active' && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 2,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            pointerEvents: 'none',
          }}
        >
          <FrostPanel style={{ padding: '12px 18px' }}>
            <span style={{ fontSize: 'var(--font-size-md)', color: 'var(--text-secondary)' }}>
              {status === 'requesting-permission' && '카메라 권한 요청 중…'}
              {status === 'loading-model' && '손 인식 모델 로딩 중…'}
              {status === 'off' && '카메라 꺼짐'}
              {status === 'error' && (errorMessage ?? '⚠ 카메라를 사용할 수 없어요')}
            </span>
          </FrostPanel>
        </div>
      )}

      {enabled && status === 'active' && controlMode === 'hand' && (
        <div
          style={{
            position: 'fixed',
            left: 24,
            top: '50%',
            transform: 'translateY(-50%)',
            zIndex: 10,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-start',
            gap: 8,
          }}
        >
          {showHint && (
            <FrostPanel style={{ padding: '12px 16px', maxWidth: 360 }}>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'auto 1fr',
                  gap: '6px 12px',
                  fontSize: 'var(--font-size-sm)',
                  color: 'var(--text-secondary)',
                  lineHeight: 1.3,
                }}
              >
                {GESTURES.map(([icon, label]) => (
                  <Fragment key={label}>
                    <span style={{ whiteSpace: 'nowrap' }}>{icon}</span>
                    <span>{label}</span>
                  </Fragment>
                ))}
              </div>
            </FrostPanel>
          )}
          <FrostPanel style={{ padding: '6px 12px' }}>
            <button
              type="button"
              onClick={() => setShowHint((v) => !v)}
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
                padding: '9px 12px',
                cursor: 'pointer',
                transition:
                  'transform 160ms ease, box-shadow 160ms ease, background 160ms ease, border-color 160ms ease, color 160ms ease',
              }}
            >
              {showHint ? '✕ 제스처 닫기' : '✋ 제스처 보기'}
            </button>
          </FrostPanel>
        </div>
      )}
    </>
  );
}

const GESTURES: [string, string][] = [
  ['✋ 조준', '손을 들면 사진들이 잠잠해져요 — 링 커서로 조준하세요'],
  ['🤏 잡기', '커서를 사진에 대고 엄지·검지를 꼬집으면 잡혀요'],
  ['↔ 옮기기', '잡은 채로 손을 움직이면 사진이 따라와요'],
  ['🤏→📷 당기기', '잡은 채 손을 카메라 쪽으로 — 그 사진만 가까워져요 (놓으면 그 자리에 붙어요)'],
  ['🤏🤏 늘리기/돌리기', '잡은 뒤 반대 손도 꼬집으세요 — 벌리면 크기, 돌리면 회전 (먼저 시작한 쪽만 적용)'],
  ['🙌 크기', '잡은 채 반대 손을 활짝 펴 들고 벌려도 크기 조절이 돼요'],
  ['🌀 돌리기', '잡은 채로 손목을 돌리면 사진이 회전해요'],
  ['🚀 던지기', '잡은 채 휙 움직이며 놓으면 관성으로 날아가 벽에 튕겨요'],
  ['✋ 놓기', '손가락을 벌려 꼬집기를 풀면 그 자리에 놓여요'],
  ['🤲 공간 줌', '양손을 모두 활짝 펴고 벌리면 확대, 모으면 축소'],
  ['🤌 공간 돌리기', '다섯 손가락을 모으면 손이 보라색으로 변해요 — 그때 손목을 돌린 만큼 돌아가고, 손을 움직이면 기울어요'],
  ['👋 스핀', '한 손을 좌우로 휙 — 좌우 스핀, 위아래로 휙 — 상하 스핀'],
  ['✊ 정지', '주먹을 쥐면 회전이 그 자리에 멈춰요'],
];
