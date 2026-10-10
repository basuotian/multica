package wecom

// relay_publish_state_test.go — what one trip through the relay reports.
//
// A bool could not tell "the bus took it" from "a replica took the delivery"
// from "the publish call failed", and an inbox push needs all three. These pin
// the states that decision rests on, without a database: the bus and the claim
// store are the same doubles the reply-path tests use.

import (
	"context"
	"log/slog"
	"testing"
	"time"

	"github.com/multica-ai/multica/server/internal/util"
)

func inboxPublishRouter(t *testing.T, relay *fanoutRelay, dedupe DedupeStore, cfg RelayConfig, handler *Outbound) *RelayOutbound {
	t.Helper()
	router := NewRelayOutbound(relay, dedupe, cfg, slog.Default())
	ctx, cancel := context.WithCancel(context.Background())
	t.Cleanup(func() { cancel(); router.Wait() })
	router.Start(ctx)
	router.Attach(handler)
	relay.register(router)
	return router
}

// TestRelayPublish_InboxWithNoHolderIsNoHolder: the bus took the frame, but no
// replica holds that installation's socket, so no dispatcher can take the
// delivery. The publisher must read that as a proven miss (and must FENCE the
// claim so a late dispatcher cannot deliver it after the fallback ran).
func TestRelayPublish_InboxWithNoHolderIsNoHolder(t *testing.T) {
	t.Parallel()
	relay, dedupe := &fanoutRelay{}, newSharedDedupe()
	// A handler that owns no socket at all.
	router := inboxPublishRouter(t, relay, dedupe,
		RelayConfig{AcceptanceWindow: 40 * time.Millisecond},
		&Outbound{senders: newSendersRegistry(), logger: slog.Default()})

	instID := util.UUIDToString(mustTestUUID(t))
	eventID := relayInboxEventID("item-1", "recipient-1", instID)
	got := router.publish(relayFrame{
		Kind: relayKindInbox, InstallationID: instID,
		ChatID: "T_USER", ChatType: chatTypeSingleInt, Content: "card",
	}, eventID)
	if got != relayNoHolder {
		t.Fatalf("publish = %v, want relayNoHolder", got)
	}
	if v := dedupe.valueOf(dedupeKey(eventID)); v == "" || v == claimSettledValue || v == claimLostValue {
		t.Fatalf("claim value = %q, want a fencing token: a late holder must find the delivery taken", v)
	}
}

// TestRelayPublish_InboxWithAHolderIsAccepted: one replica owns the socket and
// takes the claim, so the publisher may stop there.
func TestRelayPublish_InboxWithAHolderIsAccepted(t *testing.T) {
	t.Parallel()
	relay, dedupe := &fanoutRelay{}, newSharedDedupe()
	instID := mustTestUUID(t)
	reg := newSendersRegistry()
	conn := &recordingConn{}
	reg.set(instID, conn.autoAck(newWSSender(conn, nil)))
	router := inboxPublishRouter(t, relay, dedupe,
		RelayConfig{AcceptanceWindow: 500 * time.Millisecond},
		NewOutbound(nil, reg, nil, slog.Default()))

	eventID := relayInboxEventID("item-2", "recipient-1", util.UUIDToString(instID))
	got := router.publish(relayFrame{
		Kind: relayKindInbox, InstallationID: util.UUIDToString(instID),
		ChatID: "T_USER", ChatType: chatTypeSingleInt, Content: "card",
	}, eventID)
	if got != relayAccepted {
		t.Fatalf("publish = %v, want relayAccepted", got)
	}
}

// TestRelayPublish_FailedPublishIsUncertain: a publish call that errors is not
// proof the frame was refused. Nothing may be concluded from it.
func TestRelayPublish_FailedPublishIsUncertain(t *testing.T) {
	t.Parallel()
	relay, dedupe := &fanoutRelay{}, newSharedDedupe()
	// No deliverer, so the fan-out itself is empty and only the error is left.
	router := NewRelayOutbound(relay, dedupe, RelayConfig{}, slog.Default())

	instID := util.UUIDToString(mustTestUUID(t))
	eventID := relayInboxEventID("item-3", "recipient-1", instID)
	relay.failAfterFanout = true
	got := router.publish(relayFrame{
		Kind: relayKindInbox, InstallationID: instID,
		ChatID: "T_USER", ChatType: chatTypeSingleInt, Content: "card",
	}, eventID)
	if got != relayUncertain {
		t.Fatalf("publish = %v, want relayUncertain", got)
	}
}

// TestRelayPublish_UnreadableClaimStoreIsUncertain: without an answer from the
// claim store the publisher cannot tell a holder from a miss, and a duplicate
// card is worse than a late one, so it must not fall back.
func TestRelayPublish_UnreadableClaimStoreIsUncertain(t *testing.T) {
	t.Parallel()
	relay, dedupe := &fanoutRelay{}, newSharedDedupe()
	dedupe.fail = true
	router := inboxPublishRouter(t, relay, dedupe,
		RelayConfig{AcceptanceWindow: 40 * time.Millisecond},
		&Outbound{senders: newSendersRegistry(), logger: slog.Default()})

	instID := util.UUIDToString(mustTestUUID(t))
	eventID := relayInboxEventID("item-4", "recipient-1", instID)
	got := router.publish(relayFrame{
		Kind: relayKindInbox, InstallationID: instID,
		ChatID: "T_USER", ChatType: chatTypeSingleInt, Content: "card",
	}, eventID)
	if got != relayUncertain {
		t.Fatalf("publish = %v, want relayUncertain", got)
	}
}

// TestRelayPublish_ReplyKeepsTheBoolSemantics: the reply and seal paths ask
// only "did the bus take it", and a frame that may have been accepted must not
// be re-sent, so a failed publish still reads as not routed.
func TestRelayPublish_ReplyKeepsTheBoolSemantics(t *testing.T) {
	t.Parallel()
	if got := (relayPublish(relayAccepted)).routed(); !got {
		t.Errorf("relayAccepted.routed() = false, want true")
	}
	for _, p := range []relayPublish{relayNotWired, relayNoHolder, relayUncertain} {
		if p.routed() {
			t.Errorf("relayPublish(%d).routed() = true, want false", p)
		}
	}
}
