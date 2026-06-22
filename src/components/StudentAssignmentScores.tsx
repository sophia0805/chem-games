import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { GAME_CATALOG } from "../games/catalog";
import {
  fetchStudentAssignmentProgress,
  formatStudentTriesLabel,
  type StudentAssignmentProgress,
  type StudentGameAssignment,
} from "../lib/gameAccess";

type StudentAssignmentScoresProps = {
  assignments: StudentGameAssignment[];
  userId: string;
};

function formatAttemptDate(iso: string): string {
  if (!iso) {
    return "";
  }
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

function gameRouteForId(gameId: string): string | null {
  return GAME_CATALOG.find((game) => game.slug === gameId)?.route ?? null;
}

export function useStudentAssignmentProgress(
  userId: string | undefined,
  assignments: StudentGameAssignment[]
) {
  const assignmentKey = useMemo(
    () => assignments.map((assignment) => assignment.assignmentId).join(","),
    [assignments]
  );
  const [progressById, setProgressById] = useState<Map<string, StudentAssignmentProgress>>(
    new Map()
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!userId || assignments.length === 0) {
      setProgressById(new Map());
      setError("");
      setLoading(false);
      return;
    }

    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError("");

      try {
        const rows = await fetchStudentAssignmentProgress(userId, assignments);
        if (!cancelled) {
          setProgressById(new Map(rows.map((row) => [row.assignmentId, row])));
        }
      } catch (err: unknown) {
        if (!cancelled) {
          const message = err instanceof Error ? err.message : "Could not load your scores";
          setError(message);
          setProgressById(new Map());
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [userId, assignmentKey, assignments]);

  return { progressById, loading, error };
}

export function StudentAssignmentProgressSummary({
  assignment,
  progress,
}: {
  assignment: StudentGameAssignment;
  progress: StudentAssignmentProgress | undefined;
}) {
  if (!progress || progress.tryCount === 0) {
    return <p className="student-scores-empty">No attempts yet</p>;
  }

  return (
    <div className="student-scores-summary">
      <span>Tries: {formatStudentTriesLabel(progress.tryCount, assignment.settings.maxTries)}</span>
      <span>
        Best: {progress.bestScore}/{progress.bestTotal}
      </span>
      <span>
        Latest: {progress.latestScore}/{progress.latestTotal}
        {progress.latestAt ? ` (${formatAttemptDate(progress.latestAt)})` : ""}
      </span>
    </div>
  );
}

export default function StudentAssignmentScores({
  assignments,
  userId,
}: StudentAssignmentScoresProps) {
  const { progressById, loading, error } = useStudentAssignmentProgress(userId, assignments);

  if (assignments.length === 0) {
    return null;
  }

  return (
    <div className="student-scores">
      <h4 className="class-roster-title">Your scores</h4>
      <p className="class-assignments-hint">Tries and scores for each assignment in this class.</p>
      {loading ? <p className="class-assignments-hint">Loading your scores...</p> : null}
      {error ? <p className="error">{error}</p> : null}
      {!loading && !error ? (
        <div className="class-scores-table-wrap">
          <table className="class-scores-table student-scores-table">
            <thead>
              <tr>
                <th scope="col">Assignment</th>
                <th scope="col">Tries</th>
                <th scope="col">Best</th>
                <th scope="col">Latest</th>
                <th scope="col" />
              </tr>
            </thead>
            <tbody>
              {assignments.map((assignment) => {
                const progress = progressById.get(assignment.assignmentId);
                const route = gameRouteForId(assignment.gameId);

                return (
                  <tr key={assignment.assignmentId}>
                    <td>{assignment.title}</td>
                    <td>
                      {formatStudentTriesLabel(
                        progress?.tryCount ?? 0,
                        assignment.settings.maxTries
                      )}
                    </td>
                    <td>
                      {progress && progress.tryCount > 0
                        ? `${progress.bestScore}/${progress.bestTotal}`
                        : "—"}
                    </td>
                    <td>
                      {progress && progress.tryCount > 0 ? (
                        <>
                          {progress.latestScore}/{progress.latestTotal}
                          {progress.latestAt ? (
                            <span className="class-scores-date">
                              {" "}
                              ({formatAttemptDate(progress.latestAt)})
                            </span>
                          ) : null}
                        </>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td>
                      {route ? (
                        <Link
                          to={`${route}?assignment=${assignment.assignmentId}`}
                          className="student-scores-play-link"
                        >
                          Play
                        </Link>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
