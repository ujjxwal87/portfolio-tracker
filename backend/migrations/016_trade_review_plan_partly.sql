-- "Followed the plan?" gained a third answer, Partly. followed_plan stays true/false/NULL
-- (Yes / No / unanswered); plan_partly = TRUE marks Partly, with followed_plan left NULL.
ALTER TABLE portfolio_tracker.trade_reviews
    ADD COLUMN IF NOT EXISTS plan_partly BOOLEAN NOT NULL DEFAULT FALSE;
