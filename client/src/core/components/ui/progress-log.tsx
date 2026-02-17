import { useRef, useEffect } from 'react';
import { CheckCircle2, Circle, AlertCircle, Loader2 } from 'lucide-react';

export interface ProgressEntry {
  stepId?: string;
  step: string;
  detail?: string;
  status?: 'start' | 'done' | 'info' | 'error';
  timestamp: number;
}

export function mergeProgressEntry(prev: ProgressEntry[], entry: ProgressEntry): ProgressEntry[] {
  if (entry.status === 'done' || entry.status === 'error') {
    const matchIdx = entry.stepId
      ? prev.findIndex(e => e.stepId === entry.stepId && e.status === 'start')
      : prev.findIndex(e => e.step === entry.step && e.status === 'start');
    if (matchIdx !== -1) {
      const updated = [...prev];
      updated[matchIdx] = { ...entry };
      return updated;
    }
  }
  return [...prev, entry];
}

interface ProgressLogProps {
  entries: ProgressEntry[];
  maxVisible?: number;
  className?: string;
}

function StatusIcon({ status }: { status?: string }) {
  switch (status) {
    case 'start':
      return <Loader2 className="h-3.5 w-3.5 text-amber-500 animate-spin flex-shrink-0" />;
    case 'done':
      return <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 flex-shrink-0" />;
    case 'error':
      return <AlertCircle className="h-3.5 w-3.5 text-red-500 flex-shrink-0" />;
    case 'info':
    default:
      return <Circle className="h-3.5 w-3.5 text-slate-400 flex-shrink-0" />;
  }
}

export function ProgressLog({ entries, maxVisible = 8, className = '' }: ProgressLogProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [entries.length]);

  if (entries.length === 0) return null;

  const visible = entries.slice(-maxVisible);

  return (
    <div className={`rounded-lg border border-slate-200 bg-slate-50/80 backdrop-blur-sm overflow-hidden ${className}`}>
      <div ref={scrollRef} className="max-h-48 overflow-y-auto px-3 py-2 space-y-1">
        {visible.map((entry, i) => {
          const isLatest = i === visible.length - 1;
          return (
            <div
              key={`${entry.timestamp}-${i}`}
              className={`flex items-start gap-2 text-xs transition-opacity duration-300 ${
                isLatest ? 'opacity-100' : 'opacity-70'
              }`}
              style={{ animation: isLatest ? 'fadeSlideIn 0.3s ease-out' : undefined }}
            >
              <div className="mt-0.5">
                <StatusIcon status={entry.status} />
              </div>
              <div className="min-w-0 flex-1">
                <span className={`font-medium ${
                  entry.status === 'error' ? 'text-red-700' :
                  entry.status === 'done' ? 'text-slate-700' :
                  entry.status === 'start' ? 'text-amber-700' :
                  'text-slate-600'
                }`}>
                  {entry.step}
                </span>
                {entry.detail && (
                  <span className="text-slate-400 ml-1.5 truncate block">
                    {entry.detail}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <style>{`
        @keyframes fadeSlideIn {
          from { opacity: 0; transform: translateY(4px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
