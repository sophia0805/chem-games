export type SavedQuestionStyle =
  | "image-to-name"
  | "description-to-name"
  | "name-to-image"
  | "both-to-name";

export type SavedLabEquipmentQuestion = {
  cardName: string;
  style: SavedQuestionStyle;
  optionNames: string[];
};

export type SavedLabEquipmentProgress = {
  version: 1;
  totalRounds: number;
  timerLimitSeconds: number | null;
  usedNames: string[];
  score: number;
  round: number;
  selected: string | null;
  isCorrect: boolean | null;
  timedOut: boolean;
  secondsLeft: number | null;
  question: SavedLabEquipmentQuestion;
};

const TEACHER_PREVIEW_KEY = "chem-games:lab-equipment:teacher-preview";

/** Teacher preview still uses browser storage (no assignment to save against). */
export function loadTeacherPreviewProgress(): SavedLabEquipmentProgress | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(TEACHER_PREVIEW_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as SavedLabEquipmentProgress;
    return parsed.version === 1 ? parsed : null;
  } catch {
    return null;
  }
}

export function saveTeacherPreviewProgress(progress: SavedLabEquipmentProgress): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(TEACHER_PREVIEW_KEY, JSON.stringify(progress));
  } catch {
    // Ignore storage errors.
  }
}

export function clearTeacherPreviewProgress(): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.removeItem(TEACHER_PREVIEW_KEY);
  } catch {
    // Ignore storage errors.
  }
}

export function isValidSavedProgress(
  saved: SavedLabEquipmentProgress,
  totalRounds: number,
  timerLimitSeconds: number | null
): boolean {
  if (saved.totalRounds !== totalRounds) {
    return false;
  }
  if (saved.timerLimitSeconds !== timerLimitSeconds) {
    return false;
  }
  if (saved.timedOut || saved.round > totalRounds) {
    return false;
  }
  return true;
}
