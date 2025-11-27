-- Re-create the function with the correct search_path setting
-- This is a security best practice for SECURITY DEFINER functions and fixes the schema access issue.
CREATE OR REPLACE FUNCTION public.trigger_auto_run_automation()
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  secret_value text;
  request_id bigint;
  url text;
BEGIN
  -- Get the secret from the vault. This requires the function to be SECURITY DEFINER.
  secret_value := supabase_vault.get_secret('CRON_SECRET');

  -- Check if the secret was retrieved successfully
  IF secret_value IS NULL THEN
    RAISE EXCEPTION 'CRON_SECRET not found in Supabase Vault.';
  END IF;

  -- Construct the URL for the Edge Function using the project ID
  url := 'https://hfmpmrlwduhtegkjaclu.supabase.co/functions/v1/auto-run-automation';

  -- Perform the HTTP POST request using the http extension
  SELECT
    id
  INTO
    request_id
  FROM
    extensions.http_post(
      url,
      '{}', -- Empty JSON body
      '{}', -- Empty params
      -- Set the Authorization header using the retrieved secret
      '{"Authorization": "Bearer ' || secret_value || '", "Content-Type": "application/json"}'
    );

  -- Return the request ID for logging in the cron job history
  RETURN request_id;
END;
$$;