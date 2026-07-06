import { shouldRunRuntimeSchemaBootstrap } from './runtime-schema-bootstrap.util';

describe('shouldRunRuntimeSchemaBootstrap', () => {
  const original = process.env.RUNTIME_SCHEMA_BOOTSTRAP;

  afterEach(() => {
    if (original === undefined) {
      delete process.env.RUNTIME_SCHEMA_BOOTSTRAP;
    } else {
      process.env.RUNTIME_SCHEMA_BOOTSTRAP = original;
    }
  });

  it('returns true when RUNTIME_SCHEMA_BOOTSTRAP=true', () => {
    process.env.RUNTIME_SCHEMA_BOOTSTRAP = 'true';
    expect(shouldRunRuntimeSchemaBootstrap('production')).toBe(true);
  });

  it('returns false when RUNTIME_SCHEMA_BOOTSTRAP=false', () => {
    process.env.RUNTIME_SCHEMA_BOOTSTRAP = 'false';
    expect(shouldRunRuntimeSchemaBootstrap('development')).toBe(false);
  });

  it('defaults to true in development when flag unset', () => {
    delete process.env.RUNTIME_SCHEMA_BOOTSTRAP;
    expect(shouldRunRuntimeSchemaBootstrap('development')).toBe(true);
  });

  it('defaults to true in test when flag unset', () => {
    delete process.env.RUNTIME_SCHEMA_BOOTSTRAP;
    expect(shouldRunRuntimeSchemaBootstrap('test')).toBe(true);
  });

  it('defaults to false in production when flag unset', () => {
    delete process.env.RUNTIME_SCHEMA_BOOTSTRAP;
    expect(shouldRunRuntimeSchemaBootstrap('production')).toBe(false);
  });
});
