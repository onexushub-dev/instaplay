package expo.modules.replaycamera

import android.media.MediaCodec
import android.media.MediaExtractor
import android.media.MediaFormat
import android.media.MediaMuxer
import expo.modules.replaycamera.core.Segment
import expo.modules.replaycamera.core.TimelineRemap
import java.io.File
import java.nio.ByteBuffer

/** Remuxes segment MP4s into one 0-based file, without re-encoding. Timing rules live in [TimelineRemap]. */
object ClipConcat {
  fun concat(segments: List<Segment>, dest: File) {
    require(segments.isNotEmpty()) { "no segments to save" }
    val muxer = MediaMuxer(dest.path, MediaMuxer.OutputFormat.MUXER_OUTPUT_MPEG_4)
    val outTracks = mutableMapOf<String, Int>()
    val remap = TimelineRemap()
    val buffer = ByteBuffer.allocate(4 * 1024 * 1024)
    val info = MediaCodec.BufferInfo()
    try {
      segments.forEachIndexed { index, segment ->
        remap.beginSegment(firstVideoTimeUs(segment.file))
        val extractor = MediaExtractor().apply { setDataSource(segment.file.path) }
        try {
          val mimes = (0 until extractor.trackCount).associateWith { i ->
            val format = extractor.getTrackFormat(i)
            val mime = format.getString(MediaFormat.KEY_MIME)!!
            if (index == 0) outTracks[mime] = muxer.addTrack(format)
            extractor.selectTrack(i)
            mime
          }
          if (index == 0) muxer.start()

          while (true) {
            val size = extractor.readSampleData(buffer, 0)
            if (size < 0) break
            val mime = mimes[extractor.sampleTrackIndex]
            val outTrack = outTracks[mime]
            val pts = mime?.let { remap.map(it, extractor.sampleTime) }
            if (outTrack != null && pts != null) {
              info.set(0, size, pts, extractor.sampleFlags)
              muxer.writeSampleData(outTrack, buffer, info)
            }
            extractor.advance()
          }
        } finally {
          extractor.release()
        }
        remap.endSegment((segment.duration * 1_000_000).toLong())
      }
    } finally {
      runCatching { muxer.stop() }
      muxer.release()
    }
  }

  private fun firstVideoTimeUs(file: File): Long {
    val extractor = MediaExtractor().apply { setDataSource(file.path) }
    try {
      val video = (0 until extractor.trackCount).first {
        extractor.getTrackFormat(it).getString(MediaFormat.KEY_MIME)!!.startsWith("video/")
      }
      extractor.selectTrack(video)
      return extractor.sampleTime.coerceAtLeast(0)
    } finally {
      extractor.release()
    }
  }
}
