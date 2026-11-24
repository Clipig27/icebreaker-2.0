import { useRoomStore } from "../stores/roomStore";
import { useAuthStore } from "../stores/authStore";

/** Call once when the winner phase is reached. Awards trophies to winner, removes 1 from each loser. */
export async function awardTrophies(winnerId: string, gameType: string) {
  const players = useRoomStore.getState().players;
  const myId = useAuthStore.getState().user?.id;
  if (!myId || players.length < 2) return;

  const otherCount = players.length - 1;

  if (myId === winnerId) {
    // I won — gain trophies equal to other players count
    await useAuthStore.getState().addTrophies(otherCount);
    await useAuthStore.getState().recordGameWin(gameType);
  } else {
    // I lost — lose 1 trophy
    await useAuthStore.getState().removeTrophy();
  }
}
