package expo.modules.replaycamera.core

import org.junit.Assert.assertThrows
import org.junit.Test

class StorageGuardTest {
  @Test fun test_storageGuard() {
    assertThrows(LowStorageException::class.java) { StorageGuard.check(499L * 1024 * 1024) }
    StorageGuard.check(500L * 1024 * 1024)
  }
}
