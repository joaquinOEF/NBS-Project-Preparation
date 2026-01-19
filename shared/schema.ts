// Main schema file that re-exports core schemas for backward compatibility
// This ensures existing code continues to work while we transition to modular schemas

export * from './core-schema';
export * from './workspace-schema';
export * from './block-schemas';
export * from './sample-constants';
export * from './models/chat';
