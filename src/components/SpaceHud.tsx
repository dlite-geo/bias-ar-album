import type { CSSProperties } from 'react';
import { FrostPanel } from './ui/FrostPanel';
import { useViewStore } from '../store/viewStore';
import { usePhotoStore } from '../store/photoStore';
import { useHandStore, type BackgroundMode, type ControlMode, type HandStyle } from '../store/handStore';

type LabelParts = {
  icon: string;
  text: string;
  iconAfter?: boolean;
};

const BG_LABELS: Record<BackgroundMode, LabelParts> = {
  camera: { icon: '📷', text: '캠' },
  black: { icon: '⬛', text: '블랙' },
  white: { icon: '⬜', text: '화이트' },
};

const HAND_LABELS: Record<HandStyle, LabelParts> = {
  real: { icon: '✋', text: '실사 손' },
  skeleton: { icon: '🦴', text: '스켈레톤' },
  emoji: { icon: '🖐️', text: '이모지' },
};

const CONTROL_LABELS: Record<ControlMode, LabelParts> = {
  hand: { icon: '✋', text: '손' },
  pointer: { icon: '🖱', text: '마우스/트랙패드' },
};

const macButtonBase: CSSProperties = {
  appearance: 'none',
  border: '1px solid rgba(0, 0, 0, 0.12)',
  borderRadius: 9999,
  background: 'linear-gradient(180deg, rgba(255, 255, 255, 0.96), rgba(235, 236, 241, 0.84))',
  color: 'var(--text-primary)',
  boxShadow: '0 1px 0 rgba(255, 255, 255, 0.92) inset, 0 8px 18px rgba(0, 0, 0, 0.08)',
  fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display", system-ui, sans-serif',
  fontSize: 13,
  fontWeight: 500,
  letterSpacing: '-0.01em',
  lineHeight: 1,
  minHeight: 44,
  padding: '0 14px',
  cursor: 'pointer',
  transition:
    'transform 160ms ease, box-shadow 160ms ease, background 160ms ease, border-color 160ms ease, color 160ms ease',
  display: 'inline-grid',
  gridAutoFlow: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  columnGap: 8,
  whiteSpace: 'nowrap',
  boxSizing: 'border-box',
};

const macButtonStyle = (active = false): CSSProperties => ({
  ...macButtonBase,
  background: active
    ? 'linear-gradient(180deg, rgba(66, 134, 255, 0.96), rgba(33, 104, 243, 0.96))'
    : macButtonBase.background,
  borderColor: active ? 'rgba(34, 98, 241, 0.55)' : macButtonBase.borderColor,
  color: active ? '#fff' : 'var(--text-primary)',
  boxShadow: active
    ? '0 1px 0 rgba(255, 255, 255, 0.34) inset, 0 12px 24px rgba(33, 104, 243, 0.24)'
    : String(macButtonBase.boxShadow),
  transform: 'translateY(0)',
});

const macSegmentStyle: CSSProperties = {
  display: 'inline-flex',
  gap: 2,
  padding: 2,
  borderRadius: 9999,
  background: 'rgba(255, 255, 255, 0.52)',
  border: '1px solid rgba(0, 0, 0, 0.08)',
  boxShadow: '0 1px 0 rgba(255, 255, 255, 0.8) inset, 0 8px 18px rgba(0, 0, 0, 0.08)',
  alignItems: 'center',
};

const macSegmentButtonStyle: CSSProperties = {
  ...macButtonBase,
  minHeight: 40,
  padding: '0 12px',
};

const menuPanelStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '4px 6px',
};

const macButtonContentStyle: CSSProperties = {
  display: 'inline-grid',
  gridAutoFlow: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 6,
  lineHeight: 1,
  fontSize: 13,
  fontWeight: 500,
  whiteSpace: 'nowrap',
};

const macButtonIconStyle: CSSProperties = {
  display: 'inline-flex',
  placeItems: 'center',
  width: 18,
  height: 18,
  fontSize: 15,
  lineHeight: 1,
  flex: '0 0 auto',
};

function renderMacLabel(label: LabelParts) {
  return (
    <span style={macButtonContentStyle}>
      {!label.iconAfter && <span style={macButtonIconStyle}>{label.icon}</span>}
      <span>{label.text}</span>
      {label.iconAfter && <span style={macButtonIconStyle}>{label.icon}</span>}
    </span>
  );
}

export function SpaceHud() {
  const setView = useViewStore((s) => s.setView);
  const triggerGather = useViewStore((s) => s.triggerGather);
  const triggerFullReset = useViewStore((s) => s.triggerFullReset);
  const triggerShuffle = useViewStore((s) => s.triggerShuffle);
  const photos = usePhotoStore((s) => s.photos);
  const handEnabled = useHandStore((s) => s.enabled);
  const controlMode = useHandStore((s) => s.controlMode);
  const toggleHand = useHandStore((s) => s.toggle);
  const background = useHandStore((s) => s.background);
  const handStyle = useHandStore((s) => s.handStyle);
  const faceEmoji = useHandStore((s) => s.faceEmoji);
  const faceEmojiGlyph = useHandStore((s) => s.faceEmojiGlyph);
  const setControlMode = useHandStore((s) => s.setControlMode);
  const cycleBackground = useHandStore((s) => s.cycleBackground);
  const cycleHandStyle = useHandStore((s) => s.cycleHandStyle);
  const toggleFaceEmoji = useHandStore((s) => s.toggleFaceEmoji);
  const cycleFaceEmoji = useHandStore((s) => s.cycleFaceEmoji);
  const clear = usePhotoStore((s) => s.clear);

  const onClear = () => {
    clear();
    setView('landing');
  };

  return (
    <>
      <div
        style={{
          position: 'absolute',
          top: 24,
          left: 24,
          zIndex: 10,
          display: 'flex',
          flexWrap: 'wrap',
          gap: 10,
        }}
      >
        <FrostPanel style={menuPanelStyle}>
          <button
            type="button"
            onClick={onClear}
            style={macButtonStyle(false)}
          >
            {renderMacLabel({ icon: '←', text: '새 공간' })}
          </button>
        </FrostPanel>
        <FrostPanel style={menuPanelStyle}>
          <button
            type="button"
            onClick={triggerGather}
            title="사진 위치만 처음 배치로 되돌리기"
            style={macButtonStyle(false)}
          >
            {renderMacLabel({ icon: '⊕', text: '중앙 모으기' })}
          </button>
        </FrostPanel>
        <FrostPanel style={menuPanelStyle}>
          <button
            type="button"
            onClick={triggerFullReset}
            title="사진 위치·크기·회전과 카메라 시점을 모두 처음 상태로 되돌리기"
            style={macButtonStyle(false)}
          >
            {renderMacLabel({ icon: '⟲', text: '완전 초기화' })}
          </button>
        </FrostPanel>
        <FrostPanel style={menuPanelStyle}>
          <button
            type="button"
            onClick={triggerShuffle}
            title="현재 사진들을 새 랜덤 배치로 다시 뿌리기"
            style={macButtonStyle(false)}
          >
            {renderMacLabel({ icon: '🎲', text: '섞기' })}
          </button>
        </FrostPanel>
        <FrostPanel style={menuPanelStyle}>
          <button
            type="button"
            onClick={toggleHand}
            title="손 인식과 카메라를 켜거나 끄기"
            style={macButtonStyle(handEnabled)}
          >
            {renderMacLabel({ icon: '🖐', text: '손 인식' })}
          </button>
        </FrostPanel>
        <FrostPanel style={menuPanelStyle}>
          <div style={macSegmentStyle}>
            {(Object.keys(CONTROL_LABELS) as Array<keyof typeof CONTROL_LABELS>).map((mode) => {
              const active = controlMode === mode;
              return (
                <button
                  type="button"
                  key={mode}
                  onClick={() => setControlMode(mode)}
                  title={
                    mode === 'hand'
                      ? '손 제스처를 주 입력으로 사용'
                      : '마우스와 트랙패드를 같은 입력으로 사용'
                  }
                  aria-pressed={active}
                  style={active ? macButtonStyle(true) : macSegmentButtonStyle}
                >
                  {renderMacLabel(CONTROL_LABELS[mode])}
                </button>
              );
            })}
          </div>
        </FrostPanel>
        {handEnabled && (
          <FrostPanel style={menuPanelStyle}>
            <button
              type="button"
              onClick={cycleBackground}
              title="배경 전환: 캠 / 블랙 / 화이트"
              style={macButtonStyle(false)}
            >
              {renderMacLabel(BG_LABELS[background])}
            </button>
          </FrostPanel>
        )}
        {handEnabled && (
          <FrostPanel style={menuPanelStyle}>
            <button
              type="button"
              onClick={cycleHandStyle}
              title="손 표시 전환: 실사 / 스켈레톤 / 이모지"
              style={macButtonStyle(false)}
            >
              {renderMacLabel(HAND_LABELS[handStyle])}
            </button>
          </FrostPanel>
        )}
        {handEnabled && background === 'camera' && (
          <FrostPanel style={menuPanelStyle}>
            <div style={macSegmentStyle}>
              <button
                type="button"
                onClick={toggleFaceEmoji}
                title="얼굴을 이모지로 가리기"
                style={faceEmoji ? macButtonStyle(true) : macSegmentButtonStyle}
              >
                {renderMacLabel({
                  icon: faceEmojiGlyph,
                  text: faceEmoji ? '얼굴 가림' : '얼굴 가리기',
                })}
              </button>
              <button
                type="button"
                onClick={cycleFaceEmoji}
                title="얼굴 이모지 바꾸기"
                style={macSegmentButtonStyle}
              >
                {renderMacLabel({
                  icon: faceEmojiGlyph,
                  text: '이모지',
                  iconAfter: true,
                })}
              </button>
            </div>
          </FrostPanel>
        )}
        <FrostPanel style={menuPanelStyle}>
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              minHeight: 44,
              padding: '0 8px',
              fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display", system-ui, sans-serif',
              fontSize: 13,
              fontWeight: 500,
              letterSpacing: '-0.01em',
              color: 'var(--text-secondary)',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            사진 {photos.length}장
          </span>
        </FrostPanel>
      </div>
    </>
  );
}
