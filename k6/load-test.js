import http from "k6/http";
import { check, sleep } from "k6";
import { Counter, Rate, Trend } from "k6/metrics";

// Custom metrics
const rollResults = new Counter("roll_results_total");
const errorRate = new Rate("error_rate");
const goAppDuration = new Trend("goapp_duration", true);
const effectAppDuration = new Trend("effectapp_duration", true);

export const options = {
  scenarios: {
    goapp_load: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: "30s", target: 20 },
        { duration: "1m", target: 20 },
        { duration: "15s", target: 0 },
      ],
      exec: "testGoApp",
    },
    effectapp_load: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: "30s", target: 20 },
        { duration: "1m", target: 20 },
        { duration: "15s", target: 0 },
      ],
      exec: "testEffectApp",
    },
  },
  thresholds: {
    http_req_duration: ["p(95)<500"],
    error_rate: ["rate<0.01"],
    goapp_duration: ["p(95)<300"],
    effectapp_duration: ["p(95)<300"],
  },
};

export function testGoApp() {
  const healthRes = http.get("http://localhost:8001/health");
  const healthOk = check(healthRes, {
    "goapp /health status 200": (r) => r.status === 200,
    "goapp /health has message": (r) => r.json("message") === "ok from go-app",
  });
  errorRate.add(!healthOk);
  goAppDuration.add(healthRes.timings.duration);

  const rollRes = http.get("http://localhost:8001/roll");
  const rollOk = check(rollRes, {
    "goapp /roll status 200": (r) => r.status === 200,
    "goapp /roll result in range": (r) => {
      const result = r.json("result");
      return result >= 1 && result <= 6;
    },
  });
  errorRate.add(!rollOk);
  goAppDuration.add(rollRes.timings.duration);

  if (rollRes.status === 200) {
    rollResults.add(1, { app: "goapp", result: String(rollRes.json("result")) });
  }

  sleep(0.5);
}

export function testEffectApp() {
  const healthRes = http.get("http://localhost:8002/health");
  const healthOk = check(healthRes, {
    "effectapp /health status 200": (r) => r.status === 200,
    "effectapp /health has message": (r) =>
      r.json("message") === "ok from effect-app",
  });
  errorRate.add(!healthOk);
  effectAppDuration.add(healthRes.timings.duration);

  const rollRes = http.get("http://localhost:8002/roll");
  const rollOk = check(rollRes, {
    "effectapp /roll status 200": (r) => r.status === 200,
    "effectapp /roll result in range": (r) => {
      const result = r.json("result");
      return result >= 1 && result <= 6;
    },
  });
  errorRate.add(!rollOk);
  effectAppDuration.add(rollRes.timings.duration);

  if (rollRes.status === 200) {
    rollResults.add(1, {
      app: "effectapp",
      result: String(rollRes.json("result")),
    });
  }

  sleep(0.5);
}
