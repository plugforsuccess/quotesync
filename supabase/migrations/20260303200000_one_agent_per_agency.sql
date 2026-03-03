-- Enforce one agent (principal) per agency
CREATE UNIQUE INDEX IF NOT EXISTS one_agent_per_agency 
ON agency_memberships (agency_id) 
WHERE agency_role = 'agent';
