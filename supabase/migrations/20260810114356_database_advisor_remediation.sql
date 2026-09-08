create index if not exists blocks_blocked_id_idx on public.blocks (blocked_id);
create index if not exists device_tokens_user_id_idx on public.device_tokens (user_id);
create index if not exists reports_subject_id_idx on public.reports (subject_id);
create index if not exists reviews_chat_id_idx on public.reviews (chat_id);
create index if not exists story_views_user_id_idx on public.story_views (user_id);
create index if not exists swipe_decisions_target_id_idx on public.swipe_decisions (target_id);

alter policy messages_send_members on public.messages
with check (sender_id = (select auth.uid()) and public.is_chat_member(chat_id));

alter policy users_read_visible on public.users
using (
    uid = (select auth.uid())
    or (
        onboarding_complete
        and account_state = 'active'
        and not public.is_blocked_pair(uid)
    )
);
alter policy users_create_self on public.users
with check (
    uid = (select auth.uid())
    and rating = 0
    and review_count = 0
    and account_state = 'active'
);
alter policy users_update_self on public.users
using (uid = (select auth.uid()))
with check (uid = (select auth.uid()));

alter policy likes_read_participants on public.like_requests
using ((select auth.uid()) in (from_uid, to_uid));
alter policy likes_delete_participants on public.like_requests
using ((select auth.uid()) in (from_uid, to_uid));

alter policy reviews_create_after_chat on public.reviews
with check (
    from_uid = (select auth.uid())
    and public.can_review(to_uid, chat_id)
);

alter policy story_views_read_self on public.story_views
using (user_id = (select auth.uid()));
alter policy story_views_create_self on public.story_views
with check (user_id = (select auth.uid()));
alter policy story_views_update_self on public.story_views
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

alter policy blocks_read_self on public.blocks
using (blocker_id = (select auth.uid()));
alter policy blocks_create_self on public.blocks
with check (blocker_id = (select auth.uid()));
alter policy blocks_delete_self on public.blocks
using (blocker_id = (select auth.uid()));

alter policy reports_create_self on public.reports
with check (reporter_id = (select auth.uid()));
alter policy reports_read_self on public.reports
using (reporter_id = (select auth.uid()));

alter policy device_tokens_manage_self on public.device_tokens
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

alter policy swipe_decisions_manage_self on public.swipe_decisions
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));
