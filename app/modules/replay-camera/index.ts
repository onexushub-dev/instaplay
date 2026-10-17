// Re-export the native module. On web, it will be resolved to ReplayCameraModule.web.ts
// and on native platforms to ReplayCameraModule.ts
export { default } from './src/ReplayCameraModule';
export { default as ReplayCameraView } from './src/ReplayCameraView';
export * from './src/ReplayCamera.types';
