# PF-4bc challenge: two-step state read from Cognito per staff row (review M2, round 1)

**Fact.** `staff-read/service.ts` (PF-4b) asks `IdentityAdminPort.twoStep` for every row of the Team list, and for a person's panel and My account. On `local` that costs nothing. On `cognito` (PF-4bc), each row is a Cognito request: AdminGetUserAuthFactors, or two requests when our stored `sub` is stale. STANDARDS.md says "no N+1; one request per screen view, not per row", and the first view should take about 1 s (D15).

**What this PR does about it (stop-gap).** In the usual case a read is one request per person. At most 4 run at a time per server, and each has a 1.5 s deadline. A refused or late read shows "unknown" (staff-read already turns the port's problem into `null`), so the list itself never fails. The test is "ten Team rows read with one Cognito request each, at most 4 at a time". A 40-person firm on a 100 ms Cognito still costs about 1 s, and more when Cognito is slow.

**Recommendation (a new row for the tech lead).** Keep each person's two-step state on `platform_staff`: a `two_step_method` column, written when they enrol (at the Cognito sign-in callback, the R1.5 follow-up row) and when it is reset (`resetTwoStep`, already in a transaction). The list then reads it with the staff query, with no provider call per row. A daily reconcile job could compare it with Cognito. This needs a schema change, so it is out of PF-4bc's scope.

**Not known.** Cognito's own request quota for AdminGetUserAuthFactors (the AWS quota pages were not opened from the cloud network).
