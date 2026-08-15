select r.id,
       r.created_at,
       r.reason,
       r.details,
       r.state,
       reporter.username as reporter,
       subject.username as reported_user
from public.reports r
join public.users reporter on reporter.uid = r.reporter_id
join public.users subject on subject.uid = r.subject_id
order by r.created_at desc
limit 200;
