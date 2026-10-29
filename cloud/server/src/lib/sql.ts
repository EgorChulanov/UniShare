// Reusable SQL fragments for visibility rules.

/** True when $me and the given user column are separated by a block (either direction). */
export const blockedPair = (me: string, other: string) => `exists (
  select 1 from blocks b
  where (b.blocker_id = ${me} and b.blocked_id = ${other})
     or (b.blocker_id = ${other} and b.blocked_id = ${me})
)`;

/** Columns of a chat row from the caller's perspective ($1 = caller uid). */
export const CHAT_PERSPECTIVE = `
  c.id, c.chat_type, c.last_message, c.last_message_at, c.last_sender_id, c.created_at,
  case when c.user_low = $1 then c.user_high else c.user_low end as partner_id,
  case when c.user_low = $1 then c.unread_low else c.unread_high end as unread`;
