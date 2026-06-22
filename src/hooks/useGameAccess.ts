import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import {
  getAccessibleGames,
  loadGameAccess,
  type AccountRole,
  type GameAccessState,
} from "../lib/gameAccess";
import type { GameDefinition } from "../games/catalog";

type UseGameAccessResult = GameAccessState & {
  games: GameDefinition[];
  reload: () => void;
};

export function useGameAccess(): UseGameAccessResult {
  const { user, loading: authLoading } = useAuth();
  const [state, setState] = useState<GameAccessState>({
    role: null,
    assignedGameIds: new Set(),
    studentAssignments: [],
    loading: true,
    error: "",
    assignmentsTableMissing: false,
  });
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    if (authLoading) {
      return;
    }

    let cancelled = false;

    const run = async () => {
      setState((prev) => ({ ...prev, loading: true, error: "" }));
      const next = await loadGameAccess(user);
      if (!cancelled) {
        setState(next);
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [authLoading, user, reloadToken]);

  const games = getAccessibleGames(state.role, state.assignedGameIds);

  return {
    ...state,
    games,
    loading: authLoading || state.loading,
    reload: () => setReloadToken((value) => value + 1),
  };
}

export function useCanAccessGame(
  slug: string,
  assignmentId: string | null
): {
  allowed: boolean;
  loading: boolean;
  role: AccountRole | null;
  error: string;
} {
  const { role, assignedGameIds, studentAssignments, loading, error } = useGameAccess();
  const allowed =
    role === "teacher" ||
    (role === "student" &&
      assignmentId !== null &&
      studentAssignments.some(
        (assignment) => assignment.assignmentId === assignmentId && assignment.gameId === slug
      )) ||
    (role === "student" && assignmentId === null && assignedGameIds.has(slug));

  return { allowed, loading, role, error };
}
