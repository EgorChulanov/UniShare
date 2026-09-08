create table if not exists public.avatar_presets (
    id text primary key,
    category text not null check (category in ('playstation', 'nintendo', 'xbox', 'pc')),
    image_url text not null check (image_url like 'https://%'),
    sort_order integer not null default 0,
    license_name text not null,
    attribution_url text not null check (attribution_url like 'https://%'),
    is_official boolean not null default false,
    is_active boolean not null default true,
    created_at timestamptz not null default now()
);

alter table public.avatar_presets enable row level security;

drop policy if exists avatar_presets_read on public.avatar_presets;
create policy avatar_presets_read
on public.avatar_presets for select
to authenticated
using (is_active);

grant select on public.avatar_presets to authenticated;

insert into public.avatar_presets
    (id, category, image_url, sort_order, license_name, attribution_url, is_official)
select
    category || '-' || n,
    category,
    'https://api.dicebear.com/10.x/' || style || '/png?seed=UniShare-' || category || '-' || n || '&size=512&backgroundColor=' || background,
    category_order * 100 + n,
    license_name,
    attribution_url,
    false
from (
    values
        ('playstation', 'lorelei-neutral', 'dbeafe', 1, 'CC0 1.0', 'https://www.dicebear.com/styles/lorelei-neutral/'),
        ('nintendo', 'notionists-neutral', 'fee2e2', 2, 'CC0 1.0', 'https://www.dicebear.com/styles/notionists-neutral/'),
        ('xbox', 'bottts', 'dcfce7', 3, 'Free for personal and commercial use', 'https://www.dicebear.com/styles/bottts/'),
        ('pc', 'open-peeps', 'f3e8ff', 4, 'CC0 1.0', 'https://www.dicebear.com/styles/open-peeps/')
) as catalog(category, style, background, category_order, license_name, attribution_url)
cross join generate_series(1, 8) as n
on conflict (id) do update set
    image_url = excluded.image_url,
    sort_order = excluded.sort_order,
    license_name = excluded.license_name,
    attribution_url = excluded.attribution_url,
    is_official = excluded.is_official,
    is_active = true;

comment on table public.avatar_presets is
    'Curated non-official avatar catalog. Platform categories are navigation only and do not imply endorsement.';
