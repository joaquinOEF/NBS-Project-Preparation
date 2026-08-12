/**
 * Minimal ambient types for `pngjs`.
 *
 * The package ships no types and `@types/pngjs` is not installed. Scripts under
 * scripts/ already import it and get away with it because tsconfig only includes
 * client/src, shared and server — so the first server-side use (the ARVC tile
 * cutter) is what surfaced it.
 *
 * Declared locally rather than adding a dependency: node_modules here is a symlink
 * shared with the sibling checkout, so an install would reach outside this repo.
 * Only the surface actually used is described; widen it if a caller needs more.
 */
declare module 'pngjs' {
  interface PNGOptions {
    width?: number;
    height?: number;
  }

  export class PNG {
    constructor(options?: PNGOptions);
    width: number;
    height: number;
    /** RGBA, 4 bytes per pixel, row-major. */
    data: Buffer;

    static sync: {
      read(buffer: Buffer): PNG;
      write(png: PNG): Buffer;
    };
  }
}
