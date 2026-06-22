package main

import (
	"context"
	"log/slog"
	"math/rand"
	"net/http"
	"os"
	"time"

	"github.com/gin-gonic/gin"
	"go.opentelemetry.io/contrib/bridges/otelslog"
	"go.opentelemetry.io/contrib/instrumentation/github.com/gin-gonic/gin/otelgin"
	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/exporters/otlp/otlplog/otlploggrpc"
	"go.opentelemetry.io/otel/exporters/otlp/otlpmetric/otlpmetricgrpc"
	"go.opentelemetry.io/otel/exporters/otlp/otlptrace/otlptracegrpc"
	otellog "go.opentelemetry.io/otel/log/global"
	"go.opentelemetry.io/otel/metric"
	sdklog "go.opentelemetry.io/otel/sdk/log"
	sdkmetric "go.opentelemetry.io/otel/sdk/metric"
	"go.opentelemetry.io/otel/sdk/resource"
	sdktrace "go.opentelemetry.io/otel/sdk/trace"
	semconv "go.opentelemetry.io/otel/semconv/v1.26.0"
)

const serviceName = "go-app"

func setupOTel(ctx context.Context) (shutdown func(context.Context) error) {
	endpoint := os.Getenv("OTEL_EXPORTER_OTLP_ENDPOINT")
	if endpoint == "" {
		endpoint = "alloy:4317"
	}

	res := resource.NewWithAttributes(
		semconv.SchemaURL,
		semconv.ServiceName(serviceName),
		semconv.ServiceVersion("0.1.0"),
	)

	traceExp, err := otlptracegrpc.New(ctx,
		otlptracegrpc.WithEndpoint(endpoint),
		otlptracegrpc.WithInsecure(),
	)
	if err != nil {
		panic(err)
	}
	tp := sdktrace.NewTracerProvider(
		sdktrace.WithBatcher(traceExp),
		sdktrace.WithResource(res),
	)
	otel.SetTracerProvider(tp)

	metricExp, err := otlpmetricgrpc.New(ctx,
		otlpmetricgrpc.WithEndpoint(endpoint),
		otlpmetricgrpc.WithInsecure(),
	)
	if err != nil {
		panic(err)
	}
	mp := sdkmetric.NewMeterProvider(
		sdkmetric.WithReader(sdkmetric.NewPeriodicReader(metricExp, sdkmetric.WithInterval(5*time.Second))),
		sdkmetric.WithResource(res),
	)
	otel.SetMeterProvider(mp)

	logExp, err := otlploggrpc.New(ctx,
		otlploggrpc.WithEndpoint(endpoint),
		otlploggrpc.WithInsecure(),
	)
	if err != nil {
		panic(err)
	}
	lp := sdklog.NewLoggerProvider(
		sdklog.WithProcessor(sdklog.NewBatchProcessor(logExp)),
		sdklog.WithResource(res),
	)
	otellog.SetLoggerProvider(lp)

	return func(ctx context.Context) error {
		_ = tp.Shutdown(ctx)
		_ = mp.Shutdown(ctx)
		return lp.Shutdown(ctx)
	}
}

func main() {
	ctx := context.Background()
	shutdown := setupOTel(ctx)
	defer shutdown(context.Background())

	logger := otelslog.NewLogger(serviceName)
	slog.SetDefault(logger)

	meter := otel.Meter(serviceName)
	rollCounter, _ := meter.Int64Counter("roll.count",
		metric.WithDescription("Number of dice rolls"),
	)

	tracer := otel.Tracer(serviceName)

	gin.SetMode(gin.ReleaseMode)
	r := gin.New()
	r.Use(otelgin.Middleware(serviceName))
	r.Use(gin.Recovery())

	r.GET("/health", func(c *gin.Context) {
		slog.InfoContext(c.Request.Context(), "health check")
		c.JSON(http.StatusOK, gin.H{"message": "ok from go-app"})
	})

	r.GET("/roll", func(c *gin.Context) {
		ctx, span := tracer.Start(c.Request.Context(), "roll.dice")
		defer span.End()

		result := rand.Intn(6) + 1
		span.SetAttributes(attribute.Int("roll.result", result))
		rollCounter.Add(ctx, 1, metric.WithAttributes(
			attribute.Int("roll.result", result),
		))

		slog.InfoContext(ctx, "dice rolled", "result", result)
		c.JSON(http.StatusOK, gin.H{"result": result})
	})

	slog.Info("starting go-app", "port", 8001)
	r.Run("0.0.0.0:8001")
}
