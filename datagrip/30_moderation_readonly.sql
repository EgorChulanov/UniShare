-- Последние 200 жалоб. Запрос только читает данные.
select r.id,
       r.created_at as "дата_жалобы",
       r.reason as "причина",
       r.details as "подробности",
       r.state as "состояние",
       reporter.username as "кто_пожаловался",
       subject.username as "на_кого_пожаловались"
from public.reports r
join public.users reporter on reporter.uid = r.reporter_id
join public.users subject on subject.uid = r.subject_id
order by r.created_at desc
limit 200;
