import { Link } from "react-router-dom";
import { GamePlayProvider } from "../context/GamePlayContext";
import { useCanAccessGame } from "../hooks/useGameAccess";
import { useResolvedGamePlay } from "../hooks/useResolvedGamePlay";
import type { GameDefinition } from "../games/catalog";

type GameRouteGuardProps = {
  game: GameDefinition;
  children: React.ReactNode;
};

export default function GameRouteGuard({ game, children }: GameRouteGuardProps) {
  const { allowed, loading, role, error } = useCanAccessGame(game.slug);
  const {
    config,
    loading: configLoading,
    error: configError,
  } = useResolvedGamePlay(game.slug);

  if (loading || configLoading) {
    return (
      <main className="page page-narrow">
        <p>Loading game...</p>
      </main>
    );
  }

  if (error || configError) {
    return (
      <main className="page page-narrow">
        <p className="error">{error || configError}</p>
        <Link to="/discover" className="button">
          Back to Discover
        </Link>
      </main>
    );
  }

  if (!role) {
    return (
      <main className="page page-narrow">
        <h1>{game.title}</h1>
        <p className="lead">Sign in to play assigned games.</p>
        <div className="actions-row">
          <Link to="/login" className="button">
            Log in
          </Link>
          <Link to="/discover" className="button button-secondary">
            Back to Discover
          </Link>
        </div>
      </main>
    );
  }

  if (!allowed) {
    return (
      <main className="page page-narrow">
        <h1>{game.title}</h1>
        <p className="lead">
          This game has not been assigned to your class yet. Ask your teacher to assign it from My
          Classes.
        </p>
        <div className="actions-row">
          <Link to="/discover" className="button">
            Back to Discover
          </Link>
          <Link to="/classes" className="button button-secondary">
            My Classes
          </Link>
        </div>
      </main>
    );
  }

  if (!config) {
    return (
      <main className="page page-narrow">
        <p className="error">Could not load game settings.</p>
        <Link to="/discover" className="button">
          Back to Discover
        </Link>
      </main>
    );
  }

  if (!config.canStart) {
    return (
      <main className="page page-narrow">
        <h1>{game.title}</h1>
        <p className="lead">
          You have used all {config.settings.maxTries} tries for this game. Ask your teacher if you
          need another attempt.
        </p>
        <div className="actions-row">
          <Link to="/discover" className="button">
            Back to Discover
          </Link>
        </div>
      </main>
    );
  }

  return (
    <GamePlayProvider
      value={{
        settings: config.settings,
        attemptsUsed: config.attemptsUsed,
        canStart: config.canStart,
        isTeacherPreview: config.isTeacherPreview,
        classId: config.classId,
      }}
    >
      {children}
    </GamePlayProvider>
  );
}
