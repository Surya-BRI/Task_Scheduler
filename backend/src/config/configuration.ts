function buildDatabaseUrlFromParts(): string | undefined {
  const server = process.env.DB_SERVER;
  const port = process.env.DB_PORT ?? '1433';
  const database = process.env.DB_NAME;
  const user = process.env.DB_USER;
  const password = process.env.DB_PASSWORD;

  if (!server || !database || !user || !password) {
    return undefined;
  }

  const encrypt = process.env.DB_ENCRYPT ?? 'true';
  const trustServerCertificate = process.env.DB_TRUST_SERVER_CERTIFICATE ?? 'true';

  return `sqlserver://${server}:${port};database=${database};user=${user};password=${password};encrypt=${encrypt};trustServerCertificate=${trustServerCertificate}`;
}

export default () => {
  console.log('DB ENV CHECK:', {
    DB_SERVER: process.env.DB_SERVER,
    DB_PORT: process.env.DB_PORT,
    DB_NAME: process.env.DB_NAME,
    DB_USER: process.env.DB_USER,
    hasPassword: Boolean(process.env.DB_PASSWORD),
    DB_ENCRYPT: process.env.DB_ENCRYPT,
    DB_TRUST_SERVER_CERTIFICATE: process.env.DB_TRUST_SERVER_CERTIFICATE,
  });

  const dbUrl = process.env.DATABASE_URL ?? buildDatabaseUrlFromParts();

  console.log('[config] ENV loaded:');
  console.log('  NODE_ENV             :', process.env.NODE_ENV);
  console.log('  PORT                 :', process.env.PORT);
  console.log('  API_PREFIX           :', process.env.API_PREFIX);
  console.log('  CORS_ORIGIN          :', process.env.CORS_ORIGIN);
  console.log('  DATABASE_URL         :', process.env.DATABASE_URL);
  console.log('  DB_SERVER            :', process.env.DB_SERVER);
  console.log('  DB_PORT              :', process.env.DB_PORT);
  console.log('  DB_NAME              :', process.env.DB_NAME);
  console.log('  DB_USER              :', process.env.DB_USER);
  console.log('  DB_PASSWORD          :', process.env.DB_PASSWORD);
  console.log('  resolved DB URL      :', dbUrl);
  console.log('  LIVE_DATABASE_URL    :', process.env.LIVE_DATABASE_URL);
  console.log('  LIVE_DB_SERVER       :', process.env.LIVE_DB_SERVER);
  console.log('  LIVE_DB_NAME         :', process.env.LIVE_DB_NAME);
  console.log('  LIVE_DB_USER         :', process.env.LIVE_DB_USER);
  console.log('  LIVE_DB_PASSWORD     :', process.env.LIVE_DB_PASSWORD);
  console.log('  JWT_ACCESS_SECRET    :', process.env.JWT_ACCESS_SECRET);
  console.log('  JWT_ACCESS_EXPIRES_IN:', process.env.JWT_ACCESS_EXPIRES_IN);
  console.log('  AUTH_MODE            :', process.env.AUTH_MODE);
  console.log('  AWS_ACCESS_KEY_ID    :', process.env.AWS_ACCESS_KEY_ID);
  console.log('  AWS_SECRET_ACCESS_KEY:', process.env.AWS_SECRET_ACCESS_KEY);
  console.log('  AWS_REGION           :', process.env.AWS_REGION);
  console.log('  AWS_BUCKET           :', process.env.AWS_BUCKET);
  console.log('  AWS_FOLDER           :', process.env.AWS_FOLDER);

  return ({
  app: {
    port: Number(process.env.PORT ?? 7000),
    corsOrigin: process.env.CORS_ORIGIN ?? 'http://localhost:5000',
  },
  api: {
    prefix: process.env.API_PREFIX ?? 'api/v1',
  },
  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET ?? 'change_me',
    accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN ?? '1d',
  },
  auth: {
    mode: (process.env.AUTH_MODE ?? 'demo').toLowerCase(),
    externalJwtSecret:  process.env.EXTERNAL_JWT_SECRET ?? '',
    externalSubField:   process.env.EXTERNAL_SUB_FIELD   ?? 'sub',
    externalEmailField: process.env.EXTERNAL_EMAIL_FIELD ?? 'email',
    externalRoleField:  process.env.EXTERNAL_ROLE_FIELD  ?? 'role',
    externalRoleMap:    process.env.EXTERNAL_ROLE_MAP    ?? '{}',
  },
  database: {
    url: process.env.DATABASE_URL ?? buildDatabaseUrlFromParts(),
  },
  erp: {
    sqlCatalog: process.env.ERP_SQL_CATALOG ?? '',
    chatterPostTable: (process.env.ERP_CHATTER_POST_TABLE || 'ErpTSChatterPost').trim(),
    chatterPostSqlObject: (process.env.ERP_CHATTER_POST_SQL_OBJECT || '').trim(),
  },
  aws: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID ?? '',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? '',
    region: process.env.AWS_REGION ?? '',
    bucket: process.env.AWS_BUCKET ?? '',
    folder: process.env.AWS_FOLDER ?? 'taskfiles',
  },
  });
};
