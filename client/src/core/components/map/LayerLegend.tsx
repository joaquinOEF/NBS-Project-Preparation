import type { LegendSpec } from '@shared/legend-types';

// Compact inline legend for one map layer — a gradient bar with low/mid/high value
// bounds (+ unit) for numeric layers, or labeled swatches for categorical.
// Spec comes from client/public/sample-data/layer-legends.json (generate-legends.ts).

const fmt = (v: number) => {
  if (Number.isInteger(v)) return String(v);
  const a = Math.abs(v);
  if (a >= 100) return String(Math.round(v));
  if (a >= 1) return v.toFixed(1);
  return v.toFixed(2);
};

export function LayerLegend({ spec, name }: { spec?: LegendSpec; name?: string }) {
  if (!spec) return null;

  if (spec.kind === 'classes') {
    return (
      <div className="flex flex-wrap gap-x-2 gap-y-0.5">
        {spec.stops.map((s) => (
          <span key={s.value} className="flex items-center gap-1 text-[9px] text-zinc-300">
            <i className="w-2 h-2 rounded-sm flex-shrink-0" style={{ backgroundColor: s.color }} />
            {s.label ?? s.value}
          </span>
        ))}
      </div>
    );
  }

  const min = spec.min ?? spec.stops[0].value;
  const max = spec.max ?? spec.stops[spec.stops.length - 1].value;
  const span = max - min || 1;
  const gradient = `linear-gradient(to right, ${spec.stops
    .map((s) => `${s.color} ${(((s.value - min) / span) * 100).toFixed(1)}%`)
    .join(', ')})`;

  return (
    <div>
      <div className="h-2 rounded-sm w-full border border-white/10" style={{ background: gradient }} />
      <div className="flex justify-between text-[9px] text-zinc-400 mt-0.5 leading-none">
        <span>{fmt(min)}</span>
        <span>{fmt((min + max) / 2)}</span>
        <span>{fmt(max)}{spec.unit ? ` ${spec.unit}` : ''}</span>
      </div>
    </div>
  );
}
