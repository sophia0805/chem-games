import { createContext, useContext } from "react";
import type { GameAssignmentSettings } from "../games/settings";

export type GamePlayConfig = {
  settings: GameAssignmentSettings;
  attemptsUsed: number;
  canStart: boolean;
  isTeacherPreview: boolean;
  classId: string | null;
  assignmentId: string | null;
  assignmentTitle: string | null;
};

const GamePlayContext = createContext<GamePlayConfig | null>(null);

export function GamePlayProvider({
  value,
  children,
}: {
  value: GamePlayConfig;
  children: React.ReactNode;
}) {
  return <GamePlayContext.Provider value={value}>{children}</GamePlayContext.Provider>;
}

export function useGamePlayConfig(): GamePlayConfig {
  const context = useContext(GamePlayContext);
  if (!context) {
    throw new Error("useGamePlayConfig must be used within a GamePlayProvider");
  }
  return context;
}

export function useOptionalGamePlayConfig(): GamePlayConfig | null {
  return useContext(GamePlayContext);
}
