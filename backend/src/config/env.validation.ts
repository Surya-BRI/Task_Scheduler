import * as Joi from 'joi';

export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string().valid('development', 'test', 'production').default('development'),
  PORT: Joi.number().default(4000),
  API_PREFIX: Joi.string().default('api/v1'),
  DATABASE_URL: Joi.string().optional(),
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
  LOG_LEVEL: Joi.string().default('debug'),
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
