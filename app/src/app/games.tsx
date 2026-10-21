import { router } from "expo-router";
import { useMemo, useSyncExternalStore } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Button } from "../components/Button";
import { GameCard } from "../components/GameCard";
import { BackIcon } from "../components/icons";
import { repo } from "../data/mmkv";
import { payments } from "../payments";
import { useT } from "../i18n/useT";
import { colors, fonts } from "../theme/tokens";

/** Past games with at least one lance, newest first. */
export default function Games() {
  const { t } = useT();
  const version = useSyncExternalStore(repo.subscribe, repo.version);
  const paymentsVersion = useSyncExternalStore(
    payments.subscribe,
    payments.version,
  );
  const games = useMemo(
    () =>
      repo.listSessions().map((g) => ({
        ...g,
        recordedMs: repo.sessionStats(g.session.id).recordedMs,
        lockedClips:
          payments.tierFor(g.session.id) === "free"
            ? repo.lockedCount(g.session.id)
            : 0,
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- versions are the change signals
    [version, paymentsVersion],
  );

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.top}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("common.back")}
          onPress={() => router.back()}
          style={styles.back}
        >
          <BackIcon />
        </Pressable>
      </View>
      <Text style={styles.title} accessibilityRole="header">
        {t("games.title")}
      </Text>
      <FlatList
        data={games}
        keyExtractor={(g) => g.session.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <Text style={styles.empty}>{t("games.empty")}</Text>
        }
        renderItem={({ item }) => (
          <GameCard
            session={item.session}
            clips={item.clips}
            firstClip={item.firstClip}
            recordedMs={item.recordedMs}
            lockedClips={item.lockedClips}
            onPress={() => router.push(`/session/${item.session.id}`)}
          />
        )}
      />
      <View style={styles.footer}>
        <Button
          label={t("games.restore")}
          variant="secondary"
          onPress={() => void payments.restore()}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.ground,
    paddingHorizontal: 20,
    gap: 12,
  },
  top: { flexDirection: "row", marginTop: 8 },
  back: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  title: { fontFamily: fonts.displayBold, fontSize: 44, color: colors.text },
  list: { gap: 10, paddingBottom: 24 },
  footer: { paddingBottom: 12 },
  empty: {
    fontFamily: fonts.body,
    fontSize: 15,
    color: colors.soft,
    textAlign: "center",
    marginTop: 40,
  },
});
