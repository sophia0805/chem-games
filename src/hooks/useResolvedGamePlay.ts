import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { resolveGamePlayConfig, type GamePlayResolution } from "../lib/gameAccess";

export function useResolvedGamePlay(gameId: string, assignmentId: string | null) {
  const { user, loading: authLoading } = useAuth();
  const [state, setState] = useState<{
    config: GamePlayResolution | null;
    loading: boolean;
    error: string;
  }>({
    config: null,
    loading: true,
    error: "",
  });

  useEffect(() => {
    if (authLoading) {
      return;
    }

    if (!user) {
      setState({ config: null, loading: false, error: "" });
      return;
    }

    let cancelled = false;

    const run = async () => {
      setState({ config: null, loading: true, error: "" });
      try {
        const config = await resolveGamePlayConfig(user, gameId, assignmentId);
        if (!cancelled) {
          setState({ config, loading: false, error: "" });
        }
      } catch (err: unknown) {
        if (!cancelled) {
          const message = err instanceof Error ? err.message : "Could not load game settings";
          setState({ config: null, loading: false, error: message });
        }
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [authLoading, user, gameId, assignmentId]);

  return {
    ...state,
    loading: authLoading || state.loading,
  };
}
