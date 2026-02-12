import { NextResponse } from 'next/server'

export const runtime = 'nodejs'

export async function GET(req: Request) {
  try {
    // Verify this is called by Vercel Cron
    const authHeader = req.headers.get('authorization')
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    console.log('[CRON] Trade scan triggered at', new Date().toISOString())

    // Call the scan endpoint
    const scanUrl = new URL('/api/trades/scan', process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000')
    const response = await fetch(scanUrl.toString())

    if (!response.ok) {
      throw new Error(`Scan failed: ${response.statusText}`)
    }

    const data = await response.json()
    console.log('[CRON] Trade scan complete:', data.results)

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      scanResults: data.results,
    })
  } catch (error) {
    console.error('[CRON] Error running trade scan:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
