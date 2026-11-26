import { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
  RefreshControl,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useAuthStore } from "../../src/stores/authStore";
import { supabase } from "../../src/lib/supabase";
import { colors, fonts, radii } from "../../src/theme";
import AppHeader from "../../src/components/AppHeader";
import ScreenBackground from "../../src/components/ScreenBackground";
import GradientCard from "../../src/components/GradientCard";
import PlayerAvatar from "../../src/components/PlayerAvatar";

/*
 * Friends table schema (create in Supabase when ready):
 * ---------------------------------------------------------
 * create table friends (
 *   id uuid default gen_random_uuid() primary key,
 *   user_id uuid references users(id) not null,
 *   friend_id uuid references users(id) not null,
 *   created_at timestamptz default now(),
 *   unique(user_id, friend_id)
 * );
 * create index on friends(user_id);
 * create index on friends(friend_id);
 * ---------------------------------------------------------
 */

interface FriendRow {
  id: string;
  friendUserId: string;
  username: string;
  avatarUrl: string | null;
  lastSeen: string | null;
}

interface SearchResult {
  id: string;
  username: string;
  avatarUrl: string | null;
}

export default function Social() {
  const user = useAuthStore((s) => s.user);
  const currentUsername = useAuthStore((s) => s.username);

  const [friends, setFriends] = useState<FriendRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [tableExists, setTableExists] = useState(true);

  // Search
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [friendIds, setFriendIds] = useState<Set<string>>(new Set());

  // Load friends list
  const loadFriends = useCallback(async () => {
    if (!user) return;
    try {
      // Query friends where current user is user_id, join with users table
      const { data, error } = await supabase
        .from("friends")
        .select("id, friend_id, users:friend_id(id, username, avatar_url, last_seen)")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (error) {
        // Table doesn't exist yet
        if (error.code === "42P01" || error.message?.includes("does not exist") || error.message?.includes("relation")) {
          setTableExists(false);
        }
        console.warn("[social] loadFriends failed:", error.message);
        setFriends([]);
        return;
      }

      setTableExists(true);
      const rows: FriendRow[] = (data ?? []).map((row: any) => ({
        id: row.id,
        friendUserId: row.users?.id ?? row.friend_id,
        username: row.users?.username ?? "Unknown",
        avatarUrl: row.users?.avatar_url ?? null,
        lastSeen: row.users?.last_seen ?? null,
      }));
      setFriends(rows);
      setFriendIds(new Set(rows.map((r) => r.friendUserId)));
    } catch (e: any) {
      console.warn("[social] loadFriends error:", e.message);
      setFriends([]);
    }
  }, [user]);

  useEffect(() => {
    loadFriends().finally(() => setLoading(false));
  }, [loadFriends]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadFriends();
    setRefreshing(false);
  }, [loadFriends]);

  // Search for users
  const handleSearch = useCallback(async (query: string) => {
    setSearchQuery(query);
    if (query.trim().length < 2) {
      setSearchResults([]);
      return;
    }
    setSearching(true);
    try {
      const { data, error } = await supabase
        .from("users")
        .select("id, username, avatar_url")
        .ilike("username_lower", `%${query.toLowerCase()}%`)
        .neq("id", user?.id ?? "")
        .limit(10);

      if (error) {
        console.warn("[social] search failed:", error.message);
        setSearchResults([]);
      } else {
        setSearchResults(
          (data ?? []).map((u: any) => ({
            id: u.id,
            username: u.username,
            avatarUrl: u.avatar_url ?? null,
          }))
        );
      }
    } catch (e: any) {
      console.warn("[social] search error:", e.message);
    } finally {
      setSearching(false);
    }
  }, [user]);

  // Add friend
  const addFriend = useCallback(async (friendId: string) => {
    if (!user) return;
    try {
      const { error } = await supabase
        .from("friends")
        .insert({ user_id: user.id, friend_id: friendId });

      if (error) {
        if (error.code === "42P01" || error.message?.includes("does not exist")) {
          Alert.alert("Not ready yet", "The friends feature needs the database table to be created first.");
          setTableExists(false);
          return;
        }
        if (error.code === "23505") {
          // Already friends
          return;
        }
        console.warn("[social] addFriend failed:", error.message);
        Alert.alert("Error", "Could not add friend. Try again later.");
        return;
      }
      // Refresh list
      await loadFriends();
    } catch (e: any) {
      console.warn("[social] addFriend error:", e.message);
    }
  }, [user, loadFriends]);

  // Remove friend
  const removeFriend = useCallback(async (friendshipId: string) => {
    if (!user) return;
    Alert.alert("Remove Friend", "Are you sure you want to remove this friend?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: async () => {
          try {
            const { error } = await supabase
              .from("friends")
              .delete()
              .eq("id", friendshipId);

            if (error) {
              console.warn("[social] removeFriend failed:", error.message);
              return;
            }
            await loadFriends();
          } catch (e: any) {
            console.warn("[social] removeFriend error:", e.message);
          }
        },
      },
    ]);
  }, [user, loadFriends]);

  // Check if a user was online in the last 5 minutes
  const isOnline = (lastSeen: string | null): boolean => {
    if (!lastSeen) return false;
    const diff = Date.now() - new Date(lastSeen).getTime();
    return diff < 5 * 60 * 1000;
  };

  return (
    <SafeAreaView style={s.safe} edges={["top"]}>
      <ScreenBackground />
      <ScrollView
        style={s.scroll}
        contentContainerStyle={s.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.lavender}
          />
        }
        keyboardShouldPersistTaps="handled"
      >
        <AppHeader />

        <Text style={s.heading}>Friends</Text>
        <Text style={s.subtitle}>Get your friends, break the ice!</Text>

        {/* Search bar */}
        <View style={s.searchBar}>
          <Ionicons name="search" size={18} color={colors.gray500} />
          <TextInput
            style={s.searchInput}
            placeholder="Search by username..."
            placeholderTextColor={colors.gray500}
            value={searchQuery}
            onChangeText={handleSearch}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
          />
          {searchQuery.length > 0 && (
            <Pressable onPress={() => { setSearchQuery(""); setSearchResults([]); }}>
              <Ionicons name="close-circle" size={18} color={colors.gray500} />
            </Pressable>
          )}
        </View>

        {/* Search results */}
        {searchQuery.length >= 2 && (
          <View style={s.section}>
            {searching ? (
              <ActivityIndicator color={colors.lavender} style={{ marginVertical: 16 }} />
            ) : searchResults.length === 0 ? (
              <Text style={s.emptyText}>No players found</Text>
            ) : (
              searchResults.map((result) => {
                const alreadyFriend = friendIds.has(result.id);
                return (
                  <GradientCard
                    key={result.id}
                    radius={radii.lg}
                    style={s.friendCard}
                    contentStyle={s.friendCardContent}
                  >
                    <PlayerAvatar
                      username={result.username}
                      size={40}
                      avatarUrl={result.avatarUrl}
                    />
                    <View style={s.friendInfo}>
                      <Text style={s.friendName} numberOfLines={1}>
                        {result.username}
                      </Text>
                    </View>
                    {alreadyFriend ? (
                      <View style={s.addedBadge}>
                        <Ionicons name="checkmark" size={14} color={colors.joinedGreen} />
                        <Text style={s.addedText}>Added</Text>
                      </View>
                    ) : (
                      <Pressable
                        style={({ pressed }) => [s.addBtn, pressed && { opacity: 0.7 }]}
                        onPress={() => addFriend(result.id)}
                      >
                        <Ionicons name="person-add" size={14} color={colors.onLavender} />
                        <Text style={s.addBtnText}>Add</Text>
                      </Pressable>
                    )}
                  </GradientCard>
                );
              })
            )}
          </View>
        )}

        {/* Friends list */}
        {!tableExists ? (
          <View style={s.centerEmpty}>
            <View style={s.emptyIconWrap}>
              <Ionicons name="construct-outline" size={48} color={colors.gray500} />
            </View>
            <Text style={s.emptyTitle}>Coming Soon</Text>
            <Text style={s.emptyDesc}>The friends database table needs to be created first. Search still works!</Text>
          </View>
        ) : loading ? (
          <ActivityIndicator color={colors.lavender} style={{ marginTop: 40 }} size="large" />
        ) : (
          <View style={s.section}>
            <Text style={s.sectionLabel}>
              YOUR FRIENDS {friends.length > 0 ? `(${friends.length})` : ""}
            </Text>
            {friends.length === 0 ? (
              <View style={s.centerEmpty}>
                <View style={s.emptyIconWrap}>
                  <Ionicons name="people-outline" size={48} color={colors.gray500} />
                </View>
                <Text style={s.emptyTitle}>No friends yet</Text>
                <Text style={s.emptyDesc}>Search for players above to add your first friend.</Text>
              </View>
            ) : (
              friends.map((friend) => {
                const online = isOnline(friend.lastSeen);
                return (
                  <GradientCard
                    key={friend.id}
                    radius={radii.lg}
                    style={s.friendCard}
                    contentStyle={s.friendCardContent}
                  >
                    <View style={s.avatarWrap}>
                      <PlayerAvatar
                        username={friend.username}
                        size={44}
                        avatarUrl={friend.avatarUrl}
                      />
                      {online && <View style={s.onlineDot} />}
                    </View>
                    <View style={s.friendInfo}>
                      <Text style={s.friendName} numberOfLines={1}>
                        {friend.username}
                      </Text>
                      <Text style={s.friendStatus}>
                        {online ? "Online" : "Offline"}
                      </Text>
                    </View>
                    <Pressable
                      style={({ pressed }) => [s.removeBtn, pressed && { opacity: 0.7 }]}
                      onPress={() => removeFriend(friend.id)}
                      hitSlop={8}
                    >
                      <Ionicons name="close" size={16} color={colors.gray400} />
                    </Pressable>
                  </GradientCard>
                );
              })
            )}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bgPurple },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 24, paddingBottom: 40 },

  heading: {
    fontFamily: fonts.extrabold,
    fontSize: 34,
    color: colors.white,
    letterSpacing: -0.6,
    marginBottom: 6,
  },
  subtitle: {
    fontFamily: fonts.regular,
    fontSize: 15,
    color: colors.gray400,
    marginBottom: 22,
  },

  // Search
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: colors.cardFill,
    borderWidth: 1,
    borderColor: colors.cardEdge,
    borderRadius: radii.lg,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginBottom: 20,
  },
  searchInput: {
    flex: 1,
    fontFamily: fonts.medium,
    fontSize: 15,
    color: colors.white,
    padding: 0,
  },

  // Sections
  section: { marginBottom: 16 },
  sectionLabel: {
    fontFamily: fonts.bold,
    fontSize: 11,
    letterSpacing: 1.5,
    textTransform: "uppercase",
    color: colors.gray400,
    marginBottom: 12,
  },

  // Friend card
  friendCard: { marginBottom: 8 },
  friendCardContent: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    gap: 12,
  },
  avatarWrap: { position: "relative" },
  onlineDot: {
    position: "absolute",
    bottom: 0,
    right: -1,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: colors.joinedGreen,
    borderWidth: 2.5,
    borderColor: colors.card,
  },
  friendInfo: { flex: 1 },
  friendName: {
    fontFamily: fonts.semibold,
    fontSize: 16,
    color: colors.white,
  },
  friendStatus: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.gray500,
    marginTop: 2,
  },

  // Add button
  addBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: colors.lavender,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
  },
  addBtnText: {
    fontFamily: fonts.bold,
    fontSize: 13,
    color: colors.onLavender,
  },
  addedBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  addedText: {
    fontFamily: fonts.medium,
    fontSize: 13,
    color: colors.joinedGreen,
  },

  // Remove button
  removeBtn: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: colors.cardRaised,
    borderWidth: 1,
    borderColor: colors.cardEdge,
    alignItems: "center",
    justifyContent: "center",
  },

  // Empty states
  emptyText: {
    fontFamily: fonts.regular,
    fontSize: 14,
    color: colors.gray500,
    textAlign: "center",
    paddingVertical: 16,
  },
  centerEmpty: {
    alignItems: "center",
    paddingTop: 40,
    paddingBottom: 20,
  },
  emptyIconWrap: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: colors.cardFill,
    borderWidth: 1,
    borderColor: colors.cardEdge,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  emptyTitle: {
    fontFamily: fonts.semibold,
    fontSize: 18,
    color: colors.white,
    marginBottom: 6,
  },
  emptyDesc: {
    fontFamily: fonts.regular,
    fontSize: 14,
    color: colors.gray400,
    textAlign: "center",
    maxWidth: 260,
  },
});
