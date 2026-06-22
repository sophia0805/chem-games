import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useGameAccess } from "../hooks/useGameAccess";
import {
  StudentAssignmentProgressSummary,
  useStudentAssignmentProgress,
} from "../components/StudentAssignmentScores";
import { formatAssignmentSummary } from "../lib/gameAccess";

export default function Discover() {
  const { user } = useAuth();
  const { games, role, studentAssignments, loading, error, assignmentsTableMissing } =
    useGameAccess();
  const { progressById } = useStudentAssignmentProgress(
    role === "student" ? user?.id : undefined,
    studentAssignments
  );

  return (
    <main className="page page-narrow">
      <p className="eyebrow">Game library</p>
      <h1>Discover</h1>
      <p className="lead">
        {user
          ? role === "teacher"
            ? "You can play any game and assign them to your classes from My Classes."
            : "Each card is a separate assignment from your teacher, with its own settings, try limit, and scores."
          : "Sign in to see your games."}
      </p>

      {loading ? <p>Loading games...</p> : null}
      {error ? <p className="error">{error}</p> : null}
      {assignmentsTableMissing && role === "student" ? (
        <p className="error">
          Game assignments are not set up yet. Ask your teacher to run the SQL in SUPABASE_SETUP.md.
        </p>
      ) : null}

      {!loading && !user ? (
        <div className="empty-state">
          <p>
            <Link to="/login">Log in</Link> to see games assigned to you, or sign up for a new
            account.
          </p>
        </div>
      ) : null}

      {!loading && user && role === "student" && studentAssignments.length === 0 && !assignmentsTableMissing ? (
        <div className="empty-state">
          <p>No assignments yet. Join a class and ask your teacher to assign games.</p>
          <Link to="/classes" className="button">
            My Classes
          </Link>
        </div>
      ) : null}

      {!loading && user && role === "teacher" && games.length === 0 ? (
        <p className="empty-state">No games in the catalog yet.</p>
      ) : null}

      <div className="discover-game-list">
        {role === "student"
          ? studentAssignments.map((assignment) => {
              const game = games.find((entry) => entry.slug === assignment.gameId);
              if (!game) {
                return null;
              }

              const progress = progressById.get(assignment.assignmentId);

              return (
                <Link
                  key={assignment.assignmentId}
                  to={`${game.route}?assignment=${assignment.assignmentId}`}
                  className="discover-game discover-game-link"
                >
                  {game.tag ? <p className="discover-game-tag">{game.tag}</p> : null}
                  <h2>{assignment.title}</h2>
                  <p>{game.description}</p>
                  <p className="discover-game-count">
                    {formatAssignmentSummary(assignment.settings)}
                  </p>
                  <StudentAssignmentProgressSummary
                    assignment={assignment}
                    progress={progress}
                  />
                </Link>
              );
            })
          : games.map((game) => (
              <Link key={game.slug} to={game.route} className="discover-game discover-game-link">
                {game.tag ? <p className="discover-game-tag">{game.tag}</p> : null}
                <h2>{game.title}</h2>
                <p>{game.description}</p>
                {game.meta ? <p className="discover-game-count">{game.meta}</p> : null}
              </Link>
            ))}
      </div>
    </main>
  );
}
