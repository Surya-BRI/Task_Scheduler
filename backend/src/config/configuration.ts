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

export default () => ({
  app: {
    port: Number(process.env.PORT ?? 4000),
    corsOrigin: process.env.CORS_ORIGIN ?? 'http://localhost:5000',
  },
  api: {
    prefix: process.env.API_PREFIX ?? 'api/v1',
  },
  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET ?? 'change_me',
    accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN ?? '1d',
  },
  database: {
    url: process.env.DATABASE_URL ?? buildDatabaseUrlFromParts(),
  },
  /** When set, use [catalog].[dbo].…; otherwise use the DB from DATABASE_URL (current catalog). */
  erp: {
    sqlCatalog: process.env.ERP_SQL_CATALOG ?? '',
    /** dbo table name segment only — used as [catalog].[dbo].[name] or [dbo].[name]. */
    chatterPostTable: (process.env.ERP_CHATTER_POST_TABLE || 'ErpTSChatterPost').trim(),
    /**
     * When set, used verbatim as the FROM target (e.g. `[OtherDb].[dbo].[TSChatterPost]`).
     * Overrides catalog + chatterPostTable.
     */
    chatterPostSqlObject: (process.env.ERP_CHATTER_POST_SQL_OBJECT || '').trim(),
  },
});
