import { Effect, Layer, Schema } from "effect";
import { BunRuntime, BunHttpServer } from "@effect/platform-bun";
import { FetchHttpClient } from "@effect/platform";
import {
  HttpApi,
  HttpApiBuilder,
  HttpApiEndpoint,
  HttpApiGroup,
} from "@effect/platform";
import { Otlp } from "@effect/opentelemetry";

const OTLP_BASE_URL = process.env.OTEL_EXPORTER_OTLP_ENDPOINT ?? "http://alloy:4318";

const OtelLive = Otlp.layerJson({
  baseUrl: OTLP_BASE_URL,
  resource: {
    serviceName: "effect-app",
    serviceVersion: "0.1.0",
  },
}).pipe(Layer.provide(FetchHttpClient.layer));

// --- API schema ---

const HealthBody = Schema.Struct({ message: Schema.String });
const RollBody = Schema.Struct({ result: Schema.Number });

class HealthGroup extends HttpApiGroup.make("health")
  .add(HttpApiEndpoint.get("getHealth")`/health`.addSuccess(HealthBody))
  .add(HttpApiEndpoint.get("getRoll")`/roll`.addSuccess(RollBody)) {}

class ServerAPI extends HttpApi.make("api").add(HealthGroup) {}

// --- Handlers ---

const HealthGroupLive = HttpApiBuilder.group(ServerAPI, "health", (h) =>
  h
    .handle("getHealth", () =>
      Effect.gen(function* () {
        yield* Effect.log("health check");
        return { message: "ok from effect-app" };
      }),
    )
    .handle("getRoll", () =>
      Effect.gen(function* () {
        const result = yield* Effect.withSpan("roll.dice")(
          Effect.gen(function* () {
            const n = Math.floor(Math.random() * 6) + 1;
            yield* Effect.log("dice rolled", { result: n });
            return n;
          }),
        );
        return { result };
      }),
    ),
);

const MainApiLive = HttpApiBuilder.api(ServerAPI).pipe(
  Layer.provide([HealthGroupLive]),
);

const HttpLive = HttpApiBuilder.serve().pipe(
  Layer.provide(MainApiLive),
  Layer.provide(BunHttpServer.layer({ port: 8002 })),
  Layer.provide(OtelLive),
);

BunRuntime.runMain(Layer.launch(HttpLive));
