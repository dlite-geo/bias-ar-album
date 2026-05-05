import { SvgFilters } from './components/SvgFilters';

export default function App() {
  return (
    <>
      <SvgFilters />
      <div className="w-full h-full flex items-center justify-center">
        <h1 style={{ fontSize: 'var(--font-size-hero-medium)' }}>TripTrace</h1>
      </div>
    </>
  );
}
