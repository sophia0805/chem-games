import { useEffect, useState } from "react";
import { GAME_CATALOG } from "../games/catalog";
import {
  DEFAULT_ASSIGNMENT_SETTINGS,
  LAB_EQUIPMENT_POOL_SIZE,
  type GameAssignmentSettings,
} from "../games/settings";
import {
  fetchClassGameAssignments,
  saveClassGameAssignments,
  type ClassGameAssignmentRow,
} from "../lib/gameAccess";

type ClassGameAssignmentsProps = {
  classId: string;
  teacherId: string;
};

const SETTINGS_COLUMN_SQL = `alter table public.class_game_assignments
  add column if not exists settings jsonb not null
  default '{"questionCount":10,"maxTries":null,"timerLimitSeconds":null}'::jsonb;`;

const MULTIPLE_ASSIGNMENTS_SQL = `-- Allow multiple assignments of the same game per class
alter table public.class_game_assignments
  drop constraint if exists class_game_assignments_class_id_game_id_key;

alter table public.class_game_assignments
  add column if not exists title text;

alter table public.game_attempts
  add column if not exists assignment_id uuid references public.class_game_assignments (id) on delete set null;`;

function maxQuestionsForSlug(slug: string): number {
  if (slug === "lab-equipment") {
    return LAB_EQUIPMENT_POOL_SIZE;
  }
  return 50;
}

function gameTitleForSlug(slug: string): string {
  return GAME_CATALOG.find((game) => game.slug === slug)?.title ?? slug;
}

function defaultTitleForGame(gameId: string, assignments: ClassGameAssignmentRow[]): string {
  const count = assignments.filter((assignment) => assignment.gameId === gameId).length + 1;
  const base = gameTitleForSlug(gameId);
  return count <= 1 ? base : `${base} (${count})`;
}

function parseOptionalInt(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  const parsed = Number.parseInt(trimmed, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function newAssignment(gameId: string, assignments: ClassGameAssignmentRow[]): ClassGameAssignmentRow {
  return {
    id: crypto.randomUUID(),
    gameId,
    title: defaultTitleForGame(gameId, assignments),
    settings: { ...DEFAULT_ASSIGNMENT_SETTINGS },
  };
}

function assignmentLabel(assignment: ClassGameAssignmentRow): string {
  return assignment.title.trim() || gameTitleForSlug(assignment.gameId);
}

export default function ClassGameAssignments({ classId, teacherId }: ClassGameAssignmentsProps) {
  const [assignments, setAssignments] = useState<ClassGameAssignmentRow[]>([]);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [tableMissing, setTableMissing] = useState(false);
  const [settingsColumnMissing, setSettingsColumnMissing] = useState(false);
  const [multipleAssignmentsSqlRequired, setMultipleAssignmentsSqlRequired] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError("");
      setSuccess("");
      setTableMissing(false);
      setSettingsColumnMissing(false);
      setMultipleAssignmentsSqlRequired(false);

      try {
        const rows = await fetchClassGameAssignments(classId);
        if (!cancelled) {
          setAssignments(rows);
          setExpandedIds(new Set());
        }
      } catch (err: unknown) {
        if (!cancelled) {
          const message = err instanceof Error ? err.message : "Could not load assignments";
          if (message === "ASSIGNMENTS_TABLE_MISSING") {
            setTableMissing(true);
          } else if (message === "SETTINGS_COLUMN_MISSING") {
            setSettingsColumnMissing(true);
          } else {
            setError(message);
          }
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
  }, [classId]);

  const toggleExpanded = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const updateAssignment = (id: string, patch: Partial<ClassGameAssignmentRow>) => {
    setAssignments((prev) =>
      prev.map((assignment) => (assignment.id === id ? { ...assignment, ...patch } : assignment))
    );
    setSuccess("");
  };

  const updateSetting = (
    id: string,
    key: keyof GameAssignmentSettings,
    value: number | null
  ) => {
    setAssignments((prev) =>
      prev.map((assignment) =>
        assignment.id === id
          ? { ...assignment, settings: { ...assignment.settings, [key]: value } }
          : assignment
      )
    );
    setSuccess("");
  };

  const addAssignment = (gameId: string) => {
    const created = newAssignment(gameId, assignments);
    setAssignments((prev) => [...prev, created]);
    setExpandedIds((prev) => new Set(prev).add(created.id));
    setSuccess("");
  };

  const removeAssignment = (id: string) => {
    setAssignments((prev) => prev.filter((assignment) => assignment.id !== id));
    setExpandedIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    setSuccess("");
  };

  const handleSave = async () => {
    setSaving(true);
    setError("");
    setSuccess("");

    const payload: ClassGameAssignmentRow[] = assignments.map((assignment) => {
      const settings = { ...assignment.settings };
      const cap = maxQuestionsForSlug(assignment.gameId);
      settings.questionCount = Math.min(Math.max(1, settings.questionCount), cap);
      return {
        ...assignment,
        title: assignment.title.trim() || gameTitleForSlug(assignment.gameId),
        settings,
      };
    });

    try {
      await saveClassGameAssignments(classId, payload, teacherId);
      setSuccess("Assignments saved.");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Could not save assignments";
      if (message === "ASSIGNMENTS_TABLE_MISSING") {
        setTableMissing(true);
      } else if (message === "SETTINGS_COLUMN_MISSING") {
        setSettingsColumnMissing(true);
      } else if (message === "MULTIPLE_ASSIGNMENTS_SQL_REQUIRED") {
        setMultipleAssignmentsSqlRequired(true);
      } else {
        setError(message);
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="class-assignments">
      <h4 className="class-roster-title">Assign games</h4>
      <p className="class-assignments-hint">
        Expand an assignment to edit its settings, or add a new one below.
      </p>
      {tableMissing ? (
        <p className="error">
          The <code>class_game_assignments</code> table is missing. Run the Game assignments SQL in{" "}
          <code>SUPABASE_SETUP.md</code>, then in Supabase go to Settings → API → Reload schema
          cache.
        </p>
      ) : null}
      {settingsColumnMissing ? (
        <div className="class-assignments-migration">
          <p className="error">
            Missing <code>settings</code> column. Run this in Supabase SQL Editor, then reload the
            API schema (Settings → API → Reload schema):
          </p>
          <pre className="class-assignments-sql">{SETTINGS_COLUMN_SQL}</pre>
        </div>
      ) : null}
      {multipleAssignmentsSqlRequired ? (
        <div className="class-assignments-migration">
          <p className="error">
            Your database still limits each game to one assignment per class. Run this in Supabase SQL
            Editor, then reload the API schema:
          </p>
          <pre className="class-assignments-sql">{MULTIPLE_ASSIGNMENTS_SQL}</pre>
        </div>
      ) : null}
      {loading ? <p className="class-assignments-hint">Loading assignments...</p> : null}
      {error ? <p className="error">{error}</p> : null}
      {success ? <p className="success">{success}</p> : null}
      {!loading && !tableMissing && !settingsColumnMissing ? (
        <>
          {assignments.length === 0 ? (
            <p className="class-roster-empty">No assignments yet. Add one below.</p>
          ) : (
            <ul className="class-assignments-list">
              {assignments.map((assignment) => {
                const isExpanded = expandedIds.has(assignment.id);
                const maxQuestions = maxQuestionsForSlug(assignment.gameId);

                return (
                  <li key={assignment.id} className="class-assignment-item">
                    <div className="class-assignment-row">
                      <button
                        type="button"
                        className={`class-assignment-toggle${isExpanded ? " class-assignment-toggle-open" : ""}`}
                        onClick={() => toggleExpanded(assignment.id)}
                        disabled={saving}
                        aria-expanded={isExpanded}
                        aria-label={`${isExpanded ? "Hide" : "Show"} settings for ${assignmentLabel(assignment)}`}
                      >
                        <span className="class-assignment-chevron" aria-hidden="true" />
                      </button>
                      <div className="class-assignment-summary">
                        <span className="class-assignment-name">{assignmentLabel(assignment)}</span>
                        <span className="class-assignment-game">{gameTitleForSlug(assignment.gameId)}</span>
                      </div>
                      <button
                        type="button"
                        className="link-button class-assignment-remove"
                        onClick={() => removeAssignment(assignment.id)}
                        disabled={saving}
                      >
                        Remove
                      </button>
                    </div>
                    {isExpanded ? (
                      <div className="class-assignment-settings">
                        <label>
                          Assignment name
                          <input
                            type="text"
                            value={assignment.title}
                            onChange={(e) =>
                              updateAssignment(assignment.id, { title: e.target.value })
                            }
                            disabled={saving}
                            placeholder={gameTitleForSlug(assignment.gameId)}
                          />
                        </label>
                        <label>
                          Questions
                          <input
                            type="number"
                            min={1}
                            max={maxQuestions}
                            value={assignment.settings.questionCount}
                            onChange={(e) =>
                              updateSetting(
                                assignment.id,
                                "questionCount",
                                Math.min(
                                  maxQuestions,
                                  Math.max(1, Number.parseInt(e.target.value, 10) || 1)
                                )
                              )
                            }
                            disabled={saving}
                          />
                        </label>
                        <label>
                          Max tries
                          <input
                            type="number"
                            min={1}
                            placeholder="Unlimited"
                            value={assignment.settings.maxTries ?? ""}
                            onChange={(e) =>
                              updateSetting(
                                assignment.id,
                                "maxTries",
                                parseOptionalInt(e.target.value)
                              )
                            }
                            disabled={saving}
                          />
                        </label>
                        <label>
                          Time limit (minutes)
                          <input
                            type="number"
                            min={1}
                            placeholder="No limit"
                            value={
                              assignment.settings.timerLimitSeconds
                                ? Math.ceil(assignment.settings.timerLimitSeconds / 60)
                                : ""
                            }
                            onChange={(e) => {
                              const minutes = parseOptionalInt(e.target.value);
                              updateSetting(
                                assignment.id,
                                "timerLimitSeconds",
                                minutes === null ? null : minutes * 60
                              );
                            }}
                            disabled={saving}
                          />
                        </label>
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
          <div className="class-assignment-add-row">
            <label className="class-assignment-add-label">
              Add assignment
              <select
                defaultValue=""
                onChange={(e) => {
                  const gameId = e.target.value;
                  if (gameId) {
                    addAssignment(gameId);
                    e.target.value = "";
                  }
                }}
                disabled={saving}
              >
                <option value="" disabled>
                  Choose a game…
                </option>
                {GAME_CATALOG.map((game) => (
                  <option key={game.slug} value={game.slug}>
                    {game.title}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <button
            type="button"
            className="button"
            onClick={() => void handleSave()}
            disabled={saving}
          >
            {saving ? "Saving..." : "Save assignments"}
          </button>
        </>
      ) : null}
    </div>
  );
}
