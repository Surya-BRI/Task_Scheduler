export function shouldRunRuntimeSchemaBootstrap(nodeEnv?: string): boolean {
  const flag = process.env.RUNTIME_SCHEMA_BOOTSTRAP?.trim().toLowerCase();
  if (flag === 'true' || flag === '1') return true;
  if (flag === 'false' || flag === '0') return false;

  const env = (nodeEnv ?? process.env.NODE_ENV ?? 'development').toLowerCase();
  return env === 'development' || env === 'test';
}
