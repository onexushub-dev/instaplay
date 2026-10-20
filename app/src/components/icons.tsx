import Svg, { Circle, Path, Rect } from 'react-native-svg';

import { colors } from '../theme/tokens';

type IconProps = { color?: string; size?: number };

const stroke = (color: string) => ({
  stroke: color,
  strokeWidth: 1.8,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  fill: 'none',
});

export function PhoneIcon({ color = colors.text, size = 22 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" accessibilityElementsHidden>
      <Rect x={7} y={2} width={10} height={20} rx={2} {...stroke(color)} />
      <Path d="M4 8v8M20 8v8" {...stroke(color)} />
    </Svg>
  );
}

/** A player with both arms raised straight up: the save gesture. */
export function ArmsUpIcon({ color = colors.text, size = 22 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" accessibilityElementsHidden>
      <Circle cx={12} cy={8} r={2} {...stroke(color)} />
      <Path d="M8 2v9l4 1 4-1V2M12 12v4M9 22l3-6 3 6" {...stroke(color)} />
    </Svg>
  );
}

export function ShareIcon({ color = colors.text, size = 22 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" accessibilityElementsHidden>
      <Path d="M4 12v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7M16 6l-4-4-4 4M12 2v13" {...stroke(color)} />
    </Svg>
  );
}

export function DownloadIcon({ color = colors.text, size = 22 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" accessibilityElementsHidden>
      <Path d="M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4M8 10l4 4 4-4M12 3v11" {...stroke(color)} />
    </Svg>
  );
}

export function TrashIcon({ color = colors.text, size = 22 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" accessibilityElementsHidden>
      <Path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6" {...stroke(color)} />
    </Svg>
  );
}

export function PlayIcon({ color = colors.text, size = 22 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" accessibilityElementsHidden>
      <Path d="M8 5l11 7-11 7z" fill={color} />
    </Svg>
  );
}

export function PauseIcon({ color = colors.text, size = 22 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" accessibilityElementsHidden>
      <Path d="M8 5v14M16 5v14" {...stroke(color)} strokeWidth={3} />
    </Svg>
  );
}

export function ExpandIcon({ color = colors.text, size = 20 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" accessibilityElementsHidden>
      <Path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" {...stroke(color)} />
    </Svg>
  );
}

export function CloseIcon({ color = colors.text, size = 20 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" accessibilityElementsHidden>
      <Path d="M6 6l12 12M18 6L6 18" {...stroke(color)} strokeWidth={2} />
    </Svg>
  );
}

export function ShieldIcon({ color = colors.soft, size = 20 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" accessibilityElementsHidden>
      <Path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z" {...stroke(color)} />
    </Svg>
  );
}

export function MicIcon({ color = colors.text, size = 20 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" accessibilityElementsHidden>
      <Rect x={9} y={2} width={6} height={12} rx={3} {...stroke(color)} />
      <Path d="M5 11a7 7 0 0 0 14 0M12 18v4" {...stroke(color)} />
    </Svg>
  );
}

export function RemoteIcon({ color = colors.text, size = 20 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" accessibilityElementsHidden>
      <Path d="M7 7l10 10-5 5V2l5 5L7 17" {...stroke(color)} />
    </Svg>
  );
}

export function WatchIcon({ color = colors.text, size = 20 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" accessibilityElementsHidden>
      <Rect x={6} y={6} width={12} height={12} rx={3} {...stroke(color)} />
      <Path d="M9 6V2h6v4M9 18v4h6v-4" {...stroke(color)} />
    </Svg>
  );
}

export function TapIcon({ color = colors.text, size = 20 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" accessibilityElementsHidden>
      <Path
        d="M9 11V5a1.5 1.5 0 0 1 3 0v6M12 10V4a1.5 1.5 0 0 1 3 0v7M15 10.5a1.5 1.5 0 0 1 3 0V15a6 6 0 0 1-6 6h-1a6 6 0 0 1-5-2.7L3.5 15a1.5 1.5 0 0 1 2.5-1.7L9 16"
        {...stroke(color)}
      />
    </Svg>
  );
}

export function BackIcon({ color = colors.text, size = 20 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" accessibilityElementsHidden>
      <Path d="M15 6l-6 6 6 6" {...stroke(color)} strokeWidth={2} />
    </Svg>
  );
}

export function CheckIcon({ color = colors.onAccent, size = 72 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" accessibilityElementsHidden>
      <Path d="M5 12l5 5L20 7" {...stroke(color)} strokeWidth={2.6} />
    </Svg>
  );
}
