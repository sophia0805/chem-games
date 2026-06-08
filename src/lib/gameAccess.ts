import type { User } from "@supabase/supabase-js";
import { GAME_CATALOG, type GameDefinition } from "../games/catalog";
import {
  clampSettingsForGame,
  DEFAULT_ASSIGNMENT_SETTINGS,
  LAB_EQUIPMENT_POOL_SIZE,
  mergeAssignmentSettings,
  normalizeAssignmentSettings,
  type GameAssignmentSettings,
} from "../games/settings";
import { supabase } from "./supabaseClient";

export type AccountRole = "teacher" | "student";

export type ClassGameAssignmentRow = {
  gameId: string;
  settings: GameAssignmentSettings;
};

export type GameAccessState = {
  role: AccountRole | null;
  assignedGameIds: Set<string>;
  loading: boolean;
  error: string;
  assignmentsTableMissing: boolean;
};

export type GamePlayResolution = {
  settings: GameAssignmentSettings;
  attemptsUsed: number;
  canStart: boolean;
  isTeacherPreview: boolean;
  classId: string | null;
};

export type GameAttemptSummary = {
  id: string;
  userId: string;
  gameId: string;
  score: number;
  questionCount: number;
  createdAt: string;
};

export type StudentGameScoreRow = {
  userId: string;
  displayName: string;
  tryCount: number;
  bestScore: number;
  bestTotal: number;
  latestScore: number;
  latestTotal: number;
  latestAt: string;
};

export type ClassGameScoreSection = {
  gameId: string;
  gameTitle: string;
  rows: StudentGameScoreRow[];
};

function isMissingSettingsColumn(err: { code?: string; message?: string } | null): boolean {
  if (!err) {
    return false;
  }
  const msg = (err.message ?? "").toLowerCase();
  return (
    err.code === "42703" ||
    (msg.includes("settings") &&
      (msg.includes("does not exist") || msg.includes("could not find")))
  );
}

function isMissingAssignmentsTable(err: { code?: string; message?: string } | null): boolean {
  if (!err) {
    return false;
  }
  const msg = (err.message ?? "").toLowerCase();
  return (
    err.code === "42P01" ||
    err.code === "PGRST205" ||
    msg.includes("could not find the table") ||
    msg.includes("schema cache") ||
    (msg.includes("relation") && msg.includes("does not exist"))
  );
}

function isMissingAttemptsTable(err: { code?: string; message?: string } | null): boolean {
  if (!err) {
    return false;
  }
  const msg = (err.message ?? "").toLowerCase();
  return (
    err.code === "42P01" ||
    err.code === "PGRST205" ||
    msg.includes("could not find the table") ||
    (msg.includes("relation") && msg.includes("game_attempts") && msg.includes("does not exist"))
  );
}

function maxQuestionsForGame(gameId: string): number {
  if (gameId === "lab-equipment") {
    return LAB_EQUIPMENT_POOL_SIZE;
  }
  return 50;
}

export async function fetchProfileRole(userId: string): Promise<AccountRole | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    throw new Error(`Could not load profile role: ${error.message}`);
  }

  const role = data?.role;
  if (role === "teacher" || role === "student") {
    return role;
  }
  return null;
}

async function fetchStudentAssignments(
  userId: string
): Promise<{
  gameIds: Set<string>;
  settingsByGame: Map<string, GameAssignmentSettings[]>;
  classIdByGame: Map<string, string>;
}> {
  const { data: memberships, error: membershipError } = await supabase
    .from("class_memberships")
    .select("class_id")
    .eq("user_id", userId);

  if (membershipError) {
    throw new Error(`Could not load class memberships: ${membershipError.message}`);
  }

  const classIds = [...new Set((memberships ?? []).map((row) => row.class_id as string))];
  if (classIds.length === 0) {
    return { gameIds: new Set(), settingsByGame: new Map(), classIdByGame: new Map() };
  }

  const { data: assignments, error: assignmentError } = await supabase
    .from("class_game_assignments")
    .select("game_id, settings, class_id")
    .in("class_id", classIds);

  if (assignmentError) {
    if (isMissingSettingsColumn(assignmentError)) {
      throw new Error("SETTINGS_COLUMN_MISSING");
    }
    if (isMissingAssignmentsTable(assignmentError)) {
      throw new Error("ASSIGNMENTS_TABLE_MISSING");
    }
    throw new Error(`Could not load game assignments: ${assignmentError.message}`);
  }

  const gameIds = new Set<string>();
  const settingsByGame = new Map<string, GameAssignmentSettings[]>();
  const classIdByGame = new Map<string, string>();

  for (const row of assignments ?? []) {
    const gameId = row.game_id as string;
    const classId = row.class_id as string;
    gameIds.add(gameId);
    const list = settingsByGame.get(gameId) ?? [];
    list.push(normalizeAssignmentSettings(row.settings));
    settingsByGame.set(gameId, list);
    if (!classIdByGame.has(gameId)) {
      classIdByGame.set(gameId, classId);
    }
  }

  return { gameIds, settingsByGame, classIdByGame };
}

export async function fetchAssignedGameIds(userId: string): Promise<Set<string>> {
  const { gameIds } = await fetchStudentAssignments(userId);
  return gameIds;
}

export async function loadGameAccess(user: User | null): Promise<GameAccessState> {
  if (!user) {
    return {
      role: null,
      assignedGameIds: new Set(),
      loading: false,
      error: "",
      assignmentsTableMissing: false,
    };
  }

  try {
    const role = await fetchProfileRole(user.id);
    if (role === "teacher") {
      return {
        role,
        assignedGameIds: new Set(),
        loading: false,
        error: "",
        assignmentsTableMissing: false,
      };
    }

    const { gameIds } = await fetchStudentAssignments(user.id);
    return {
      role: role ?? "student",
      assignedGameIds: gameIds,
      loading: false,
      error: "",
      assignmentsTableMissing: false,
    };
  } catch (err: unknown) {
    if (err instanceof Error && err.message === "ASSIGNMENTS_TABLE_MISSING") {
      return {
        role: "student",
        assignedGameIds: new Set(),
        loading: false,
        error: "",
        assignmentsTableMissing: true,
      };
    }

    const message = err instanceof Error ? err.message : "Could not load game access";
    return {
      role: null,
      assignedGameIds: new Set(),
      loading: false,
      error: message,
      assignmentsTableMissing: false,
    };
  }
}

export function getAccessibleGames(
  role: AccountRole | null,
  assignedGameIds: Set<string>
): GameDefinition[] {
  if (role === "teacher") {
    return GAME_CATALOG;
  }

  if (role === "student") {
    return GAME_CATALOG.filter((game) => assignedGameIds.has(game.slug));
  }

  return [];
}

export function canAccessGame(
  role: AccountRole | null,
  assignedGameIds: Set<string>,
  slug: string
): boolean {
  if (role === "teacher") {
    return true;
  }

  if (role === "student") {
    return assignedGameIds.has(slug);
  }

  return false;
}

export async function fetchClassGameAssignments(classId: string): Promise<ClassGameAssignmentRow[]> {
  const { data, error } = await supabase
    .from("class_game_assignments")
    .select("game_id, settings")
    .eq("class_id", classId);

  if (error) {
    if (isMissingSettingsColumn(error)) {
      throw new Error("SETTINGS_COLUMN_MISSING");
    }
    if (isMissingAssignmentsTable(error)) {
      throw new Error("ASSIGNMENTS_TABLE_MISSING");
    }
    throw new Error(error.message);
  }

  return (data ?? []).map((row) => ({
    gameId: row.game_id as string,
    settings: normalizeAssignmentSettings(row.settings),
  }));
}

export async function saveClassGameAssignments(
  classId: string,
  assignments: ClassGameAssignmentRow[],
  assignedBy: string
): Promise<void> {
  const { error: deleteError } = await supabase
    .from("class_game_assignments")
    .delete()
    .eq("class_id", classId);

  if (deleteError) {
    if (isMissingAssignmentsTable(deleteError)) {
      throw new Error("ASSIGNMENTS_TABLE_MISSING");
    }
    throw new Error(deleteError.message);
  }

  if (assignments.length === 0) {
    return;
  }

  const { error: insertError } = await supabase.from("class_game_assignments").insert(
    assignments.map((assignment) => ({
      class_id: classId,
      game_id: assignment.gameId,
      assigned_by: assignedBy,
      settings: assignment.settings,
    }))
  );

  if (insertError) {
    if (isMissingSettingsColumn(insertError)) {
      throw new Error("SETTINGS_COLUMN_MISSING");
    }
    throw new Error(insertError.message);
  }
}

export async function countGameAttempts(userId: string, gameId: string): Promise<number> {
  const { count, error } = await supabase
    .from("game_attempts")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("game_id", gameId);

  if (error) {
    if (isMissingAttemptsTable(error)) {
      return 0;
    }
    throw new Error(error.message);
  }

  return count ?? 0;
}

export async function recordGameAttempt(params: {
  userId: string;
  gameId: string;
  classId: string | null;
  score: number;
  questionCount: number;
}): Promise<void> {
  const { error } = await supabase.from("game_attempts").insert({
    user_id: params.userId,
    game_id: params.gameId,
    class_id: params.classId,
    score: params.score,
    question_count: params.questionCount,
  });

  if (error && !isMissingAttemptsTable(error)) {
    throw new Error(error.message);
  }
}

function isMissingScoresRpc(err: { code?: string; message?: string } | null): boolean {
  if (!err) {
    return false;
  }
  const msg = (err.message ?? "").toLowerCase();
  return (
    err.code === "PGRST202" ||
    msg.includes("could not find the function") ||
    msg.includes("does not exist")
  );
}

function mapAttemptRow(row: Record<string, unknown>): GameAttemptSummary {
  const completedAt = row.completed_at ?? row.created_at;
  return {
    id: String(row.id),
    userId: String(row.user_id ?? row.userId),
    gameId: String(row.game_id ?? row.gameId),
    score: Number(row.score ?? 0),
    questionCount: Number(row.question_count ?? row.questionCount ?? 0),
    createdAt: String(completedAt ?? ""),
  };
}

export async function fetchClassGameScores(
  classId: string,
  studentUserIds: string[],
  assignedGameIds: string[]
): Promise<GameAttemptSummary[]> {
  if (studentUserIds.length === 0 || assignedGameIds.length === 0) {
    return [];
  }

  const { data: rpcData, error: rpcError } = await supabase.rpc("get_teacher_class_game_scores", {
    p_class_id: classId,
  });

  if (!rpcError && Array.isArray(rpcData)) {
    return (rpcData as Record<string, unknown>[])
      .map(mapAttemptRow)
      .filter(
        (attempt) =>
          studentUserIds.includes(attempt.userId) && assignedGameIds.includes(attempt.gameId)
      );
  }

  if (rpcError && !isMissingScoresRpc(rpcError)) {
    throw new Error(`Could not load game scores: ${rpcError.message}`);
  }

  const { data, error } = await supabase
    .from("game_attempts")
    .select("id, user_id, game_id, score, question_count, completed_at")
    .in("user_id", studentUserIds)
    .in("game_id", assignedGameIds)
    .or(`class_id.eq.${classId},class_id.is.null`)
    .order("completed_at", { ascending: false });

  if (error) {
    if (isMissingAttemptsTable(error)) {
      return [];
    }
    throw new Error(`Could not load game scores: ${error.message}`);
  }

  return (data ?? []).map((row) => mapAttemptRow(row as Record<string, unknown>));
}

export function buildClassGameScoreSections(
  attempts: GameAttemptSummary[],
  assignedGameIds: string[],
  roster: { userId: string; displayName: string }[]
): ClassGameScoreSection[] {
  const titleByGameId = new Map(GAME_CATALOG.map((game) => [game.slug, game.title]));
  const nameByUserId = new Map(roster.map((student) => [student.userId, student.displayName]));

  return assignedGameIds.map((gameId) => {
    const byStudent = new Map<string, GameAttemptSummary[]>();
    for (const attempt of attempts) {
      if (attempt.gameId !== gameId) {
        continue;
      }
      const list = byStudent.get(attempt.userId) ?? [];
      list.push(attempt);
      byStudent.set(attempt.userId, list);
    }

    const rows: StudentGameScoreRow[] = roster.map((student) => {
      const studentAttempts = byStudent.get(student.userId) ?? [];
      if (studentAttempts.length === 0) {
        return {
          userId: student.userId,
          displayName: student.displayName,
          tryCount: 0,
          bestScore: 0,
          bestTotal: 0,
          latestScore: 0,
          latestTotal: 0,
          latestAt: "",
        };
      }

      const sorted = [...studentAttempts].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      const latest = sorted[0];
      const best = studentAttempts.reduce((top, attempt) =>
        attempt.score > top.score ? attempt : top
      );

      return {
        userId: student.userId,
        displayName: nameByUserId.get(student.userId) ?? student.displayName,
        tryCount: studentAttempts.length,
        bestScore: best.score,
        bestTotal: best.questionCount,
        latestScore: latest.score,
        latestTotal: latest.questionCount,
        latestAt: latest.createdAt,
      };
    });

    rows.sort((a, b) => {
      if (b.bestScore !== a.bestScore) {
        return b.bestScore - a.bestScore;
      }
      return a.displayName.localeCompare(b.displayName);
    });

    return {
      gameId,
      gameTitle: titleByGameId.get(gameId) ?? gameId,
      rows,
    };
  });
}

export async function resolveGamePlayConfig(
  user: User,
  gameId: string
): Promise<GamePlayResolution> {
  const role = await fetchProfileRole(user.id);
  const maxQuestions = maxQuestionsForGame(gameId);

  if (role === "teacher") {
    return {
      settings: clampSettingsForGame({ ...DEFAULT_ASSIGNMENT_SETTINGS }, maxQuestions),
      attemptsUsed: 0,
      canStart: true,
      isTeacherPreview: true,
      classId: null,
    };
  }

  const { gameIds, settingsByGame, classIdByGame } = await fetchStudentAssignments(user.id);
  if (!gameIds.has(gameId)) {
    return {
      settings: clampSettingsForGame({ ...DEFAULT_ASSIGNMENT_SETTINGS }, maxQuestions),
      attemptsUsed: 0,
      canStart: false,
      isTeacherPreview: false,
      classId: null,
    };
  }

  const merged = mergeAssignmentSettings(settingsByGame.get(gameId) ?? []);
  const settings = clampSettingsForGame(merged, maxQuestions);
  const attemptsUsed = await countGameAttempts(user.id, gameId);
  const canStart = settings.maxTries === null || attemptsUsed < settings.maxTries;

  return {
    settings,
    attemptsUsed,
    canStart,
    isTeacherPreview: false,
    classId: classIdByGame.get(gameId) ?? null,
  };
}
