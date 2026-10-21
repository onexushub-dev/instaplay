import XCTest
@testable import ReplayCore

// WatchModel.swift is the watch app's own file, symlinked into this test target.
final class WatchModelTests: XCTestCase {
  /// The app has been in front longer than the connecting grace: what it hears (or does not) is believed.
  private let settled = WatchModel.connectGrace

  func testIdleWhenNotRecording() {
    XCTAssertEqual(WatchModel.screen(recording: false, reachable: true, clipCount: 0, startedAtMs: nil, stateAge: 0, unreachableFor: 0, sinceActive: settled), .idle)
    // an old state heard before the phone went away still reads as idle
    XCTAssertEqual(WatchModel.screen(recording: false, reachable: false, clipCount: 4, startedAtMs: 1, stateAge: 0, unreachableFor: 0, sinceActive: settled), .idle)
  }

  func testOfflineWhenRecordingButPhoneUnreachable() {
    XCTAssertEqual(WatchModel.screen(recording: true, reachable: false, clipCount: 2, startedAtMs: 1_000, stateAge: 0, unreachableFor: WatchModel.offlineGrace, sinceActive: settled), .offline)
  }

  func testRecordingCarriesCountAndStart() {
    let screen = WatchModel.screen(recording: true, reachable: true, clipCount: 3, startedAtMs: 1_700_000_000_000, stateAge: 1, unreachableFor: 0, sinceActive: settled)
    XCTAssertEqual(screen, .recording(clipCount: 3, startedAt: Date(timeIntervalSince1970: 1_700_000_000)))
  }

  func testElapsedFormat() {
    let start = Date(timeIntervalSince1970: 0)
    XCTAssertEqual(WatchModel.elapsed(since: start, now: Date(timeIntervalSince1970: 75)), "01:15")
    XCTAssertEqual(WatchModel.elapsed(since: start, now: Date(timeIntervalSince1970: 3_725)), "1:02:05")
    XCTAssertEqual(WatchModel.elapsed(since: start, now: Date(timeIntervalSince1970: -5)), "00:00")
  }

  func testPreviewIsWantedOnlyWhenOnReachableAndRecording() {
    XCTAssertTrue(WatchModel.previewWanted(viewOn: true, reachable: true, recording: true))
    XCTAssertFalse(WatchModel.previewWanted(viewOn: false, reachable: true, recording: true))
    XCTAssertFalse(WatchModel.previewWanted(viewOn: true, reachable: false, recording: true))
    XCTAssertFalse(WatchModel.previewWanted(viewOn: true, reachable: true, recording: false))
  }

  func testARecordingThePhoneStopsReportingIsOffline() {
    // Phone app killed while still in range: the link stays "reachable" but the heartbeat stops.
    let stale = WatchModel.staleAfter + 1
    XCTAssertEqual(WatchModel.screen(recording: true, reachable: true, clipCount: 2, startedAtMs: 1, stateAge: stale, unreachableFor: 0, sinceActive: settled), .offline)
    XCTAssertEqual(
      WatchModel.screen(recording: true, reachable: true, clipCount: 2, startedAtMs: 1, stateAge: WatchModel.staleAfter - 1, unreachableFor: 0, sinceActive: settled),
      .recording(clipCount: 2, startedAt: Date(timeIntervalSince1970: 0.001)))
    // an old idle state is still idle, not offline
    XCTAssertEqual(WatchModel.screen(recording: false, reachable: true, clipCount: 0, startedAtMs: nil, stateAge: stale, unreachableFor: 0, sinceActive: settled), .idle)
  }

  func testTheHeartbeatBeatsTheStaleLimitWithRoomToSpare() {
    XCTAssertGreaterThanOrEqual(WatchModel.staleAfter, 2 * WatchModel.heartbeat)
  }

  func testTapsCloserThanTheSaveCooldownAreIgnored() {
    // Sleeves, sweat and balls touch a full-screen target: one save per cooldown, and no click for the rest.
    XCTAssertTrue(WatchModel.canSave(now: 100, lastSave: nil))
    XCTAssertFalse(WatchModel.canSave(now: 101, lastSave: 100))
    XCTAssertTrue(WatchModel.canSave(now: 103.1, lastSave: 100))
  }

  func testNoSaveWhenThePhoneSaysTheWatchTriggerIsLocked() {
    // Free tier: the phone says the watch may not save; the button is gone and a stray tap sends nothing.
    XCTAssertFalse(WatchModel.canSave(now: 100, lastSave: nil, allowed: false))
    XCTAssertTrue(WatchModel.canSave(now: 100, lastSave: nil, allowed: true))
    XCTAssertFalse(WatchModel.canSave(now: 101, lastSave: 100, allowed: true))
  }

  func testShortDropoutKeepsRecording() {
    let screen = WatchModel.screen(recording: true, reachable: false, clipCount: 2, startedAtMs: 1_000, stateAge: 1, unreachableFor: 4, sinceActive: settled)
    XCTAssertEqual(screen, .recording(clipCount: 2, startedAt: Date(timeIntervalSince1970: 1)))
  }

  func testLongDropoutIsOffline() {
    XCTAssertEqual(
      WatchModel.screen(recording: true, reachable: false, clipCount: 2, startedAtMs: 1_000, stateAge: 1, unreachableFor: 10, sinceActive: settled), .offline)
  }

  func testStaleStateIsOfflineEvenIfReachable() {
    XCTAssertEqual(
      WatchModel.screen(recording: true, reachable: true, clipCount: 2, startedAtMs: 1_000, stateAge: WatchModel.staleAfter + 1, unreachableFor: 0, sinceActive: settled),
      .offline)
  }

  func testCanStartOnlyIdleAndReachable() {
    XCTAssertTrue(WatchModel.canStart(recording: false, reachable: true))
    XCTAssertFalse(WatchModel.canStart(recording: true, reachable: true))
    XCTAssertFalse(WatchModel.canStart(recording: false, reachable: false))
  }

  func testCanStopOnlyRecordingAndReachable() {
    XCTAssertTrue(WatchModel.canStop(recording: true, reachable: true))
    XCTAssertFalse(WatchModel.canStop(recording: false, reachable: true))
    XCTAssertFalse(WatchModel.canStop(recording: true, reachable: false))
  }

  func testJustOpenedWithAStaleStateIsConnectingNotOffline() {
    // Opened (or raised) with a recording state that is old or only cached: wait for the phone's next beat.
    let stale = WatchModel.staleAfter + 1
    XCTAssertEqual(
      WatchModel.screen(recording: true, reachable: true, clipCount: 2, startedAtMs: 1, stateAge: stale, unreachableFor: 0, sinceActive: 1),
      .connecting)
    XCTAssertEqual(
      WatchModel.screen(recording: true, reachable: false, clipCount: 2, startedAtMs: 1, stateAge: stale, unreachableFor: 30, sinceActive: 1),
      .connecting)
  }

  func testStillSilentAfterTheGraceIsOffline() {
    let stale = WatchModel.staleAfter + 1
    XCTAssertEqual(
      WatchModel.screen(recording: true, reachable: true, clipCount: 2, startedAtMs: 1, stateAge: stale, unreachableFor: 0, sinceActive: WatchModel.connectGrace),
      .offline)
  }

  func testAFreshStateIsRecordingEvenRightAfterOpening() {
    let screen = WatchModel.screen(recording: true, reachable: true, clipCount: 2, startedAtMs: 1_000, stateAge: 1, unreachableFor: 0, sinceActive: 0)
    XCTAssertEqual(screen, .recording(clipCount: 2, startedAt: Date(timeIntervalSince1970: 1)))
  }

  func testIdleNeverWaitsForTheGrace() {
    XCTAssertEqual(
      WatchModel.screen(recording: false, reachable: true, clipCount: 0, startedAtMs: nil, stateAge: 99, unreachableFor: 0, sinceActive: 0), .idle)
  }

  func testAStartTheGameAnswersIsStarted() {
    XCTAssertEqual(WatchModel.startOutcome(askedAt: 100, now: 101, recording: true), .started)
    XCTAssertEqual(WatchModel.startOutcome(askedAt: 100, now: 100 + WatchModel.startWait + 5, recording: true), .started)
  }

  func testAStartIsWaitedForThenFailsWhenThePhoneNeverAnswers() {
    XCTAssertEqual(WatchModel.startOutcome(askedAt: 100, now: 101, recording: false), .waiting)
    XCTAssertEqual(WatchModel.startOutcome(askedAt: 100, now: 100 + WatchModel.startWait - 0.1, recording: false), .waiting)
    XCTAssertEqual(WatchModel.startOutcome(askedAt: 100, now: 100 + WatchModel.startWait, recording: false), .failed)
  }
}
