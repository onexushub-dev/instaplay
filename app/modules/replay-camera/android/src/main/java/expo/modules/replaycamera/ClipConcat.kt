package expo.modules.replaycamera

import android.media.MediaCodec
import android.media.MediaExtractor
import android.media.MediaMuxer
import expo.modules.replaycamera.core.Segment
import java.io.File
import java.nio.ByteBuffer

/** Remuxes segment MP4s into one file, without re-encoding. Each segment's samples are shifted to follow the previous one. */
object ClipConcat {
  fun concat(segments: List<Segment>, dest: File) {
    require(segments.isNotEmpty()) { "no segments to save" }
    val muxer = MediaMuxer(dest.path, MediaMuxer.OutputFormat.MUXER_OUTPUT_MPEG_4)
    val trackMap = mutableMapOf<String, Int>()
    val buffer = ByteBuffer.allocate(4 * 1024 * 1024)
    val info = MediaCodec.BufferInfo()
    var offsetUs = 0L
    try {
      segments.forEachIndexed { index, segment ->
        val extractor = MediaExtractor().apply { setDataSource(segment.file.path) }
        try {
          val localTracks = (0 until extractor.trackCount).associateWith { i ->
            val format = extractor.getTrackFormat(i)
            val mime = format.getString(android.media.MediaFormat.KEY_MIME)!!
            if (index == 0) trackMap[mime] = muxer.addTrack(format)
            extractor.selectTrack(i)
            mime
          }
          if (index == 0) muxer.start()

          var firstPts = -1L
          while (true) {
            val size = extractor.readSampleData(buffer, 0)
            if (size < 0) break
            val pts = extractor.sampleTime
            if (firstPts < 0) firstPts = pts
            val outTrack = trackMap[localTracks[extractor.sampleTrackIndex]]
            if (outTrack != null) {
              info.set(0, size, offsetUs + (pts - firstPts).coerceAtLeast(0), extractor.sampleFlags)
              muxer.writeSampleData(outTrack, buffer, info)
            }
            extractor.advance()
          }
          offsetUs += (segment.duration * 1_000_000).toLong()
        } finally {
          extractor.release()
        }
      }
    } finally {
      runCatching { muxer.stop() }
      muxer.release()
    }
  }
}
