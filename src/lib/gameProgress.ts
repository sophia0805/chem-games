import type { SavedLabEquipmentProgress } from "../games/labEquipmentProgress";
import { supabase } from "./supabaseClient";

function isMissingProgressTable(err: { code?: string; message?: string } | null): boolean {
  if (!err) {
    return false;
  }
  const msg = (err.message ?? "").toLowerCase();
  return (
    err.code === "42P01" ||
    err.code === "PGRST205" ||
    msg.includes("could not find the table") ||
    (msg.includes("relation") && msg.includes("game_progress") && msg.includes("does not exist"))
  );
}

function normalizeProgress(raw: unknown): SavedLabEquipmentProgress | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const record = raw as Record<string, unknown>;
  if (record.version !== 1) {
    return null;
  }

  const question = record.question;
  if (!question || typeof question !== "object") {
    return null;
  }

  const questionRecord = question as Record<string, unknown>;
  if (typeof questionRecord.cardName !== "string" || typeof questionRecord.style !== "string") {
    return null;
  }
  if (!Array.isArray(questionRecord.optionNames)) {
    return null;
  }

  return {
    version: 1,
    totalRounds: Number(record.totalRounds),
    timerLimitSeconds:
      record.timerLimitSeconds === null ? null : Number(record.timerLimitSeconds),
    usedNames: Array.isArray(record.usedNames)
      ? record.usedNames.filter((name): name is string => typeof name === "string")
      : [],
    score: Number(record.score ?? 0),
    round: Number(record.round ?? 1),
    selected: typeof record.selected === "string" ? record.selected : null,
    isCorrect: typeof record.isCorrect === "boolean" ? record.isCorrect : null,
    timedOut: Boolean(record.timedOut),
    secondsLeft: record.secondsLeft === null ? null : Number(record.secondsLeft),
    question: {
      cardName: questionRecord.cardName,
      style: questionRecord.style as SavedLabEquipmentProgress["question"]["style"],
      optionNames: questionRecord.optionNames.filter(
        (name): name is string => typeof name === "string"
      ),
    },
  };
}

export async function loadServerGameProgress(
  userId: string,
  assignmentId: string
): Promise<SavedLabEquipmentProgress | null> {
  const { data, error } = await supabase
    .from("game_progress")
    .select("progress")
    .eq("user_id", userId)
    .eq("assignment_id", assignmentId)
    .maybeSingle();

  if (error) {
    if (isMissingProgressTable(error)) {
      return null;
    }
    throw new Error(`Could not load saved progress: ${error.message}`);
  }

  return normalizeProgress(data?.progress);
}

export async function saveServerGameProgress(params: {
  userId: string;
  assignmentId: string;
  gameId: string;
  classId: string | null;
  progress: SavedLabEquipmentProgress;
}): Promise<void> {
  const { error } = await supabase.from("game_progress").upsert(
    {
      user_id: params.userId,
      game_id: params.gameId,
      assignment_id: params.assignmentId,
      class_id: params.classId,
      progress: params.progress,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,assignment_id" }
  );

  if (error && !isMissingProgressTable(error)) {
    throw new Error(`Could not save progress: ${error.message}`);
  }
}

export async function clearServerGameProgress(
  userId: string,
  assignmentId: string
): Promise<void> {
  const { error } = await supabase
    .from("game_progress")
    .delete()
    .eq("user_id", userId)
    .eq("assignment_id", assignmentId);

  if (error && !isMissingProgressTable(error)) {
    throw new Error(`Could not clear saved progress: ${error.message}`);
  }
}
