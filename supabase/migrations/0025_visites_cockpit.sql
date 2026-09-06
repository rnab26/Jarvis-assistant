-- La dernière fois que Raphaël a regardé son cockpit — par COMPTE, pas par écran.
--
-- Chantier ae0f3a7b. `jarvis_cockpit_vu` vivait dans le localStorage, avec pour
-- raison écrite « la retrouver sur un autre appareil n'aurait aucun sens ».
-- Cette raison est fausse pour lui : il utilise l'app ET le site, souvent dans
-- la même matinée. Il appuyait sur « Vu » sur le téléphone, et le site lui
-- réannonçait les quatorze mêmes chantiers livrés.
--
-- POURQUOI PAS DANS `reglages` : ce n'est pas une préférence. Une clé de
-- `REGLAGES` doit avoir un contrôle dans Paramètres (`verifier-reglages.ts` le
-- refuse sinon), et un réglage « date de ta dernière visite » n'aurait aucun
-- sens à l'écran. D'où sa propre table, minuscule : une ligne par compte.

create table if not exists public.visites_cockpit (
  user_id uuid primary key references auth.users (id) on delete cascade,
  vu_at timestamptz not null,
  updated_at timestamptz not null default now()
);

alter table public.visites_cockpit enable row level security;

drop policy if exists "visite: la sienne" on public.visites_cockpit;
create policy "visite: la sienne" on public.visites_cockpit
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Poser la visite est une écriture, jamais une lecture qui écrirait au passage :
-- appelée UNIQUEMENT quand il appuie sur « Vu ». Le repère ne recule jamais —
-- deux écrans ouverts en même temps, celui qu'on quitte en dernier ne doit pas
-- réannoncer ce que l'autre a déjà montré comme vu.
create or replace function public.marquer_cockpit_vu(p_vu_at timestamptz default now())
returns timestamptz language plpgsql security definer set search_path = public as $$
declare v_final timestamptz;
begin
  insert into public.visites_cockpit (user_id, vu_at)
  values (auth.uid(), p_vu_at)
  on conflict (user_id) do update
    set vu_at = greatest(public.visites_cockpit.vu_at, excluded.vu_at),
        updated_at = now()
  returning vu_at into v_final;
  return v_final;
end;
$$;
