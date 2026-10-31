-- The seeded stories move from the old iOS blues to the violet palette of the
-- latest App Store screenshots. Only the seeded rows change, and only while they
-- still carry the original colour, so stories edited by hand keep theirs.

update stories set accent_hex = '5C48DF' where accent_hex = '0057FF' and id in ('10000000-0000-4000-8000-000000000004', '20000000-0000-4000-8000-000000000004');
update stories set accent_hex = '7F6EF0' where accent_hex = '2F7CF6' and id in ('10000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-000000000003');

alter table stories alter column accent_hex set default '5C48DF';
