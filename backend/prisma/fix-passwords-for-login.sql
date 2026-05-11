/*
  Utility script to fix login credentials in environments where
  password hashes were inserted incorrectly (non-bcrypt values).

  Steps:
  1) Generate a bcrypt hash from backend/scripts/gen-bcrypt.js
  2) Replace <BCRYPT_HASH_FOR_PASSWORD> below
*/

-- HOD user
UPDATE dbo.[User]
SET passwordHash = '<BCRYPT_HASH_FOR_PASSWORD>'
WHERE email = 'hod@company.com';

-- Designer user
UPDATE dbo.[User]
SET passwordHash = '<BCRYPT_HASH_FOR_PASSWORD>'
WHERE email = 'designer@company.com';
