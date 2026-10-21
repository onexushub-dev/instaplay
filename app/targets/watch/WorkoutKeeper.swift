import Foundation
import HealthKit

/// Keeps the watch app running in the background while the phone records: watchOS leaves a workout app alive
/// and brings it back on a wrist raise. No metrics are collected; the session exists only for that.
/// Everything fails soft: with no permission or no session the watch behaves as it did before.
final class WorkoutKeeper {
  private let store = HKHealthStore()
  private var session: HKWorkoutSession?
  private var asked = false

  /// Idempotent. Main thread only.
  func setActive(_ on: Bool) {
    guard on else { return end() }
    guard session == nil, HKHealthStore.isHealthDataAvailable() else { return }
    if asked { return begin() }
    asked = true
    store.requestAuthorization(toShare: [HKObjectType.workoutType()], read: []) { [weak self] _, _ in
      DispatchQueue.main.async { self?.begin() }
    }
  }

  private func begin() {
    guard session == nil else { return }
    let configuration = HKWorkoutConfiguration()
    configuration.activityType = .other
    guard let next = try? HKWorkoutSession(healthStore: store, configuration: configuration) else { return }
    session = next
    next.startActivity(with: Date())
  }

  private func end() {
    session?.end()
    session = nil
  }
}
