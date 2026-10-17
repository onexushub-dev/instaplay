import { registerWebModule, NativeModule } from 'expo';

import { ReplayCameraModuleEvents } from './ReplayCamera.types';

// ReplayCameraModule is not available on the web platform.
class ReplayCameraModule extends NativeModule<ReplayCameraModuleEvents> {}

export default registerWebModule(ReplayCameraModule, 'ReplayCameraModule');
