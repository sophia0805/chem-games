import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "./supabaseClient";

export type ClassInfo = {
  id: string;
  name: string;
  join_code: string;
  teacher_id: string;
  is_active: boolean;
  created_at: string;
};

export type ClassCard = {
  classInfo: ClassInfo;
  membershipRole: "teacher" | "student" | null;
  canManage: boolean;
};

export type ProfileSnippet = {
  id: string;
  first_name: string | null;
  last_name: string | null;
};

type RosterMembershipRow = {
  class_id: string;
  user_id: string;
  joined_at: string;
};

export type RosterStudent = {
  userId: string;
  joinedAt: string;
  displayName: string;
};

type RpcRosterRow = {
  class_id: string;
  user_id: string;
  joined_at: string;
  first_name: string | null;
  last_name: string | null;
};

export type ClassWorkspace = {
  classInfo: ClassInfo;
  membershipRole: "teacher" | "student" | null;
  canManage: boolean;
  roster: RosterStudent[];
};

function displayNameFromProfile(p: ProfileSnippet | null | undefined): string {
  if (!p) {
    return "Student";
  }
  const full = [p.first_name, p.last_name]
    .map((s) => (s ?? "").trim())
    .filter(Boolean)
    .join(" ");
  return full || "Student";
}

function isMissingRpcError(err: { code?: string; message?: string } | null): boolean {
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

export async function fetchTeacherRosters(
  client: SupabaseClient,
  teacherClassIds: string[]
): Promise<{ grouped: Record<string, RosterStudent[]>; error: string }> {
  if (teacherClassIds.length === 0) {
    return { grouped: {}, error: "" };
  }

  const { data: rpcData, error: rpcError } = await client.rpc("get_teacher_class_rosters");

  if (!rpcError && Array.isArray(rpcData)) {
    const grouped: Record<string, RosterStudent[]> = {};
    for (const row of rpcData as RpcRosterRow[]) {
      const cid = String(row.class_id);
      const list = grouped[cid] ?? [];
      list.push({
        userId: String(row.user_id),
        joinedAt: row.joined_at,
        displayName: displayNameFromProfile({
          id: String(row.user_id),
          first_name: row.first_name,
          last_name: row.last_name,
        }),
      });
      grouped[cid] = list;
    }
    return { grouped, error: "" };
  }

  if (rpcError && !isMissingRpcError(rpcError)) {
    return {
      grouped: {},
      error: `Could not load student lists: ${rpcError.message}`,
    };
  }

  const { data: rosterData, error: rosterQueryError } = await client
    .from("class_memberships")
    .select("class_id, user_id, joined_at")
    .in("class_id", teacherClassIds)
    .eq("role", "student")
    .order("joined_at", { ascending: true });

  if (rosterQueryError) {
    return {
      grouped: {},
      error: `Could not load student lists: ${rosterQueryError.message}`,
    };
  }

  const memberships = (rosterData as RosterMembershipRow[]) ?? [];
  const studentIds = [...new Set(memberships.map((m) => m.user_id))];

  const profileById = new Map<string, ProfileSnippet>();
  if (studentIds.length > 0) {
    const { data: profilesData, error: profilesError } = await client
      .from("profiles")
      .select("id, first_name, last_name")
      .in("id", studentIds);

    if (profilesError) {
      return {
        grouped: {},
        error: `Could not load student lists: ${profilesError.message}`,
      };
    }
    for (const row of (profilesData as ProfileSnippet[]) ?? []) {
      profileById.set(row.id, row);
    }
  }

  const grouped: Record<string, RosterStudent[]> = {};
  for (const r of memberships) {
    const list = grouped[r.class_id] ?? [];
    list.push({
      userId: r.user_id,
      joinedAt: r.joined_at,
      displayName: displayNameFromProfile(profileById.get(r.user_id)),
    });
    grouped[r.class_id] = list;
  }
  return { grouped, error: "" };
}

export async function loadClassCards(userId: string): Promise<ClassCard[]> {
  const [{ data: memberships, error: membershipError }, { data: ownedClasses, error: ownedError }] =
    await Promise.all([
      supabase.from("class_memberships").select("class_id, role").eq("user_id", userId),
      supabase
        .from("classes")
        .select("id, name, join_code, teacher_id, is_active, created_at")
        .eq("teacher_id", userId),
    ]);

  if (membershipError) {
    throw new Error(`Could not load class memberships: ${membershipError.message}`);
  }
  if (ownedError) {
    throw new Error(`Could not load your classes: ${ownedError.message}`);
  }

  const membershipByClassId = new Map<string, "teacher" | "student">();
  for (const row of memberships ?? []) {
    membershipByClassId.set(row.class_id as string, row.role as "teacher" | "student");
  }

  const classMap = new Map<string, ClassInfo>();
  for (const row of ownedClasses ?? []) {
    classMap.set(row.id as string, row as ClassInfo);
  }

  const membershipOnlyIds = [...membershipByClassId.keys()].filter((id) => !classMap.has(id));
  if (membershipOnlyIds.length > 0) {
    const { data: memberClasses, error: memberClassesError } = await supabase
      .from("classes")
      .select("id, name, join_code, teacher_id, is_active, created_at")
      .in("id", membershipOnlyIds);

    if (memberClassesError) {
      throw new Error(`Could not load class details: ${memberClassesError.message}`);
    }
    for (const row of memberClasses ?? []) {
      classMap.set(row.id as string, row as ClassInfo);
    }
  }

  const cards: ClassCard[] = [];
  for (const classInfo of classMap.values()) {
    const membershipRole = membershipByClassId.get(classInfo.id) ?? null;
    const canManage = classInfo.teacher_id === userId;
    cards.push({ classInfo, membershipRole, canManage });
  }

  cards.sort((a, b) => b.classInfo.created_at.localeCompare(a.classInfo.created_at));
  return cards;
}

export async function loadClassWorkspace(
  classId: string,
  userId: string
): Promise<ClassWorkspace | null> {
  const { data: classRow, error: classError } = await supabase
    .from("classes")
    .select("id, name, join_code, teacher_id, is_active, created_at")
    .eq("id", classId)
    .maybeSingle();

  if (classError) {
    throw new Error(`Could not load class: ${classError.message}`);
  }
  if (!classRow) {
    return null;
  }

  const classInfo = classRow as ClassInfo;
  const isOwner = classInfo.teacher_id === userId;

  const { data: membership, error: membershipError } = await supabase
    .from("class_memberships")
    .select("role")
    .eq("class_id", classId)
    .eq("user_id", userId)
    .maybeSingle();

  if (membershipError) {
    throw new Error(`Could not load class membership: ${membershipError.message}`);
  }

  if (!isOwner && !membership) {
    return null;
  }

  const membershipRole = (membership?.role as "teacher" | "student" | undefined) ?? null;
  const canManage = isOwner;

  let roster: RosterStudent[] = [];
  if (canManage) {
    const { grouped, error } = await fetchTeacherRosters(supabase, [classId]);
    if (error) {
      throw new Error(error);
    }
    roster = grouped[classId] ?? [];
  }

  return {
    classInfo,
    membershipRole,
    canManage,
    roster,
  };
}
