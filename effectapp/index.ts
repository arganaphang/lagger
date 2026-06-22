import { Effect, Layer, Schema } from "effect";
import { BunRuntime, BunHttpServer } from "@effect/platform-bun";
import {
  HttpApi,
  HttpApiBuilder,
  HttpApiEndpoint,
  HttpApiGroup,
} from "@effect/platform";

const HealthResponseBody = Schema.Struct({
  message: Schema.String,
});

class HealthGroup extends HttpApiGroup.make("health").add(
  HttpApiEndpoint.get("getHealth")`/health`
    .addError(HealthResponseBody)
    .addSuccess(HealthResponseBody),
) {}

class ServerAPI extends HttpApi.make("api").add(HealthGroup) {}

const HealthGroupLive = HttpApiBuilder.group(ServerAPI, "health", (h) =>
  h.handle("getHealth", () =>
    Effect.gen(function* () {
      return { message: "ok from effect-app" };
    }).pipe(Effect.mapError(() => ({ message: "not ok from effect-app" }))),
  ),
);

const MainApiLive = HttpApiBuilder.api(ServerAPI).pipe(
  Layer.provide([HealthGroupLive]),
);

const HttpLive = HttpApiBuilder.serve().pipe(
  Layer.provide(MainApiLive),
  Layer.provide(BunHttpServer.layer({ port: 8002 })),
);

BunRuntime.runMain(Layer.launch(HttpLive));
