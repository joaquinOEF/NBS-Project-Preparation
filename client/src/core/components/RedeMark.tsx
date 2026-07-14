// Rede SCbN POA brand motif — the logo's four organic color tiles reduced to
// a quiet 2×2 mark. Decision (COUGAR Perfect Demo, 2026-07-14): the platform
// carries the network's visual identity (colors), never the logo itself —
// it serves the whole Rede, not one organization.
//
// Palette sampled from the official logo PDF:
//   terracotta #8A4C38 · ochre #8F7041 · blue #4B5C8A · teal #7D9AA6
//   cream (backgrounds) #EFE9DC · slate (text/CTAs) #3F4A46

const TILES = ['bg-[#8A4C38]', 'bg-[#8F7041]', 'bg-[#4B5C8A]', 'bg-[#7D9AA6]'];

export function RedeMark({ size = 'sm' }: { size?: 'sm' | 'md' }) {
  const tile = size === 'md' ? 'w-3.5 h-3.5 rounded-[5px]' : 'w-2 h-2 rounded-[3px]';
  const gap = size === 'md' ? 'gap-1' : 'gap-0.5';
  return (
    <div className={`grid grid-cols-2 ${gap} shrink-0`} aria-hidden data-testid="rede-mark">
      {TILES.map(c => (
        <span key={c} className={`${tile} ${c}`} />
      ))}
    </div>
  );
}
