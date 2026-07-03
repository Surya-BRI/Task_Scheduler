/** Redact secrets before writing configuration to logs. */
export function maskSecret(value: string | undefined): string {
  if (!value) return '(not set)';
  return `***(${value.length} chars)`;
}

/** Strip password segments from SQL Server connection strings. */
export function maskDatabaseUrl(url: string | undefined): string {
  if (!url) return '(not set)';
  return url.replace(/password=[^;]*/gi, 'password=***');
}

export type ConfigLogSnapshot = {
  nodeEnv: string | undefined;
  port: string | undefined;
  apiPrefix: string | undefined;
  corsOrigin: string | undefined;
  hasDatabaseUrl: boolean;
  dbServer: string | undefined;
  dbPort: string | undefined;
  dbName: string | undefined;
  dbUser: string | undefined;
  hasDbPassword: boolean;
  resolvedDbUrl: string;
  hasLiveDatabaseUrl: boolean;
  hasLiveDbPassword: boolean;
  hasJwtAccessSecret: boolean;
  jwtAccessExpiresIn: string | undefined;
  authMode: string | undefined;
  hasAwsAccessKeyId: boolean;
  hasAwsSecretAccessKey: boolean;
  awsRegion: string | undefined;
  awsBucket: string | undefined;
  awsFolder: string | undefined;
};

export function buildConfigLogSnapshot(env: NodeJS.ProcessEnv, resolvedDbUrl?: string): ConfigLogSnapshot {
  return {
    nodeEnv: env.NODE_ENV,
    port: env.PORT,
    apiPrefix: env.API_PREFIX,
    corsOrigin: env.CORS_ORIGIN,
    hasDatabaseUrl: Boolean(env.DATABASE_URL),
    dbServer: env.DB_SERVER,
    dbPort: env.DB_PORT,
    dbName: env.DB_NAME,
    dbUser: env.DB_USER,
    hasDbPassword: Boolean(env.DB_PASSWORD),
    resolvedDbUrl: maskDatabaseUrl(resolvedDbUrl ?? env.DATABASE_URL),
    hasLiveDatabaseUrl: Boolean(env.LIVE_DATABASE_URL),
    hasLiveDbPassword: Boolean(env.LIVE_DB_PASSWORD),
    hasJwtAccessSecret: Boolean(env.JWT_ACCESS_SECRET),
    jwtAccessExpiresIn: env.JWT_ACCESS_EXPIRES_IN,
    authMode: env.AUTH_MODE,
    hasAwsAccessKeyId: Boolean(env.AWS_ACCESS_KEY_ID),
    hasAwsSecretAccessKey: Boolean(env.AWS_SECRET_ACCESS_KEY),
    awsRegion: env.AWS_REGION,
    awsBucket: env.AWS_BUCKET,
    awsFolder: env.AWS_FOLDER,
  };
}
