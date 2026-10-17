package expo.modules.replaycamera.core

class LowStorageException : Exception("Less than 500 MB free")

object StorageGuard {
  const val MIN_FREE_BYTES = 500L * 1024 * 1024

  fun check(freeBytes: Long) {
    if (freeBytes < MIN_FREE_BYTES) throw LowStorageException()
  }
}
