/**
 * Redis Client Wrapper - Upstash Redis Integration
 * 
 * Provides a simple interface for Redis operations using Upstash REST API.
 * Automatically handles:
 * - Authentication via environment variables
 * - Error handling and fallbacks
 * - JSON serialization/deserialization
 * - Key expiration (TTL)
 */

const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN

// Silent fallback when Redis not configured - system works with in-memory storage
const REDIS_CONFIGURED = !!(REDIS_URL && REDIS_TOKEN)

interface RedisResponse {
  result?: string | number | null
  error?: string
}

export const RedisClient = {
  /**
   * Get a value from Redis
   */
  get: async (key: string): Promise<string | null> => {
    if (!REDIS_CONFIGURED) return null

    try {
      const response = await fetch(`${REDIS_URL}/get/${key}`, {
        headers: {
          Authorization: `Bearer ${REDIS_TOKEN}`,
        },
      })

      if (!response.ok) {
        return null
      }

      const data: RedisResponse = await response.json()
      return data.result ? String(data.result) : null
    } catch (error) {
      return null
    }
  },

  /**
   * Set a value in Redis with optional TTL (in seconds)
   */
  set: async (key: string, value: string, ttl?: number): Promise<boolean> => {
    if (!REDIS_CONFIGURED) return false

    try {
      const url = new URL(`${REDIS_URL}/set/${key}`)
      if (ttl) {
        url.searchParams.set("ex", String(ttl))
      }

      const response = await fetch(url.toString(), {
        method: "POST",
        headers: {
          Authorization: `Bearer ${REDIS_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ value }),
      })

      if (!response.ok) {
        return false
      }

      return true
    } catch (error) {
      return false
    }
  },

  /**
   * Delete a key from Redis
   */
  delete: async (key: string): Promise<boolean> => {
    if (!REDIS_CONFIGURED) return false

    try {
      const response = await fetch(`${REDIS_URL}/del/${key}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${REDIS_TOKEN}`,
        },
      })

      if (!response.ok) {
        return false
      }

      return true
    } catch (error) {
      return false
    }
  },

  /**
   * Get all keys matching a pattern (SCAN)
   */
  keys: async (pattern: string): Promise<string[]> => {
    if (!REDIS_CONFIGURED) return []

    try {
      const response = await fetch(`${REDIS_URL}/keys/${pattern}`, {
        headers: {
          Authorization: `Bearer ${REDIS_TOKEN}`,
        },
      })

      if (!response.ok) {
        return []
      }

      const data: RedisResponse = await response.json()
      return data.result ? String(data.result).split("\n") : []
    } catch (error) {
      return []
    }
  },

  /**
   * Increment a counter
   */
  increment: async (key: string): Promise<number> => {
    if (!REDIS_CONFIGURED) return 0

    try {
      const response = await fetch(`${REDIS_URL}/incr/${key}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${REDIS_TOKEN}`,
        },
      })

      if (!response.ok) {
        return 0
      }

      const data: RedisResponse = await response.json()
      return typeof data.result === "number" ? data.result : 0
    } catch (error) {
      return 0
    }
  },
}
