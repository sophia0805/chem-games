import { Link, useSearchParams } from "react-router-dom";
import { GamePlayProvider } from "../context/GamePlayContext";
import { useCanAccessGame } from "../hooks/useGameAccess";
import { useResolvedGamePlay } from "../hooks/useResolvedGamePlay";
import type { GameDefinition } from "../games/catalog";

type GameRouteGuardProps = {
  game: GameDefinition;
  children: React.ReactNode;
};

export default function GameRouteGuard({ game, children }: GameRouteGuardProps) {
  const [searchParams] = useSearchParams();
  const assignmentId = searchParams.get("assignment");
  const { allowed, loading, role, error } = useCanAccessGame(game.slug, assignmentId);
  const {
    config,
    loading: configLoading,
    error: configError,
  } = useResolvedGamePlay(game.slug, assignmentId);

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

  if (role === "student" && !assignmentId) {
    return (
      <main className="page page-narrow">
        <h1>{game.title}</h1>
        <p className="lead">Open this game from Discover and pick the assignment your teacher gave you.</p>
        <div className="actions-row">
          <Link to="/discover" className="button">
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
          This assignment is not available for your account. Ask your teacher if you think this is a
          mistake.
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
        <h1>{config.assignmentTitle ?? game.title}</h1>
        <p className="lead">
          You have used all {config.settings.maxTries} tries for this assignment. Ask your teacher if
          you need another attempt.
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
        assignmentId: config.assignmentId,
        assignmentTitle: config.assignmentTitle,
      }}
    >
      {children}
    </GamePlayProvider>
  );
}
