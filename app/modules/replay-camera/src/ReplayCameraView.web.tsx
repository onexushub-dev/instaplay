import { ReplayCameraViewProps } from './ReplayCamera.types';

// ReplayCameraView is not available on the web platform.
export default function ReplayCameraView(_props: ReplayCameraViewProps) {
  throw new Error('ReplayCameraView is not available on the web platform.');
}
