-- Journal: how far a trade went in your favor, and where it stood at the end of the day.
-- best_price: the best price reached after entry without being stopped out first
--             (highest for a LONG, lowest for a SHORT) — "max" in the trade-journal lesson.
-- eod_price:  the end-of-day price while still in the trade; the stop price if it was stopped out.
-- Both are optional and only feed analysis (max R, EOD R, theoretical target R). Safe to run more than once.

alter table trades add column if not exists best_price numeric(16,4);
alter table trades add column if not exists eod_price  numeric(16,4);

do $$ begin
  alter table trades add constraint best_price_positive check (best_price is null or best_price > 0);
exception when duplicate_object then null; end $$;

do $$ begin
  alter table trades add constraint eod_price_positive check (eod_price is null or eod_price > 0);
exception when duplicate_object then null; end $$;

-- The best price can't be on the losing side of entry.
do $$ begin
  alter table trades add constraint best_price_side check (
    best_price is null or
    (direction = 'LONG'  and best_price >= entry_price) or
    (direction = 'SHORT' and best_price <= entry_price)
  );
exception when duplicate_object then null; end $$;
