import { BarlowCondensed_700Bold, BarlowCondensed_800ExtraBold } from '@expo-google-fonts/barlow-condensed';
import { Manrope_400Regular, Manrope_600SemiBold, Manrope_700Bold } from '@expo-google-fonts/manrope';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { AppState } from 'react-native';

import { isRemoteSupported, remoteHostStart, remoteHostStop } from '../../modules/replay-camera';
import { SessionProvider } from '../session/SessionContext';
import { colors } from '../theme/tokens';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [loaded, error] = useFonts({
    BarlowCondensed_700Bold,
    BarlowCondensed_800ExtraBold,
    Manrope_400Regular,
    Manrope_600SemiBold,
    Manrope_700Bold,
  });

  useEffect(() => {
    if (loaded || error) SplashScreen.hideAsync();
  }, [loaded, error]);

  // The camera phone answers its paired remotes for as long as the app is open, whatever screen is in front: tying it to
  // one screen dropped the link every time the player moved between the setup, the recording and the summary.
  // Coming back to the front starts the advertising over, since iOS may have dropped it while the app was away.
  useEffect(() => {
    if (!isRemoteSupported()) return;
    remoteHostStart();
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') remoteHostStart();
    });
    return () => {
      sub.remove();
      remoteHostStop();
    };
  }, []);

  if (!loaded && !error) return null;

  return (
    <SessionProvider>
      <StatusBar style="light" />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.ground } }}>
        {/* Dragging the trim handles to the right would otherwise count as the swipe back. */}
        <Stack.Screen name="clip/[id]" options={{ gestureEnabled: false }} />
      </Stack>
    </SessionProvider>
  );
}
