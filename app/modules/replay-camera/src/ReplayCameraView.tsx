import { requireNativeView } from 'expo';
import * as React from 'react';

import { ReplayCameraViewProps } from './ReplayCamera.types';

const NativeView: React.ComponentType<ReplayCameraViewProps> = requireNativeView('ReplayCamera');

export default function ReplayCameraView(props: ReplayCameraViewProps) {
  return <NativeView {...props} />;
}
