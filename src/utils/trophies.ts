import { useRoomStore } from "../stores/roomStore";
import { useAuthStore } from "../stores/authStore";

/**
 * Call once per player when the winner is decided.
 * - Winner gains trophies = number of players in the room.
 * - Everyone else loses 1 trophy (min 0).
 * - Ties: pass null winnerId → everyone gets +0 trophies.
 * Returns the trophy delta for display purposes.
 */
export async function awardTrophies(winnerId: string | null, gameType: string): Promise<number> {
  const players = useRoomStore.getState().players;
  const myId = useAuthStore.getState().user?.id;
  if (!myId || players.length < 2) return 0;

  // Tie — no one wins or loses trophies
  if (!winnerId) return 0;

  const playerCount = players.length;

  if (myId === winnerId) {
    await useAuthStore.getState().addTrophies(playerCount);
    await useAuthStore.getState().recordGameWin(gameType);
    return playerCount;
  } else {
    await useAuthStore.getState().removeTrophy();
    return -1;
  }
}
