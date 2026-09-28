-- Database-level guarantees that back up the application logic.

-- Each booking type must carry exactly the fields it needs.
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_shape_chk" CHECK (
  (type = 'ONE_TIME' AND start_at IS NOT NULL AND end_at IS NOT NULL AND end_at > start_at
     AND start_date IS NULL AND daily_start_minute IS NULL AND daily_end_minute IS NULL)
  OR
  (type = 'MONTHLY' AND start_date IS NOT NULL AND daily_start_minute IS NOT NULL AND daily_end_minute IS NOT NULL
     AND daily_start_minute >= 0 AND daily_end_minute <= 1440 AND daily_end_minute > daily_start_minute
     AND start_at IS NULL AND end_at IS NULL)
);--> statement-breakpoint

ALTER TABLE "bookings" ADD CONSTRAINT "bookings_amounts_chk" CHECK (price_rupees >= 0 AND fee_rupees >= 0);--> statement-breakpoint

-- Backstop against double-booking: no two active one-time bookings for the
-- same worker may overlap in time. Enforced by Postgres even if two requests
-- race past the application check.
CREATE EXTENSION IF NOT EXISTS btree_gist;--> statement-breakpoint

ALTER TABLE "bookings" ADD CONSTRAINT "bookings_no_overlap_excl"
  EXCLUDE USING gist (
    worker_id WITH =,
    tstzrange(start_at, end_at, '[)') WITH &&
  ) WHERE (type = 'ONE_TIME' AND status IN ('REQUESTED', 'CONFIRMED'));
