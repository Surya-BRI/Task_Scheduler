type ObservabilityConfig = {
  sentryDsn?: string;
  otlpEndpoint?: string;
  serviceName?: string;
  nodeEnv?: string;
  tracesSampleRate?: number;
};

let otelSdk: { shutdown: () => Promise<void> } | null = null;

export function getOtelSdk(): { shutdown: () => Promise<void> } | null {
  return otelSdk;
}

/** Optional Sentry + OpenTelemetry bootstrap (no-op when env vars are unset). */
export async function initObservability(config: ObservabilityConfig = {}): Promise<void> {
  const sentryDsn = config.sentryDsn?.trim();
  const otlpEndpoint = config.otlpEndpoint?.trim();
  const serviceName = config.serviceName ?? 'task-scheduler-api';
  const nodeEnv = config.nodeEnv ?? process.env.NODE_ENV ?? 'development';

  if (sentryDsn) {
    const Sentry = await import('@sentry/node');
    Sentry.init({
      dsn: sentryDsn,
      environment: nodeEnv,
      tracesSampleRate: config.tracesSampleRate ?? 0.1,
    });
  }

  if (otlpEndpoint) {
    const [{ NodeSDK }, { getNodeAutoInstrumentations }, { OTLPTraceExporter }, { resourceFromAttributes }, { ATTR_SERVICE_NAME }] =
      await Promise.all([
        import('@opentelemetry/sdk-node'),
        import('@opentelemetry/auto-instrumentations-node'),
        import('@opentelemetry/exporter-trace-otlp-http'),
        import('@opentelemetry/resources'),
        import('@opentelemetry/semantic-conventions'),
      ]);

    const sdk = new NodeSDK({
      resource: resourceFromAttributes({
        [ATTR_SERVICE_NAME]: serviceName,
      }),
      traceExporter: new OTLPTraceExporter({ url: otlpEndpoint }),
      instrumentations: [getNodeAutoInstrumentations()],
    });

    await sdk.start();
    otelSdk = sdk;
  }
}

export async function shutdownObservability(): Promise<void> {
  if (otelSdk) {
    await otelSdk.shutdown();
    otelSdk = null;
  }

  const sentryDsn = process.env.SENTRY_DSN?.trim();
  if (sentryDsn) {
    const Sentry = await import('@sentry/node');
    await Sentry.close(2000);
  }
}
