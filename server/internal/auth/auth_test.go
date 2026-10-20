package auth

import (
	"testing"
	"time"
)

// Values produced by the TypeScript server this replaced. Accounts and
// sessions that already exist depend on these staying the same.
const (
	secret  = "test-secret-that-is-at-least-32-characters-long"
	tsToken = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1c3JfMDEyMzQ1Njc4OWFiY2RlZiIsImlhdCI6MTc5MjUzMDM0NCwiZXhwIjoxNzk1MTIyMzQ0LCJpc3MiOiJjYXJkdmF1bHQifQ.ZIrdVPg-GsZ7H7xtja02KMBJ6gIYEdECFw9-HA-GN5w"
)

func TestDerivationsMatchTheTypeScriptServer(t *testing.T) {
	if got := AccountID("google-sub-123", secret); got != "usr_029f0fb0c7ff303f" {
		t.Errorf("AccountID = %s", got)
	}
	if got := EmailHash("  Asha@Example.com ", secret); got != "54827f587ba7fcf748990da2f1a52c8606bf0a1b9cffbbac373004dbec48e18b" {
		t.Errorf("EmailHash = %s", got)
	}
}

func TestSessionsFromTheTypeScriptServerStillWork(t *testing.T) {
	issued := time.Unix(1792530344, 0)
	if id, err := ReadSession(tsToken, secret, issued.Add(time.Hour)); err != nil || id != "usr_0123456789abcdef" {
		t.Fatalf("ReadSession = %q, %v", id, err)
	}
	if _, err := ReadSession(tsToken, secret, issued.Add(31*24*time.Hour)); err == nil {
		t.Error("an expired session was accepted")
	}
	if _, err := ReadSession(tsToken, "a-different-secret-that-is-also-32-chars", issued); err == nil {
		t.Error("a session signed with another secret was accepted")
	}
}

func TestSessionRoundTrip(t *testing.T) {
	now := time.Now()
	tok, err := IssueSession("usr_abc", secret, now)
	if err != nil {
		t.Fatal(err)
	}
	if id, err := ReadSession(tok, secret, now.Add(29*24*time.Hour)); err != nil || id != "usr_abc" {
		t.Fatalf("ReadSession = %q, %v", id, err)
	}
	for _, bad := range []string{"", "nope", tok + "x"} {
		if _, err := ReadSession(bad, secret, now); err == nil {
			t.Errorf("accepted %q", bad)
		}
	}
}
