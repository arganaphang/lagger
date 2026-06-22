FROM golang:alpine AS builder
WORKDIR /application
COPY . .
RUN go mod download
RUN go build -o application main.go

FROM alpine:latest
WORKDIR /usr/bin
COPY --from=builder /application/application .
EXPOSE 8001
CMD [ "application" ]