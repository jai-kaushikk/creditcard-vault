// Package server holds what the server binary embeds: the database schema.
package server

import _ "embed"

// Schema creates or upgrades every table. It's idempotent and runs on each start.
//
//go:embed schema.sql
var Schema string
