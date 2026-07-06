import { buildConfigLogSnapshot } from '../common/utils/sanitize-config-log.util';

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
  const dbUrl = process.env.DATABASE_URL ?? buildDatabaseUrlFromParts();
  const nodeEnv = process.env.NODE_ENV ?? 'development';

  if (nodeEnv !== 'production') {
    console.log('[config] Environment loaded (sanitized):', buildConfigLogSnapshot(process.env, dbUrl));
  }

  return {
    app: {
      port: Number(process.env.PORT ?? 7000),
      nodeEnv,
      corsOrigin: process.env.CORS_ORIGIN ?? 'http://localhost:5000',
      logLevel: process.env.LOG_LEVEL ?? 'debug',
      serviceName: process.env.SERVICE_NAME ?? 'task-scheduler-api',
    },
    observability: {
      sentryDsn: process.env.SENTRY_DSN ?? '',
      otlpEndpoint: process.env.OTEL_EXPORTER_OTLP_ENDPOINT ?? '',
      tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? 0.1),
    },
    api: {
      prefix: process.env.API_PREFIX ?? 'api/v1',
    },
    jwt: {
      accessSecret: process.env.JWT_ACCESS_SECRET,
      accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN ?? '1d',
    },
    auth: {
      mode: (process.env.AUTH_MODE ?? 'demo').toLowerCase(),
      externalJwtSecret: process.env.EXTERNAL_JWT_SECRET ?? '',
      externalSubField: process.env.EXTERNAL_SUB_FIELD ?? 'sub',
      externalEmailField: process.env.EXTERNAL_EMAIL_FIELD ?? 'email',
      externalRoleField: process.env.EXTERNAL_ROLE_FIELD ?? 'role',
      externalRoleMap: process.env.EXTERNAL_ROLE_MAP ?? '{}',
    },
    database: {
      url: dbUrl,
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
  };
};
