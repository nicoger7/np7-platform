-- 253 · Let a destination hide the modelled wind chart
--
-- The chart is drawn from a coarse weather model, and for a thermal spot the
-- model is simply wrong: Lake Garda's Ora blows nearly every summer afternoon,
-- while the model reads a quarter of daytime hours (Nico, 20 Sep 2026: "garda
-- still showing the shitty windforecast").
--
-- statsAreBlind() already hides the chart where the model says almost nothing,
-- but Garda clears that bar (67% in June on the accelerated series) while still
-- describing the wrong place. A second guess would not fix a guess. This is a
-- switch: whoever knows the spot decides whether the chart tells the truth
-- about it, and the hand-written wind copy stands on its own when it does not.
--
-- Default true: every destination keeps its chart until someone turns it off.

alter table destinations
  add column if not exists show_wind_chart boolean not null default true;

comment on column destinations.show_wind_chart is
  'Whether the modelled wind chart is shown on the public destination page. Turn it off where the model misreads the spot (thermal winds, wind-acceleration zones). The hand-typed season/wind/conditions text is shown either way.';

-- Lake Garda is the reason this column exists.
update destinations set show_wind_chart = false where slug = 'lake-garda';
