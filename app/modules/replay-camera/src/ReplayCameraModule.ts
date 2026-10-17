import { NativeModule, requireNativeModule } from 'expo';

import { ReplayCameraModuleEvents } from './ReplayCamera.types';

declare class ReplayCameraModule extends NativeModule<ReplayCameraModuleEvents> {
  setValueAsync(value: string): Promise<void>;
}

export default requireNativeModule<ReplayCameraModule>('ReplayCamera');
