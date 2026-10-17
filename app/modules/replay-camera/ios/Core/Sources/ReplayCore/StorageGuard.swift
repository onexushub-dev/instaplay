public enum ReplayError: Error, Equatable {
  case lowStorage
}

public enum StorageGuard {
  public static let minFreeBytes: Int64 = 500 * 1024 * 1024

  public static func check(freeBytes: Int64) throws {
    if freeBytes < minFreeBytes { throw ReplayError.lowStorage }
  }
}
