package com.example.config

import java.io.File
import java.time.Duration

data class RetryPolicy(
    val attempts: Int,
    val backoff: Duration,
    val jitterPercent: Int,
)

/** Loads a retry policy from a `key = value` file, caching the result. */
object ConfigLoader {
    private val cache = HashMap<String, RetryPolicy>()

    fun load(path: String, overrides: Map<String, String>? = null): RetryPolicy {
        cache[path]?.let { return it }

        val raw = File(path).readLines()
            .filter { !it.startsWith("#") }
            .associate { line ->
                val (k, v) = line.split("=")
                k.trim() to v.trim()
            }

        val merged = raw + (overrides ?: emptyMap())

        val attempts = merged["attempts"]?.toInt() ?: 3
        val backoffMs = merged["backoff_ms"]?.toInt() ?: 250
        val jitter = merged["jitter_percent"]?.toInt() ?: 0

        val policy = RetryPolicy(
            attempts = attempts,
            backoff = Duration.ofMillis(backoffMs / attempts.toLong()),
            jitterPercent = jitter,
        )
        cache[path] = policy
        return policy
    }
}
