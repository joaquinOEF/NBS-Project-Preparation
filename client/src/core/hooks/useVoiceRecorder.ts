import { useCallback, useEffect, useRef, useState } from 'react';

// Voice-note recorder for the chat composer. Tap-to-start / tap-to-stop (NOT
// hold-to-record): the audience is phone-first community orgs giving longer
// spoken answers, and a toggle is easier to reach + more accessible than a
// press-and-hold. On stop we POST the clip to /api/cbo/:id/transcribe (the
// existing Replit AI transcription path) and hand the text back via onTranscript
// — which the page drops into the input box for the user to REVIEW before
// sending. The agent never receives audio, only the confirmed text.

export type RecorderStatus = 'idle' | 'recording' | 'transcribing';
export type RecorderError = 'permission' | 'unsupported' | 'transcribe' | 'empty' | 'mic';

interface Options {
  cboId: string | null;
  lang?: string;
  onTranscript: (text: string) => void;
  onError?: (kind: RecorderError, message?: string) => void;
}

// `audio/mp4` is what iOS Safari emits; webm/opus is everyone else. Pick the
// first the browser actually supports so the blob has a usable container.
function pickMimeType(): string | undefined {
  if (typeof MediaRecorder === 'undefined') return undefined;
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];
  for (const c of candidates) {
    try { if (MediaRecorder.isTypeSupported(c)) return c; } catch { /* older Safari throws */ }
  }
  return undefined; // let the browser choose its default
}

function extFor(mime: string): string {
  if (mime.includes('mp4')) return 'm4a';
  if (mime.includes('ogg')) return 'ogg';
  return 'webm';
}

export function useVoiceRecorder({ cboId, lang, onTranscript, onError }: Options) {
  const [status, setStatus] = useState<RecorderStatus>('idle');
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  const supported = typeof navigator !== 'undefined'
    && !!navigator.mediaDevices?.getUserMedia
    && typeof MediaRecorder !== 'undefined';

  const cleanupStream = useCallback(() => {
    streamRef.current?.getTracks().forEach(tr => tr.stop());
    streamRef.current = null;
  }, []);

  const transcribe = useCallback(async (blob: Blob, mime: string) => {
    if (!cboId) { setStatus('idle'); return; }
    if (blob.size < 1200) { setStatus('idle'); onError?.('empty'); return; }
    setStatus('transcribing');
    try {
      const fd = new FormData();
      fd.append('audio', blob, `voice.${extFor(mime)}`);
      if (lang) fd.append('lang', lang);
      const res = await fetch(`/api/cbo/${cboId}/transcribe`, { method: 'POST', body: fd });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        onError?.('transcribe', data?.fix || data?.error);
        return;
      }
      const data = await res.json();
      const text = (data?.text || '').trim();
      if (text) onTranscript(text); else onError?.('empty');
    } catch (e: any) {
      onError?.('transcribe', e?.message);
    } finally {
      setStatus('idle');
    }
  }, [cboId, lang, onTranscript, onError]);

  const start = useCallback(async () => {
    if (!supported) { onError?.('unsupported'); return; }
    if (status !== 'idle') return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mimeType = pickMimeType();
      const rec = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      const usedMime = rec.mimeType || mimeType || 'audio/webm';
      chunksRef.current = [];
      rec.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      rec.onstop = () => {
        cleanupStream();
        const blob = new Blob(chunksRef.current, { type: usedMime });
        chunksRef.current = [];
        transcribe(blob, usedMime);
      };
      rec.onerror = () => { cleanupStream(); setStatus('idle'); onError?.('mic'); };
      recorderRef.current = rec;
      rec.start();
      setStatus('recording');
    } catch (e: any) {
      cleanupStream();
      setStatus('idle');
      // getUserMedia rejects with NotAllowedError when the user denies the mic.
      onError?.(e?.name === 'NotAllowedError' || e?.name === 'SecurityError' ? 'permission' : 'mic', e?.message);
    }
  }, [supported, status, transcribe, cleanupStream, onError]);

  const stop = useCallback(() => {
    const rec = recorderRef.current;
    if (rec && rec.state !== 'inactive') rec.stop();
    recorderRef.current = null;
  }, []);

  const toggle = useCallback(() => {
    if (status === 'recording') stop(); else if (status === 'idle') start();
  }, [status, start, stop]);

  // Stop the mic if the component unmounts mid-recording.
  useEffect(() => () => {
    try { recorderRef.current?.stop(); } catch { /* noop */ }
    cleanupStream();
  }, [cleanupStream]);

  return { status, supported, start, stop, toggle };
}
