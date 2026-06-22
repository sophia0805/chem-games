import type { User } from "@supabase/supabase-js";
import { GAME_CATALOG, type GameDefinition } from "../games/catalog";
import {
  clampSettingsForGame,
  DEFAULT_ASSIGNMENT_SETTINGS,
  LAB_EQUIPMENT_POOL_SIZE,
  normalizeAssignmentSettings,
  type GameAssignmentSettings,
} from "../games/settings";
import { supabase } from "./supabaseClient";

export type AccountRole = "teacher" | "student";

export type ClassGameAssignmentRow = {
  id: string;
  gameId: string;
  title: string;
  settings: GameAssignmentSettings;
};

export type StudentGameAssignment = {
  assignmentId: string;
  gameId: string;
  classId: string;
  title: string;
  settings: GameAssignmentSettings;
};

export type GameAccessState = {
  role: AccountRole | null;
  assignedGameIds: Set<string>;
  studentAssignments: StudentGameAssignment[];
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
  assignmentId: string | null;
  assignmentTitle: string | null;
};

export type GameAttemptSummary = {
  id: string;
  userId: string;
  gameId: string;
  assignmentId: string | null;
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
  assignmentId: string;
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

function isMissingTitleColumn(err: { code?: string; message?: string } | null): boolean {
  if (!err) {
    return false;
  }
  const msg = (err.message ?? "").toLowerCase();
  return err.code === "42703" && msg.includes("title");
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

function isDuplicateAssignmentError(err: { code?: string; message?: string } | null): boolean {
  if (!err) {
    return false;
  }
  return err.code === "23505" || (err.message ?? "").toLowerCase().includes("duplicate");
}

function maxQuestionsForGame(gameId: string): number {
  if (gameId === "lab-equipment") {
    return LAB_EQUIPMENT_POOL_SIZE;
  }
  return 50;
}

function gameTitleForId(gameId: string): string {
  return GAME_CATALOG.find((game) => game.slug === gameId)?.title ?? gameId;
}

function defaultAssignmentTitle(gameId: string, index: number): string {
  const base = gameTitleForId(gameId);
  return index <= 1 ? base : `${base} (${index})`;
}

export function formatAssignmentSummary(settings: GameAssignmentSettings): string {
  const parts = [`${settings.questionCount} questions`];
  if (settings.maxTries !== null) {
    parts.push(`${settings.maxTries} ${settings.maxTries === 1 ? "try" : "tries"}`);
  }
  if (settings.timerLimitSeconds !== null) {
    const minutes = Math.ceil(settings.timerLimitSeconds / 60);
    parts.push(`${minutes} min limit`);
  }
  return parts.join(" · ");
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
): Promise<StudentGameAssignment[]> {
  const { data: memberships, error: membershipError } = await supabase
    .from("class_memberships")
    .select("class_id")
    .eq("user_id", userId);

  if (membershipError) {
    throw new Error(`Could not load class memberships: ${membershipError.message}`);
  }

  const classIds = [...new Set((memberships ?? []).map((row) => row.class_id as string))];
  if (classIds.length === 0) {
    return [];
  }

  const { data: assignments, error: assignmentError } = await supabase
    .from("class_game_assignments")
    .select("id, game_id, settings, class_id, title, assigned_at")
    .in("class_id", classIds)
    .order("assigned_at", { ascending: true });

  let rows = assignments;
  let loadError = assignmentError;

  if (loadError && isMissingTitleColumn(loadError)) {
    const fallback = await supabase
      .from("class_game_assignments")
      .select("id, game_id, settings, class_id, assigned_at")
      .in("class_id", classIds)
      .order("assigned_at", { ascending: true });
    rows = fallback.data;
    loadError = fallback.error;
  }

  if (loadError) {
    if (isMissingSettingsColumn(loadError)) {
      throw new Error("SETTINGS_COLUMN_MISSING");
    }
    if (isMissingAssignmentsTable(loadError)) {
      throw new Error("ASSIGNMENTS_TABLE_MISSING");
    }
    throw new Error(`Could not load game assignments: ${loadError.message}`);
  }

  const countsByGame = new Map<string, number>();
  const result: StudentGameAssignment[] = [];

  for (const row of rows ?? []) {
    const gameId = row.game_id as string;
    const count = (countsByGame.get(gameId) ?? 0) + 1;
    countsByGame.set(gameId, count);

    const storedTitle =
      "title" in row && typeof row.title === "string" ? row.title.trim() : "";
    result.push({
      assignmentId: row.id as string,
      gameId,
      classId: row.class_id as string,
      title: storedTitle || defaultAssignmentTitle(gameId, count),
      settings: normalizeAssignmentSettings(row.settings),
    });
  }

  return result;
}

export async function fetchAssignedGameIds(userId: string): Promise<Set<string>> {
  const assignments = await fetchStudentAssignments(userId);
  return new Set(assignments.map((assignment) => assignment.gameId));
}

export async function loadGameAccess(user: User | null): Promise<GameAccessState> {
  if (!user) {
    return {
      role: null,
      assignedGameIds: new Set(),
      studentAssignments: [],
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
        studentAssignments: [],
        loading: false,
        error: "",
        assignmentsTableMissing: false,
      };
    }

    const studentAssignments = await fetchStudentAssignments(user.id);
    return {
      role: role ?? "student",
      assignedGameIds: new Set(studentAssignments.map((assignment) => assignment.gameId)),
      studentAssignments,
      loading: false,
      error: "",
      assignmentsTableMissing: false,
    };
  } catch (err: unknown) {
    if (err instanceof Error && err.message === "ASSIGNMENTS_TABLE_MISSING") {
      return {
        role: "student",
        assignedGameIds: new Set(),
        studentAssignments: [],
        loading: false,
        error: "",
        assignmentsTableMissing: true,
      };
    }

    const message = err instanceof Error ? err.message : "Could not load game access";
    return {
      role: null,
      assignedGameIds: new Set(),
      studentAssignments: [],
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

export function canAccessAssignment(
  role: AccountRole | null,
  studentAssignments: StudentGameAssignment[],
  gameId: string,
  assignmentId: string | null
): boolean {
  if (role === "teacher") {
    return true;
  }

  if (role !== "student" || !assignmentId) {
    return false;
  }

  return studentAssignments.some(
    (assignment) => assignment.assignmentId === assignmentId && assignment.gameId === gameId
  );
}

export async function fetchClassGameAssignments(classId: string): Promise<ClassGameAssignmentRow[]> {
  const selectWithTitle = await supabase
    .from("class_game_assignments")
    .select("id, game_id, settings, title, assigned_at")
    .eq("class_id", classId)
    .order("assigned_at", { ascending: true });

  let data = selectWithTitle.data;
  let error = selectWithTitle.error;

  if (error && isMissingTitleColumn(error)) {
    const fallback = await supabase
      .from("class_game_assignments")
      .select("id, game_id, settings, assigned_at")
      .eq("class_id", classId)
      .order("assigned_at", { ascending: true });
    data = fallback.data;
    error = fallback.error;
  }

  if (error) {
    if (isMissingSettingsColumn(error)) {
      throw new Error("SETTINGS_COLUMN_MISSING");
    }
    if (isMissingAssignmentsTable(error)) {
      throw new Error("ASSIGNMENTS_TABLE_MISSING");
    }
    throw new Error(error.message);
  }

  const countsByGame = new Map<string, number>();

  return (data ?? []).map((row) => {
    const gameId = row.game_id as string;
    const count = (countsByGame.get(gameId) ?? 0) + 1;
    countsByGame.set(gameId, count);
    const storedTitle =
      "title" in row && typeof row.title === "string" ? row.title.trim() : "";

    return {
      id: row.id as string,
      gameId,
      title: storedTitle || defaultAssignmentTitle(gameId, count),
      settings: normalizeAssignmentSettings(row.settings),
    };
  });
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

  const rows = assignments.map((assignment) => ({
    id: assignment.id,
    class_id: classId,
    game_id: assignment.gameId,
    title: assignment.title.trim() || null,
    assigned_by: assignedBy,
    settings: assignment.settings,
  }));

  const { error: insertError } = await supabase.from("class_game_assignments").insert(rows);

  if (insertError) {
    if (isMissingSettingsColumn(insertError)) {
      throw new Error("SETTINGS_COLUMN_MISSING");
    }
    if (isMissingTitleColumn(insertError)) {
      throw new Error("TITLE_COLUMN_MISSING");
    }
    if (isDuplicateAssignmentError(insertError)) {
      throw new Error("MULTIPLE_ASSIGNMENTS_SQL_REQUIRED");
    }
    throw new Error(insertError.message);
  }
}

export async function countGameAttempts(
  userId: string,
  assignmentId: string
): Promise<number> {
  const { count, error } = await supabase
    .from("game_attempts")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("assignment_id", assignmentId);

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
  assignmentId: string | null;
  score: number;
  questionCount: number;
}): Promise<void> {
  const { error } = await supabase.from("game_attempts").insert({
    user_id: params.userId,
    game_id: params.gameId,
    class_id: params.classId,
    assignment_id: params.assignmentId,
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
  const assignmentId = row.assignment_id ?? row.assignmentId;
  return {
    id: String(row.id),
    userId: String(row.user_id ?? row.userId),
    gameId: String(row.game_id ?? row.gameId),
    assignmentId: assignmentId ? String(assignmentId) : null,
    score: Number(row.score ?? 0),
    questionCount: Number(row.question_count ?? row.questionCount ?? 0),
    createdAt: String(completedAt ?? ""),
  };
}

export async function fetchClassGameScores(
  classId: string,
  studentUserIds: string[],
  assignments: ClassGameAssignmentRow[]
): Promise<GameAttemptSummary[]> {
  if (studentUserIds.length === 0 || assignments.length === 0) {
    return [];
  }

  const assignmentIds = assignments.map((assignment) => assignment.id);
  const assignedGameIds = [...new Set(assignments.map((assignment) => assignment.gameId))];

  const { data: rpcData, error: rpcError } = await supabase.rpc("get_teacher_class_game_scores", {
    p_class_id: classId,
  });

  if (!rpcError && Array.isArray(rpcData)) {
    return (rpcData as Record<string, unknown>[])
      .map(mapAttemptRow)
      .filter((attempt) => {
        if (!studentUserIds.includes(attempt.userId)) {
          return false;
        }
        if (attempt.assignmentId) {
          return assignmentIds.includes(attempt.assignmentId);
        }
        return assignedGameIds.includes(attempt.gameId);
      });
  }

  if (rpcError && !isMissingScoresRpc(rpcError)) {
    throw new Error(`Could not load game scores: ${rpcError.message}`);
  }

  const { data, error } = await supabase
    .from("game_attempts")
    .select("id, user_id, game_id, assignment_id, score, question_count, completed_at")
    .in("user_id", studentUserIds)
    .or(`class_id.eq.${classId},class_id.is.null`)
    .order("completed_at", { ascending: false });

  if (error) {
    if (isMissingAttemptsTable(error)) {
      return [];
    }
    throw new Error(`Could not load game scores: ${error.message}`);
  }

  return (data ?? [])
    .map((row) => mapAttemptRow(row as Record<string, unknown>))
    .filter((attempt) => {
      if (attempt.assignmentId) {
        return assignmentIds.includes(attempt.assignmentId);
      }
      return assignedGameIds.includes(attempt.gameId);
    });
}

export type StudentAssignmentProgress = {
  assignmentId: string;
  title: string;
  gameId: string;
  tryCount: number;
  bestScore: number;
  bestTotal: number;
  latestScore: number;
  latestTotal: number;
  latestAt: string;
};

type AssignmentRef = {
  id: string;
  gameId: string;
};

function attemptMatchesAssignment(
  attempt: GameAttemptSummary,
  assignment: AssignmentRef,
  allAssignments: AssignmentRef[]
): boolean {
  const legacyGameAssignments = allAssignments.filter((row) => row.gameId === attempt.gameId);
  return attempt.assignmentId
    ? attempt.assignmentId === assignment.id
    : legacyGameAssignments.length === 1 &&
        legacyGameAssignments[0].id === assignment.id &&
        attempt.gameId === assignment.gameId;
}

function summarizeAttempts(attempts: GameAttemptSummary[]): Omit<
  StudentAssignmentProgress,
  "assignmentId" | "title" | "gameId"
> {
  if (attempts.length === 0) {
    return {
      tryCount: 0,
      bestScore: 0,
      bestTotal: 0,
      latestScore: 0,
      latestTotal: 0,
      latestAt: "",
    };
  }

  const sorted = [...attempts].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const latest = sorted[0];
  const best = attempts.reduce((top, attempt) => (attempt.score > top.score ? attempt : top));

  return {
    tryCount: attempts.length,
    bestScore: best.score,
    bestTotal: best.questionCount,
    latestScore: latest.score,
    latestTotal: latest.questionCount,
    latestAt: latest.createdAt,
  };
}

export function formatStudentTriesLabel(tryCount: number, maxTries: number | null): string {
  if (maxTries === null) {
    return tryCount === 1 ? "1 try" : `${tryCount} tries`;
  }
  return `${tryCount} / ${maxTries} ${maxTries === 1 ? "try" : "tries"}`;
}

export async function fetchStudentAssignmentProgress(
  userId: string,
  assignments: StudentGameAssignment[]
): Promise<StudentAssignmentProgress[]> {
  if (assignments.length === 0) {
    return [];
  }

  const { data, error } = await supabase
    .from("game_attempts")
    .select("id, user_id, game_id, assignment_id, score, question_count, completed_at")
    .eq("user_id", userId)
    .order("completed_at", { ascending: false });

  if (error) {
    if (isMissingAttemptsTable(error)) {
      return assignments.map((assignment) => ({
        assignmentId: assignment.assignmentId,
        title: assignment.title,
        gameId: assignment.gameId,
        tryCount: 0,
        bestScore: 0,
        bestTotal: 0,
        latestScore: 0,
        latestTotal: 0,
        latestAt: "",
      }));
    }
    throw new Error(`Could not load your scores: ${error.message}`);
  }

  const attempts = (data ?? []).map((row) => mapAttemptRow(row as Record<string, unknown>));
  const refs = assignments.map((assignment) => ({
    id: assignment.assignmentId,
    gameId: assignment.gameId,
  }));

  return assignments.map((assignment) => {
    const matched = attempts.filter((attempt) =>
      attemptMatchesAssignment(
        attempt,
        { id: assignment.assignmentId, gameId: assignment.gameId },
        refs
      )
    );

    return {
      assignmentId: assignment.assignmentId,
      title: assignment.title,
      gameId: assignment.gameId,
      ...summarizeAttempts(matched),
    };
  });
}

export function buildClassGameScoreSections(
  attempts: GameAttemptSummary[],
  assignments: ClassGameAssignmentRow[],
  roster: { userId: string; displayName: string }[]
): ClassGameScoreSection[] {
  const nameByUserId = new Map(roster.map((student) => [student.userId, student.displayName]));

  return assignments.map((assignment) => {
    const byStudent = new Map<string, GameAttemptSummary[]>();

    for (const attempt of attempts) {
      if (
        !attemptMatchesAssignment(
          attempt,
          { id: assignment.id, gameId: assignment.gameId },
          assignments
        )
      ) {
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

      const summary = summarizeAttempts(studentAttempts);

      return {
        userId: student.userId,
        displayName: nameByUserId.get(student.userId) ?? student.displayName,
        ...summary,
      };
    });

    rows.sort((a, b) => {
      if (b.bestScore !== a.bestScore) {
        return b.bestScore - a.bestScore;
      }
      return a.displayName.localeCompare(b.displayName);
    });

    return {
      assignmentId: assignment.id,
      gameId: assignment.gameId,
      gameTitle: assignment.title,
      rows,
    };
  });
}

export async function resolveGamePlayConfig(
  user: User,
  gameId: string,
  assignmentId: string | null
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
      assignmentId: null,
      assignmentTitle: null,
    };
  }

  const studentAssignments = await fetchStudentAssignments(user.id);
  const assignment = assignmentId
    ? studentAssignments.find(
        (row) => row.assignmentId === assignmentId && row.gameId === gameId
      )
    : undefined;

  if (!assignment) {
    return {
      settings: clampSettingsForGame({ ...DEFAULT_ASSIGNMENT_SETTINGS }, maxQuestions),
      attemptsUsed: 0,
      canStart: false,
      isTeacherPreview: false,
      classId: null,
      assignmentId: null,
      assignmentTitle: null,
    };
  }

  const settings = clampSettingsForGame(assignment.settings, maxQuestions);
  const attemptsUsed = await countGameAttempts(user.id, assignment.assignmentId);
  const canStart = settings.maxTries === null || attemptsUsed < settings.maxTries;

  return {
    settings,
    attemptsUsed,
    canStart,
    isTeacherPreview: false,
    classId: assignment.classId,
    assignmentId: assignment.assignmentId,
    assignmentTitle: assignment.title,
  };
}
