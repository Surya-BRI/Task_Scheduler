/*
  Run this in SSMS against your ERP-Dev (or task DB) if login returns 401.
  The earlier hand-written SQL used a placeholder bcrypt string that did not match Secret123!

  Password for both users after this script: Secret123!
  Hash generated with bcrypt cost 10 (same as Nest auth).
*/

DECLARE @Hash NVARCHAR(255) = N'$2b$10$9T53IuWEsDiFkqQeEwZgwO/6GzBVwBRZU1e8gpw8GJ0CDVFc2A9L.';

UPDATE dbo.[User]
SET [passwordHash] = @Hash
WHERE [email] IN (N'hod@company.com', N'designer@company.com');
