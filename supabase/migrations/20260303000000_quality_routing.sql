-- Migration: Add quality-based routing conditions to routing_rules
-- Extends the routing engine to support lead score and carrier-based routing

ALTER TABLE routing_rules ADD COLUMN IF NOT EXISTS min_score INTEGER;
ALTER TABLE routing_rules ADD COLUMN IF NOT EXISTS max_score INTEGER;
ALTER TABLE routing_rules ADD COLUMN IF NOT EXISTS carrier_filter TEXT;
ALTER TABLE routing_rules ADD COLUMN IF NOT EXISTS rule_type TEXT DEFAULT 'geographic';

COMMENT ON COLUMN routing_rules.min_score IS 'Minimum lead score for this rule to match (null = no minimum)';
COMMENT ON COLUMN routing_rules.max_score IS 'Maximum lead score for this rule to match (null = no maximum)';
COMMENT ON COLUMN routing_rules.carrier_filter IS 'Carrier value to match, e.g. "none" for no prior insurance (null = any carrier)';
COMMENT ON COLUMN routing_rules.rule_type IS 'Type of rule: geographic (state/ZIP), quality (score/carrier), or combined';
