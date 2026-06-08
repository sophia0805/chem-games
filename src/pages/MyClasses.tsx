import type { SupabaseClient } from "@supabase/supabase-js";
import { Link } from "react-router-dom";
import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import ClassGameAssignments from "../components/ClassGameAssignments";
import ClassGameScores from "../components/ClassGameScores";
import { supabase } from "../lib/supabaseClient";

type ClassInfo = {
  id: string;
  name: string;
  join_code: string;
  teacher_id: string;
  is_active: boolean;
  created_at: string;
};

type ClassCard = {
  classInfo: ClassInfo;
  membershipRole: "teacher" | "student" | null;
  canManage: boolean;
};

type ProfileSnippet = {
  id: string;
  first_name: string | null;
  last_name: string | null;
};

type RosterMembershipRow = {
  class_id: string;
  user_id: string;
  joined_at: string;
};

type RosterStudent = {
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

async function fetchTeacherRosters(
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

async function loadClassCards(userId: string): Promise<ClassCard[]> {
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

export default function MyClasses() {
  const { user } = useAuth();
  const [classCards, setClassCards] = useState<ClassCard[]>([]);
  const [rosters, setRosters] = useState<Record<string, RosterStudent[]>>({});
  const [accountRole, setAccountRole] = useState<"teacher" | "student" | "">("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [rosterError, setRosterError] = useState("");

  useEffect(() => {
    const loadClasses = async () => {
      if (!user) {
        setClassCards([]);
        setRosters({});
        setRosterError("");
        setAccountRole("");
        return;
      }

      setLoading(true);
      setError("");
      setRosterError("");

      try {
        const { data: profileData, error: profileError } = await supabase
          .from("profiles")
          .select("role")
          .eq("id", user.id)
          .maybeSingle();

        if (profileError) {
          throw new Error(`Could not load profile role: ${profileError.message}`);
        }

        setAccountRole((profileData?.role as "teacher" | "student" | null) ?? "");

        const cards = await loadClassCards(user.id);
        setClassCards(cards);

        const teacherClassIds = cards
          .filter((card) => card.canManage)
          .map((card) => card.classInfo.id);

        if (teacherClassIds.length === 0) {
          setRosters({});
        } else {
          const { grouped, error: rosterErr } = await fetchTeacherRosters(
            supabase,
            teacherClassIds
          );
          if (rosterErr) {
            setRosterError(rosterErr);
            setRosters({});
          } else {
            setRosters(grouped);
          }
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Could not load classes";
        setError(message);
        setClassCards([]);
        setRosters({});
      } finally {
        setLoading(false);
      }
    };

    void loadClasses();
  }, [user]);

  const hasTeacherClasses = classCards.some((card) => card.canManage);

  return (
    <main className="page">
      <p className="eyebrow">Class workspace</p>
      <h1>My Classes</h1>

      {!user ? <p>Please login to view your classes.</p> : null}

      {user ? (
        <div className="actions-row">
          {accountRole !== "student" ? (
            <Link className="button" to="/classes/create">
              Create Class
            </Link>
          ) : null}
          {accountRole !== "teacher" ? (
            <Link className="button button-secondary" to="/classes/join">
              Join Class
            </Link>
          ) : null}
        </div>
      ) : null}

      {user && accountRole === "teacher" && !hasTeacherClasses && !loading ? (
        <p className="class-assignments-hint">
          Create a class below, then open it to assign games to your students.
        </p>
      ) : null}

      {loading ? <p>Loading classes...</p> : null}
      {error ? <p className="error">{error}</p> : null}
      {rosterError ? <p className="error">{rosterError}</p> : null}

      {!loading && user && classCards.length === 0 ? (
        <p className="empty-state">No classes yet. Create one or join with a code.</p>
      ) : null}

      <div className="class-grid">
        {classCards.map((card) => {
          const { classInfo, membershipRole, canManage } = card;
          const roster = rosters[classInfo.id] ?? [];

          return (
            <div className="class-item" key={classInfo.id}>
              <h3>{classInfo.name}</h3>
              <p>Role: {membershipRole ?? (canManage ? "teacher (owner)" : "member")}</p>
              <p>Status: {classInfo.is_active ? "Active" : "Inactive"}</p>
              <p>Join code: {classInfo.join_code}</p>
              {canManage && user ? (
                <>
                  <ClassGameAssignments classId={classInfo.id} teacherId={user.id} />
                  <div className="class-roster">
                    <h4 className="class-roster-title">
                      Students in this class ({roster.length})
                    </h4>
                    {roster.length === 0 ? (
                      <p className="class-roster-empty">No students have joined yet.</p>
                    ) : (
                      <ul className="class-roster-list">
                        {roster.map((s) => (
                          <li key={s.userId}>
                            <span className="class-roster-name">{s.displayName}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <ClassGameScores classId={classInfo.id} roster={roster} />
                </>
              ) : null}
            </div>
          );
        })}
      </div>
    </main>
  );
}
