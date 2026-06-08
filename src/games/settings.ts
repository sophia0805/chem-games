export type GameAssignmentSettings = {
  questionCount: number;
  maxTries: number | null;
  timerLimitSeconds: number | null;
};

export const DEFAULT_ASSIGNMENT_SETTINGS: GameAssignmentSettings = {
  questionCount: 10,
  maxTries: null,
  timerLimitSeconds: null,
};

export const LAB_EQUIPMENT_POOL_SIZE = 16;

export function normalizeAssignmentSettings(
  raw: unknown
): GameAssignmentSettings {
  const base = { ...DEFAULT_ASSIGNMENT_SETTINGS };
  if (!raw || typeof raw !== "object") {
    return base;
  }

  const record = raw as Record<string, unknown>;

  if (typeof record.questionCount === "number" && Number.isFinite(record.questionCount)) {
    base.questionCount = Math.max(1, Math.floor(record.questionCount));
  }

  if (record.maxTries === null) {
    base.maxTries = null;
  } else if (typeof record.maxTries === "number" && Number.isFinite(record.maxTries)) {
    base.maxTries = Math.max(1, Math.floor(record.maxTries));
  }

  if (record.timerLimitSeconds === null) {
    base.timerLimitSeconds = null;
  } else if (
    typeof record.timerLimitSeconds === "number" &&
    Number.isFinite(record.timerLimitSeconds)
  ) {
    base.timerLimitSeconds = Math.max(1, Math.floor(record.timerLimitSeconds));
  }

  return base;
}

export function clampSettingsForGame(
  settings: GameAssignmentSettings,
  maxQuestions: number
): GameAssignmentSettings {
  return {
    ...settings,
    questionCount: Math.min(settings.questionCount, maxQuestions),
  };
}

/** When a student has multiple class assignments, use the strictest limits. */
export function mergeAssignmentSettings(
  settingsList: GameAssignmentSettings[]
): GameAssignmentSettings {
  if (settingsList.length === 0) {
    return { ...DEFAULT_ASSIGNMENT_SETTINGS };
  }

  const questionCount = Math.min(...settingsList.map((s) => s.questionCount));

  const triesValues = settingsList
    .map((s) => s.maxTries)
    .filter((value): value is number => value !== null);
  const maxTries = triesValues.length > 0 ? Math.min(...triesValues) : null;

  const timerValues = settingsList
    .map((s) => s.timerLimitSeconds)
    .filter((value): value is number => value !== null);
  const timerLimitSeconds = timerValues.length > 0 ? Math.min(...timerValues) : null;

  return { questionCount, maxTries, timerLimitSeconds };
}

export function formatTimer(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}
