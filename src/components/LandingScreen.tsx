import { useViewStore } from '../store/viewStore';
import { FrostPanel } from './ui/FrostPanel';

export function LandingScreen() {
  const setView = useViewStore((s) => s.setView);

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
          TripTrace
        </h1>
        <p
          style={{
            fontSize: 'var(--font-size-lg)',
            color: 'var(--color-grey-300)',
            maxWidth: 520,
          }}
        >
          Drop your trip photos and watch them come alive as a 3D journey.
        </p>
      </div>

      <FrostPanel
        style={{
          width: 'min(560px, 90vw)',
          padding: '48px 32px',
          textAlign: 'center',
          borderStyle: 'dashed',
          borderColor: 'rgba(255, 255, 255, 0.18)',
        }}
      >
        <div
          style={{
            fontSize: 'var(--font-size-xl)',
            color: 'var(--color-grey-100)',
            marginBottom: 8,
          }}
        >
          Drop your trip photos here
        </div>
        <div
          style={{
            fontSize: 'var(--font-size-md)',
            color: 'var(--color-grey-400)',
            lineHeight: 1.5,
          }}
        >
          Supports JPG, HEIC, and Live Photos. Works entirely in your browser —
          your photos never leave your device.
        </div>
      </FrostPanel>

      <button
        onClick={() => setView('globe')}
        style={{
          background: 'transparent',
          color: 'var(--color-accent)',
          border: '1px solid var(--color-accent)',
          padding: '10px 20px',
          borderRadius: 'var(--radius-button)',
          fontSize: 'var(--font-size-md)',
          letterSpacing: '0.04em',
          textTransform: 'uppercase',
          transition: `background var(--duration-color) var(--ease-translate), color var(--duration-color) var(--ease-translate)`,
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLButtonElement).style.background = 'var(--color-accent)';
          (e.currentTarget as HTMLButtonElement).style.color = 'var(--color-black)';
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
          (e.currentTarget as HTMLButtonElement).style.color = 'var(--color-accent)';
        }}
      >
        See the demo globe →
      </button>
    </div>
  );
}
