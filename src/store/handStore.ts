import { create } from 'zustand';

export type HandStatus = 'off' | 'requesting-permission' | 'loading-model' | 'active' | 'error';

/** What fills the viewport behind the 3D canvas. The webcam keeps running for hand
 *  tracking in every mode — 'black'/'white' just don't display it. */
export type BackgroundMode = 'camera' | 'black' | 'white';

/** How hands are visualized when the webcam feed itself is hidden. */
export type HandStyle = 'real' | 'skeleton' | 'emoji';

/** Which primary control profile the scene should emphasize. */
export type ControlMode = 'hand' | 'pointer';

const FACE_EMOJI_CYCLE = ['😎', '🤖', '👻', '😷'] as const;

const BACKGROUND_CYCLE: BackgroundMode[] = ['camera', 'black', 'white'];
const HAND_STYLE_CYCLE: HandStyle[] = ['real', 'skeleton', 'emoji'];

interface HandState {
  enabled: boolean;
  status: HandStatus;
  errorMessage: string | null;
  background: BackgroundMode;
  handStyle: HandStyle;
  faceEmoji: boolean;
  faceEmojiGlyph: string;
  controlMode: ControlMode;
  toggle: () => void;
  setStatus: (status: HandStatus, errorMessage?: string | null) => void;
  cycleBackground: () => void;
  cycleHandStyle: () => void;
  toggleFaceEmoji: () => void;
  cycleFaceEmoji: () => void;
  setControlMode: (mode: ControlMode) => void;
}

export const useHandStore = create<HandState>((set) => ({
  enabled: true,
  status: 'off',
  errorMessage: null,
  background: 'camera',
  handStyle: 'real',
  faceEmoji: false,
  faceEmojiGlyph: FACE_EMOJI_CYCLE[0],
  controlMode: 'hand',
  toggle: () => set((s) => ({ enabled: !s.enabled, errorMessage: null })),
  setStatus: (status, errorMessage = null) => set({ status, errorMessage }),
  cycleBackground: () =>
    set((s) => ({
      background: BACKGROUND_CYCLE[(BACKGROUND_CYCLE.indexOf(s.background) + 1) % BACKGROUND_CYCLE.length],
    })),
  cycleHandStyle: () =>
    set((s) => ({
      handStyle: HAND_STYLE_CYCLE[(HAND_STYLE_CYCLE.indexOf(s.handStyle) + 1) % HAND_STYLE_CYCLE.length],
    })),
  toggleFaceEmoji: () => set((s) => ({ faceEmoji: !s.faceEmoji })),
  cycleFaceEmoji: () =>
    set((s) => ({
      faceEmojiGlyph:
        FACE_EMOJI_CYCLE[
          (FACE_EMOJI_CYCLE.indexOf(s.faceEmojiGlyph as (typeof FACE_EMOJI_CYCLE)[number]) + 1) %
            FACE_EMOJI_CYCLE.length
        ],
    })),
  setControlMode: (mode) => set({ controlMode: mode }),
}));
