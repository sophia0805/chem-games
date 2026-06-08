import { useEffect, useMemo, useState } from "react";
import {
  buildClassGameScoreSections,
  fetchClassGameAssignments,
  fetchClassGameScores,
  type ClassGameScoreSection,
} from "../lib/gameAccess";

type RosterStudent = {
  userId: string;
  displayName: string;
};

type ClassGameScoresProps = {
  classId: string;
  roster: RosterStudent[];
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

export default function ClassGameScores({ classId, roster }: ClassGameScoresProps) {
  const [sections, setSections] = useState<ClassGameScoreSection[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [noAssignedGames, setNoAssignedGames] = useState(false);

  const rosterKey = useMemo(
    () => roster.map((student) => student.userId).join(","),
    [roster]
  );

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError("");
      setNoAssignedGames(false);

      try {
        const assignments = await fetchClassGameAssignments(classId);
        const assignedGameIds = assignments.map((row) => row.gameId);

        if (assignedGameIds.length === 0) {
          if (!cancelled) {
            setSections([]);
            setNoAssignedGames(true);
          }
          return;
        }

        const attempts = await fetchClassGameScores(
          classId,
          roster.map((student) => student.userId),
          assignedGameIds
        );

        if (!cancelled) {
          setSections(
            buildClassGameScoreSections(attempts, assignedGameIds, roster)
          );
        }
      } catch (err: unknown) {
        if (!cancelled) {
          const message = err instanceof Error ? err.message : "Could not load game scores";
          setError(message);
          setSections([]);
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
  }, [classId, rosterKey, roster]);

  return (
    <div className="class-scores">
      <h4 className="class-roster-title">Game scores</h4>
      <p className="class-assignments-hint">
        Scores from completed runs on games assigned to this class.
      </p>
      {loading ? <p className="class-assignments-hint">Loading scores...</p> : null}
      {error ? <p className="error">{error}</p> : null}
      {!loading && !error && noAssignedGames ? (
        <p className="class-roster-empty">Assign a game above to start tracking scores.</p>
      ) : null}
      {!loading && !error && !noAssignedGames && roster.length === 0 ? (
        <p className="class-roster-empty">No students have joined yet.</p>
      ) : null}
      {!loading && !error && !noAssignedGames && roster.length > 0 ? (
        <div className="class-scores-sections">
          {sections.map((section) => (
            <div className="class-scores-game" key={section.gameId}>
              <h5 className="class-scores-game-title">{section.gameTitle}</h5>
              <div className="class-scores-table-wrap">
                <table className="class-scores-table">
                  <thead>
                    <tr>
                      <th scope="col">Student</th>
                      <th scope="col">Tries</th>
                      <th scope="col">Best</th>
                      <th scope="col">Latest</th>
                    </tr>
                  </thead>
                  <tbody>
                    {section.rows.map((row) => (
                      <tr key={row.userId}>
                        <td>{row.displayName}</td>
                        <td>{row.tryCount > 0 ? row.tryCount : "—"}</td>
                        <td>
                          {row.tryCount > 0 ? `${row.bestScore}/${row.bestTotal}` : "—"}
                        </td>
                        <td>
                          {row.tryCount > 0 ? (
                            <>
                              {row.latestScore}/{row.latestTotal}
                              <span className="class-scores-date">
                                {" "}
                                ({formatAttemptDate(row.latestAt)})
                              </span>
                            </>
                          ) : (
                            "—"
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
