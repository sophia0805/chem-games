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

type AssignmentDraft = {
  enabled: boolean;
  settings: GameAssignmentSettings;
};

type ClassGameAssignmentsProps = {
  classId: string;
  teacherId: string;
};

const SETTINGS_COLUMN_SQL = `alter table public.class_game_assignments
  add column if not exists settings jsonb not null
  default '{"questionCount":10,"maxTries":null,"timerLimitSeconds":null}'::jsonb;`;

function maxQuestionsForSlug(slug: string): number {
  if (slug === "lab-equipment") {
    return LAB_EQUIPMENT_POOL_SIZE;
  }
  return 50;
}

function emptyDrafts(): Record<string, AssignmentDraft> {
  const drafts: Record<string, AssignmentDraft> = {};
  for (const game of GAME_CATALOG) {
    drafts[game.slug] = {
      enabled: false,
      settings: { ...DEFAULT_ASSIGNMENT_SETTINGS },
    };
  }
  return drafts;
}

function parseOptionalInt(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  const parsed = Number.parseInt(trimmed, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export default function ClassGameAssignments({ classId, teacherId }: ClassGameAssignmentsProps) {
  const [drafts, setDrafts] = useState<Record<string, AssignmentDraft>>(emptyDrafts);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [tableMissing, setTableMissing] = useState(false);
  const [settingsColumnMissing, setSettingsColumnMissing] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError("");
      setSuccess("");
      setTableMissing(false);
      setSettingsColumnMissing(false);

      try {
        const rows = await fetchClassGameAssignments(classId);
        if (cancelled) {
          return;
        }

        const next = emptyDrafts();
        for (const row of rows) {
          if (next[row.gameId]) {
            next[row.gameId] = { enabled: true, settings: row.settings };
          }
        }
        setDrafts(next);
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

  const updateDraft = (slug: string, patch: Partial<AssignmentDraft>) => {
    setDrafts((prev) => ({
      ...prev,
      [slug]: { ...prev[slug], ...patch },
    }));
    setSuccess("");
  };

  const updateSetting = (
    slug: string,
    key: keyof GameAssignmentSettings,
    value: number | null
  ) => {
    setDrafts((prev) => ({
      ...prev,
      [slug]: {
        ...prev[slug],
        settings: { ...prev[slug].settings, [key]: value },
      },
    }));
    setSuccess("");
  };

  const handleSave = async () => {
    setSaving(true);
    setError("");
    setSuccess("");

    const assignments: ClassGameAssignmentRow[] = GAME_CATALOG.filter(
      (game) => drafts[game.slug]?.enabled
    ).map((game) => {
      const settings = { ...drafts[game.slug].settings };
      const cap = maxQuestionsForSlug(game.slug);
      settings.questionCount = Math.min(Math.max(1, settings.questionCount), cap);
      return { gameId: game.slug, settings };
    });

    try {
      await saveClassGameAssignments(classId, assignments, teacherId);
      setSuccess("Assignments saved.");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Could not save assignments";
      if (message === "ASSIGNMENTS_TABLE_MISSING") {
        setTableMissing(true);
      } else if (message === "SETTINGS_COLUMN_MISSING") {
        setSettingsColumnMissing(true);
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
        Check a game to assign it, then set questions, tries, and time limit. Leave tries or time
        blank for no limit.
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
      {loading ? <p className="class-assignments-hint">Loading assignments...</p> : null}
      {error ? <p className="error">{error}</p> : null}
      {success ? <p className="success">{success}</p> : null}
      {!loading && !tableMissing && !settingsColumnMissing ? (
        <>
          <ul className="class-assignments-list">
            {GAME_CATALOG.map((game) => {
              const draft = drafts[game.slug];
              const maxQuestions = maxQuestionsForSlug(game.slug);

              return (
                <li key={game.slug} className="class-assignment-item">
                  <label className="class-assignments-label">
                    <input
                      type="checkbox"
                      checked={draft.enabled}
                      onChange={(e) => updateDraft(game.slug, { enabled: e.target.checked })}
                      disabled={saving}
                    />
                    <span>{game.title}</span>
                  </label>
                  {draft.enabled ? (
                    <div className="class-assignment-settings">
                      <label>
                        Questions
                        <input
                          type="number"
                          min={1}
                          max={maxQuestions}
                          value={draft.settings.questionCount}
                          onChange={(e) =>
                            updateSetting(
                              game.slug,
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
                          value={draft.settings.maxTries ?? ""}
                          onChange={(e) =>
                            updateSetting(game.slug, "maxTries", parseOptionalInt(e.target.value))
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
                            draft.settings.timerLimitSeconds
                              ? Math.ceil(draft.settings.timerLimitSeconds / 60)
                              : ""
                          }
                          onChange={(e) => {
                            const minutes = parseOptionalInt(e.target.value);
                            updateSetting(
                              game.slug,
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
