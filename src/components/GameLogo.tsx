import { Image, StyleSheet, type ImageSourcePropType } from "react-native";

const GAME_LOGOS: Record<string, ImageSourcePropType> = {
  talentShow: require("../../assets/game-logos/talent-show.png"),
  numberGuessor: require("../../assets/game-logos/one-to-hundred.png"),
  pieCharts: require("../../assets/game-logos/pie-charts.png"),
  potLuck: require("../../assets/game-logos/smarty-pot.png"),
  blindRanking: require("../../assets/game-logos/blind-ranking.png"),
  tenSecondTasks: require("../../assets/game-logos/ten-second-tasks.png"),
  auctionDraft: require("../../assets/game-logos/bid-wars.png"),
};

const GAME_LOGO_ASPECT: Record<string, number> = {
  talentShow: 2.0859,
  numberGuessor: 2.0859,
  pieCharts: 2.1328,
  potLuck: 2.0078,
  blindRanking: 1.9766,
  tenSecondTasks: 1.9844,
  auctionDraft: 1.7469,
};

interface GameLogoProps {
  gameId: string;
  height?: number;
}

/** Renders the transparent PNG logo for a game at the given height. */
export default function GameLogo({ gameId, height = 28 }: GameLogoProps) {
  const src = GAME_LOGOS[gameId];
  if (!src) return null;
  const aspect = GAME_LOGO_ASPECT[gameId] ?? 2;
  return (
    <Image
      source={src}
      style={{ height, width: height * aspect }}
      resizeMode="contain"
    />
  );
}

export { GAME_LOGOS, GAME_LOGO_ASPECT };
