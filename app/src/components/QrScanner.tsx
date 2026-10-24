import { CameraView, useCameraPermissions } from 'expo-camera';
import { Linking, StyleSheet, Text, View } from 'react-native';

import { useT } from '../i18n/useT';
import { colors, fonts, radius } from '../theme/tokens';
import { Button } from './Button';

type Props = {
  /** Called with the text of every QR code seen; the caller decides what it is and when to stop looking. */
  onCode: (text: string) => void;
  /** False pauses the camera (while connecting, say). */
  active?: boolean;
};

/** A square window onto the camera that reads QR codes, so pairing does not need another app. */
export function QrScanner({ onCode, active = true }: Props) {
  const { t } = useT();
  const [permission, requestPermission] = useCameraPermissions();

  if (permission === null) return <View style={styles.box} />;

  if (!permission.granted) {
    return (
      <View style={[styles.box, styles.ask]}>
        <Text style={styles.askText}>{t('remote.qrAsk')}</Text>
        {permission.canAskAgain ? (
          <Button label={t('remote.qrAllow')} onPress={() => void requestPermission()} />
        ) : (
          <Button label={t('common.openSettings')} onPress={() => void Linking.openSettings()} />
        )}
      </View>
    );
  }

  return (
    <View style={styles.box}>
      {active ? (
        <CameraView
          accessibilityLabel={t('remote.qrCameraLabel')}
          barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
          facing="back"
          onBarcodeScanned={(e) => onCode(e.data)}
          style={StyleSheet.absoluteFill}
        />
      ) : null}
      <View pointerEvents="none" style={styles.frame} />
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    alignSelf: 'center',
    width: '100%',
    maxWidth: 320,
    aspectRatio: 1,
    borderRadius: radius.card,
    overflow: 'hidden',
    backgroundColor: colors.surface,
  },
  frame: {
    position: 'absolute',
    top: 24,
    bottom: 24,
    left: 24,
    right: 24,
    borderWidth: 3,
    borderColor: colors.accent,
    borderRadius: 16,
  },
  ask: { alignItems: 'center', justifyContent: 'center', padding: 20, gap: 14 },
  askText: { fontFamily: fonts.bodySemi, fontSize: 16, lineHeight: 23, color: colors.text, textAlign: 'center' },
});
