import { diag, DiagConsoleLogger, DiagLogLevel } from "@opentelemetry/api";
import { logs } from "@opentelemetry/api-logs";
import { OTLPLogExporter } from "@opentelemetry/exporter-logs-otlp-http";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { PinoInstrumentation } from "@opentelemetry/instrumentation-pino";
import {
  defaultResource,
  resourceFromAttributes,
} from "@opentelemetry/resources";
import {
  LoggerProvider,
  SimpleLogRecordProcessor,
} from "@opentelemetry/sdk-logs";
import { NodeSDK } from "@opentelemetry/sdk-node";
import {
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_VERSION,
} from "@opentelemetry/semantic-conventions";

// Avoid duplicate SDK initialization when Bun hot-reloads the application
if (!(globalThis as any).__otel_initialized__) {
  (globalThis as any).__otel_initialized__ = true;

  // Enable OpenTelemetry diagnostic logging
  diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.INFO);

  // Define Resource merging default resources with custom ones
  const resource = defaultResource().merge(
    resourceFromAttributes({
      [ATTR_SERVICE_NAME]: "psh-veemee",
      [ATTR_SERVICE_VERSION]: "1.0",
    }),
  );

  // Configure Logs Exporter and Provider
  const logExporter = new OTLPLogExporter();
  const loggerProvider = new LoggerProvider({
    resource,
    processors: [
      new SimpleLogRecordProcessor({
        exporter: logExporter,
      }),
    ],
  });
  logs.setGlobalLoggerProvider(loggerProvider);

  // Configure Node SDK for traces
  const sdk = new NodeSDK({
    resource,
    traceExporter: new OTLPTraceExporter(),
    instrumentations: [
      new PinoInstrumentation({
        logKeys: {
          traceId: "trace_id",
          spanId: "span_id",
          traceFlags: "trace_flags",
        },
      }),
    ],
  });

  sdk.start();
  console.log("OpenTelemetry SDK initialized successfully.");
} else {
  console.log(
    "OpenTelemetry SDK already initialized (skipping duplicate setup).",
  );
}
