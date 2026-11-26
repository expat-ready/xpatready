-- Rollback of 20261126100000_platform__pf4bs_sign_in_lookup (PF-4bs part 2a). Run only with the code before PF-4bs part 2a, since
-- the local sign-in adapter calls this function.
DROP FUNCTION IF EXISTS platform_staff_of_email(text);
