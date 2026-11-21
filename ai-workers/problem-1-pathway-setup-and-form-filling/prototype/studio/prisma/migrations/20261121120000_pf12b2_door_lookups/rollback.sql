-- Rollback of 20261121120000_pf12b2_door_lookups (PF-12b part 2). Run only with the code before PF-12b part 2 (the
-- seven doors back on BYPASS_USES), since the doors call these functions.
DROP FUNCTION IF EXISTS platform_firm_of_key(text), platform_staff_firm(uuid, text), platform_invitation_firm(text), platform_staff_email_taken(text),
  fo_sales_web_form_firm(text), fo_booking_token_firm(uuid, text), platform_web_address_firm(text, timestamptz);
