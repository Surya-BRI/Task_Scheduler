import * as Joi from 'joi';

export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string().valid('development', 'test', 'production').default('development'),
  PORT: Joi.number().default(4000),
  API_PREFIX: Joi.string().default('api/v1'),
  DATABASE_URL: Joi.string().optional(),
  LIVE_DATABASE_URL: Joi.string().optional(),
  DB_SERVER: Joi.string().optional(),
  DB_PORT: Joi.number().default(1433),
  DB_NAME: Joi.string().optional(),
  DB_USER: Joi.string().optional(),
  DB_PASSWORD: Joi.string().optional(),
  DB_ENCRYPT: Joi.boolean().truthy('true').falsy('false').default(true),
  DB_TRUST_SERVER_CERTIFICATE: Joi.boolean().truthy('true').falsy('false').default(true),
  JWT_ACCESS_SECRET: Joi.string().min(16).required(),
  JWT_ACCESS_EXPIRES_IN: Joi.string().default('1d'),
  // Comma-separated list of origins, e.g. http://localhost:5000
  CORS_ORIGIN: Joi.string()
    .required()
    .custom((value: string, helpers) => {
      const parts = value
        .split(',')
        .map((origin: string) => origin.trim())
        .filter(Boolean);
      for (const part of parts) {
        const { error } = Joi.string().uri().validate(part);
        if (error) {
          return helpers.error('any.invalid', {
            message: `CORS_ORIGIN entry "${part}" must be a valid URI`,
          });
        }
      }
      if (parts.length === 0) {
        return helpers.error('any.invalid', {
          message: 'CORS_ORIGIN must contain at least one origin',
        });
      }
      return value;
    }),
  LOG_LEVEL: Joi.string().valid('debug', 'info', 'log', 'warn', 'error').default('debug'),
  SERVICE_NAME: Joi.string().max(64).default('task-scheduler-api'),
  SENTRY_DSN: Joi.string().uri().allow('').optional(),
  SENTRY_TRACES_SAMPLE_RATE: Joi.number().min(0).max(1).default(0.1),
  OTEL_EXPORTER_OTLP_ENDPOINT: Joi.string().uri().allow('').optional(),
  ERP_SQL_CATALOG: Joi.string().max(128).optional(),
  /** dbo table name only — bracketed as [dbo].[name] in SQL */
  ERP_CHATTER_POST_TABLE: Joi.string().max(128).pattern(/^[\w-]+$/).optional(),
  /** Full FROM object (e.g. `[MyDb].[dbo].[TSChatterPost]`). Disallows SQL metacharacters. */
  ERP_CHATTER_POST_SQL_OBJECT: Joi.string().max(280).pattern(/^[\s[\]a-zA-Z0-9_.-]*$/).optional(),
  // ─── Authentication mode ─────────────────────────────────────────────────────
  /** 'demo' = internal JWT (default). 'external' = validate tokens from ERP site. */
  AUTH_MODE: Joi.string().valid('demo', 'external').default('demo'),
  /** Required when AUTH_MODE=external. The JWT secret used by the external ERP site. */
  EXTERNAL_JWT_SECRET:  Joi.string().min(8).optional(),
  /** JWT claim name for the user id in external tokens (default: 'sub') */
  EXTERNAL_SUB_FIELD:   Joi.string().optional(),
  /** JWT claim name for the email in external tokens (default: 'email') */
  EXTERNAL_EMAIL_FIELD: Joi.string().optional(),
  /** JWT claim name for the role in external tokens (default: 'role') */
  EXTERNAL_ROLE_FIELD:  Joi.string().optional(),
  /** JSON object mapping external role strings to internal UserRole values */
  EXTERNAL_ROLE_MAP:    Joi.string().optional(),
  AWS_ACCESS_KEY_ID: Joi.string().optional(),
  AWS_SECRET_ACCESS_KEY: Joi.string().optional(),
  AWS_REGION: Joi.string().optional(),
  AWS_BUCKET: Joi.string().optional(),
  AWS_FOLDER: Joi.string().max(128).pattern(/^[a-zA-Z0-9/_-]+$/).optional(),
  /** When true, services run boot-time CREATE/ALTER DDL. Default: true in dev/test, false in production. */
  RUNTIME_SCHEMA_BOOTSTRAP: Joi.boolean().truthy('true').falsy('false').optional(),
}).custom((value, helpers) => {
  const hasDatabaseUrl = !!value.DATABASE_URL;
  const hasDbParts =
    !!value.DB_SERVER && !!value.DB_NAME && !!value.DB_USER && !!value.DB_PASSWORD;

  if (!hasDatabaseUrl && !hasDbParts) {
    return helpers.error('any.invalid', {
      message: 'Provide DATABASE_URL or DB_SERVER/DB_NAME/DB_USER/DB_PASSWORD',
    });
  }

  return value;
});
