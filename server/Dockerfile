# A static Go binary on a minimal base: small image, millisecond cold starts.
FROM golang:1.25-alpine AS build
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY schema.go schema.sql ./
COPY cmd ./cmd
COPY internal ./internal
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/server ./cmd/server

# distroless/static has CA certificates (for Google's sign-in keys) and runs as non-root.
FROM gcr.io/distroless/static-debian12:nonroot
WORKDIR /srv
COPY --from=build /out/server /srv/server
COPY web /srv/web
EXPOSE 8080
ENTRYPOINT ["/srv/server"]
