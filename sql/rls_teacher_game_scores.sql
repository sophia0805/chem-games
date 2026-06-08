-- Run in Supabase SQL Editor if teachers cannot load game scores from My Classes.

-- Teachers can read attempts from students enrolled in their classes.
drop policy if exists "Teachers can read attempts for students in their classes" on public.game_attempts;
create policy "Teachers can read attempts for students in their classes"
on public.game_attempts
for select
to authenticated
using (
  exists (
    select 1
    from public.class_memberships cm
    join public.classes c on c.id = cm.class_id
    where cm.user_id = game_attempts.user_id
      and cm.role = 'student'
      and c.teacher_id = auth.uid()
  )
);

-- Optional RPC used by the app (falls back to direct query if missing).
create or replace function public.get_teacher_class_game_scores(p_class_id uuid)
returns table (
  id uuid,
  user_id uuid,
  game_id text,
  score integer,
  question_count integer,
  completed_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select ga.id, ga.user_id, ga.game_id, ga.score, ga.question_count, ga.completed_at
  from public.game_attempts ga
  join public.class_memberships cm on cm.user_id = ga.user_id and cm.role = 'student'
  join public.classes c on c.id = cm.class_id
  where cm.class_id = p_class_id
    and c.teacher_id = auth.uid()
    and (ga.class_id = p_class_id or ga.class_id is null)
  order by ga.completed_at desc;
$$;

grant execute on function public.get_teacher_class_game_scores(uuid) to authenticated;
