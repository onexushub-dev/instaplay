import { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { remoteDeviceName, remoteSetDeviceName } from '../../modules/replay-camera';
import { colors, fonts, radius } from '../theme/tokens';

/** The name this phone shows to the other one while pairing. Starts as "iPhone XR#1234"; the person can rename it. */
export function DeviceNameField() {
  const [name, setName] = useState(() => remoteDeviceName());

  const save = () => {
    remoteSetDeviceName(name);
    // An empty name goes back to the default, so show what is really in use now.
    setName(remoteDeviceName());
  };

  return (
    <View style={styles.box}>
      <Text style={styles.label}>Nome deste celular</Text>
      <TextInput
        accessibilityLabel="Nome deste celular"
        autoCorrect={false}
        maxLength={30}
        onChangeText={setName}
        onEndEditing={save}
        onSubmitEditing={save}
        returnKeyType="done"
        style={styles.input}
        value={name}
      />
      <Text style={styles.hint}>O outro celular mostra este nome. A mudança vale na próxima conexão.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { gap: 6 },
  label: { fontFamily: fonts.bodyBold, fontSize: 12, letterSpacing: 1, color: colors.muted },
  input: {
    fontFamily: fonts.bodySemi,
    fontSize: 17,
    color: colors.text,
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    paddingHorizontal: 14,
    minHeight: 48,
  },
  hint: { fontFamily: fonts.body, fontSize: 13, color: colors.muted },
});
