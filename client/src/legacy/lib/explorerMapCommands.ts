// ============================================================================
// SITE EXPLORER — MAP COMMANDS
// ============================================================================
// A small typed channel for driving the Site Explorer's map from outside it
// (the chat, a test). No React, no imports from the page: a command is a plain
// object on a window CustomEvent, and the explorer is the only listener.
//
//   sendExplorerMapCommand({ type: 'show_map', preset: 'heat' });
//   sendExplorerMapCommand({ type: 'pin_places', places: [...], fit: true });
//
// The reverse direction — what the map is showing right now — travels in the
// page context the explorer already publishes to the chat (`additionalInfo`,
// see ExplorerMapContext below).
//
// A command never needs the sender to know whether the map is ready. Sent while
// the explorer is mounted but still loading, the explorer holds it until the
// map is there. Sent just before the explorer mounts (a chat that navigates and
// then speaks), it waits here for up to HOLD_MS and is handed to the explorer
// when it subscribes. Older than that, it is dropped: nobody wants a map that
// moves by itself a minute later.
// ============================================================================

import type { ExplorerKeyMapId } from '@shared/explorer-key-maps';

export interface ExplorerPinnedPlace {
  /** The number drawn on the pin. */
  rank: number;
  name: string;
  lat: number;
  lng: number;
  /** Second line of the pin's tooltip, e.g. "heat: very high · 4,200 people within 300 m". */
  subtitle?: string;
}

export type ExplorerMapCommand =
  /** Turn a key map on (replacing the layers on show), or off with `null`. */
  | { type: 'show_map'; preset: ExplorerKeyMapId | null }
  /** Move the map to a point. Without `zoom`, at least zoom 14. */
  | { type: 'fly_to'; lat: number; lng: number; zoom?: number }
  /** Select a neighbourhood by name (accents and case ignored) and fit it. */
  | { type: 'focus_place'; name: string }
  /** Replace the numbered pins. `fit` (default true) frames them all. */
  | { type: 'pin_places'; places: ExplorerPinnedPlace[]; fit?: boolean }
  | { type: 'clear_pins' };

/** What the explorer adds to the chat's page context (`additionalInfo`). */
export interface ExplorerMapContext {
  activePreset: ExplorerKeyMapId | null;
  /** Every layer on show, the neighbourhood zones included. */
  activeLayerIds: string[];
  mapCenter: { lat: number; lng: number } | null;
  mapZoom: number | null;
  pinnedPlaces: Array<{ rank: number; name: string }>;
}

export const EXPLORER_MAP_COMMAND_EVENT = 'explorer-map-command';
/** Fired on window when a numbered pin is clicked; `detail` is the ExplorerPinnedPlace. */
export const EXPLORER_PIN_CLICKED_EVENT = 'explorer-pin-clicked';

const HOLD_MS = 10_000;
const HOLD_MAX = 20;
let subscribers = 0;
let held: Array<{ cmd: ExplorerMapCommand; at: number }> = [];

export function sendExplorerMapCommand(cmd: ExplorerMapCommand): void {
  if (typeof window === 'undefined') return;
  if (subscribers === 0) {
    held = [...held, { cmd, at: Date.now() }].slice(-HOLD_MAX);
    return;
  }
  window.dispatchEvent(new CustomEvent<ExplorerMapCommand>(EXPLORER_MAP_COMMAND_EVENT, { detail: cmd }));
}

/** Subscribe to commands. Returns the unsubscribe. */
export function onExplorerMapCommand(handler: (cmd: ExplorerMapCommand) => void): () => void {
  const listener = (e: Event) => {
    const cmd = (e as CustomEvent<ExplorerMapCommand>).detail;
    if (cmd && typeof cmd === 'object' && typeof cmd.type === 'string') handler(cmd);
  };
  window.addEventListener(EXPLORER_MAP_COMMAND_EVENT, listener);
  subscribers++;
  const waiting = held.filter(h => Date.now() - h.at <= HOLD_MS);
  held = [];
  waiting.forEach(h => handler(h.cmd));
  return () => {
    subscribers--;
    window.removeEventListener(EXPLORER_MAP_COMMAND_EVENT, listener);
  };
}

/** Subscribe to pin clicks. Returns the unsubscribe. */
export function onExplorerPinClicked(handler: (place: ExplorerPinnedPlace) => void): () => void {
  const listener = (e: Event) => handler((e as CustomEvent<ExplorerPinnedPlace>).detail);
  window.addEventListener(EXPLORER_PIN_CLICKED_EVENT, listener);
  return () => window.removeEventListener(EXPLORER_PIN_CLICKED_EVENT, listener);
}

// Development builds only: lets a test or the console drive the map.
//   window.__explorerMapCommand({ type: 'show_map', preset: 'flood' })
declare global {
  interface Window {
    __explorerMapCommand?: typeof sendExplorerMapCommand;
  }
}
if (import.meta.env.DEV && typeof window !== 'undefined') {
  window.__explorerMapCommand = sendExplorerMapCommand;
}
