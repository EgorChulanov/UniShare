-- Postgres grants EXECUTE on new functions to PUBLIC by default. Keep the
-- Data API surface explicit so anonymous callers cannot invoke privileged RPCs.
do $$
declare
    function_signature regprocedure;
begin
    for function_signature in
        select p.oid::regprocedure
        from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public'
          and p.proname = any(array[
              'accept_like_request',
              'assert_content_allowed',
              'can_review',
              'chat_id_from_storage_path',
              'create_or_get_chat',
              'enforce_user_write_rate_limit',
              'get_feed_profiles',
              'is_blocked_pair',
              'is_chat_member',
              'mark_chat_read',
              'moderate_user_content',
              'protect_chat_identity',
              'protect_message_content',
              'protect_new_message',
              'protect_user_managed_columns',
              'purge_own_storage',
              'recalculate_user_rating',
              'record_swipe',
              'register_device_token',
              'rls_auto_enable',
              'sanitize_profile_subscriptions',
              'sanitize_subscription_metadata',
              'send_chat_message',
              'send_like',
              'touch_updated_at',
              'undo_dislike',
              'unregister_device_token'
          ])
    loop
        execute format(
            'revoke all on function %s from public, anon, authenticated, service_role',
            function_signature
        );
    end loop;
end;
$$;

grant execute on function public.is_blocked_pair(uuid) to authenticated, service_role;
grant execute on function public.is_chat_member(uuid) to authenticated, service_role;
grant execute on function public.can_review(uuid, uuid) to authenticated, service_role;
grant execute on function public.chat_id_from_storage_path(text) to authenticated, service_role;

grant execute on function public.send_like(uuid, text, text) to authenticated, service_role;
grant execute on function public.accept_like_request(text) to authenticated, service_role;
grant execute on function public.send_chat_message(text, uuid, text, text) to authenticated, service_role;
grant execute on function public.mark_chat_read(uuid) to authenticated, service_role;
grant execute on function public.record_swipe(uuid, text, text) to authenticated, service_role;
grant execute on function public.undo_dislike(uuid, text) to authenticated, service_role;
grant execute on function public.get_feed_profiles(text, integer) to authenticated, service_role;
grant execute on function public.purge_own_storage() to authenticated, service_role;
grant execute on function public.register_device_token(text, text) to authenticated, service_role;
grant execute on function public.unregister_device_token(text) to authenticated, service_role;

alter default privileges in schema public
revoke execute on functions from public, anon, authenticated, service_role;
