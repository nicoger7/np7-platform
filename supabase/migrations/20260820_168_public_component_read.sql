-- ============================================================================
-- 168 — Die Paketkarte war IMMER leer: RLS ließ anon nicht an die Komponenten.
--
-- Die öffentliche Experience-Seite liest mit dem Anon-Key. exp_components und
-- exp_package_components hatten nur Team-SELECT-Policies, also lieferte das
-- Embed für anon STILL UND LEISE null Zeilen — die Karte fiel auf die eine
-- Member-Area-Zeile zurück, egal wie korrekt die Daten waren. Drei Fix-Runden
-- gingen an den Daten vorbei, weil der Fehler in der Sichtbarkeit lag.
--
-- Additive Policies: anon sieht nur website-markierte Zuordnungen und aktive
-- Komponenten. Spaltenrechte schützen die Kalkulation: unit_cost/sell_price
-- bleiben für anon unlesbar.
-- ============================================================================

do $$ begin
  if not exists (select 1 from pg_policies where tablename='exp_package_components'
                 and policyname='Public can view website component links') then
    create policy "Public can view website component links"
      on exp_package_components for select using (show_on_website = true);
  end if;
  if not exists (select 1 from pg_policies where tablename='exp_components'
                 and policyname='Public can view active components') then
    create policy "Public can view active components"
      on exp_components for select using (archived_at is null);
  end if;
end $$;

revoke select on exp_components from anon;
grant select (id, name, description, category, hotel_id, room_type, addon_available)
  on exp_components to anon;
