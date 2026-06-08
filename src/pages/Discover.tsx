import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useGameAccess } from "../hooks/useGameAccess";

export default function Discover() {
  const { user } = useAuth();
  const { games, role, loading, error, assignmentsTableMissing } = useGameAccess();

  return (
    <main className="page page-narrow">
      <p className="eyebrow">Game library</p>
      <h1>Discover</h1>
      <p className="lead">
        {user
          ? role === "teacher"
            ? "You can play any game and assign them to your classes from My Classes."
            : "You only see games your teacher has assigned to your classes."
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

      {!loading && user && role === "student" && games.length === 0 && !assignmentsTableMissing ? (
        <div className="empty-state">
          <p>No games assigned yet. Join a class and ask your teacher to assign games.</p>
          <Link to="/classes" className="button">
            My Classes
          </Link>
        </div>
      ) : null}

      {!loading && user && role === "teacher" && games.length === 0 ? (
        <p className="empty-state">No games in the catalog yet.</p>
      ) : null}

      <div className="discover-game-list">
        {games.map((game) => (
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
