-- WP-4A: Atomic rate-limit check-and-insert
--
-- Replaces the non-atomic SELECT-then-INSERT in rateLimiter.ts with a single
-- PL/pgSQL function. Without this, two concurrent requests that both arrive
-- just under the limit can both pass (TOCTOU race). The function serialises
-- per-key access with pg_advisory_xact_lock so only one request at a time
-- advances the counter for a given key.

CREATE OR REPLACE FUNCTION check_and_record_rate_limit(
  p_key          TEXT,
  p_window_start BIGINT,
  p_now          BIGINT,
  p_max          INT,
  p_ip_address   TEXT DEFAULT '',
  p_user_agent   TEXT DEFAULT ''
)
RETURNS TABLE(allowed BOOLEAN, current_count INT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count BIGINT;
BEGIN
  -- Serialise concurrent requests for the same key using an advisory lock.
  -- hashtext() maps the TEXT key to an INT4, which is what pg_advisory_xact_lock
  -- expects. The lock is released automatically when the transaction ends.
  PERFORM pg_advisory_xact_lock(hashtext(p_key));

  -- 1. Clean up expired entries for this key
  DELETE FROM rate_limit_entries
  WHERE key       = p_key
    AND timestamp < p_window_start;

  -- 2. Count remaining entries in the current window
  SELECT COUNT(*) INTO v_count
  FROM rate_limit_entries
  WHERE key       = p_key
    AND timestamp >= p_window_start;

  -- 3. Deny if already at or over the limit
  IF v_count >= p_max THEN
    RETURN QUERY SELECT false, v_count::INT;
    RETURN;
  END IF;

  -- 4. Record this request
  INSERT INTO rate_limit_entries (key, timestamp, ip_address, user_agent)
  VALUES (p_key, p_now, p_ip_address, p_user_agent);

  -- 5. Return allowed with the pre-insert count (caller can compute remaining = max - count - 1)
  RETURN QUERY SELECT true, v_count::INT;
END;
$$;

GRANT EXECUTE ON FUNCTION check_and_record_rate_limit(
  TEXT, BIGINT, BIGINT, INT, TEXT, TEXT
) TO authenticated, service_role, anon;
