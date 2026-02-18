import { NextResponse } from 'next/server'

export const maxDuration = 60
export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const url = new URL(req.url)
  const secret = url.searchParams.get('secret')
  
  if (secret !== process.env.CRON_SECRET) {
    console.warn('[CRON] Unauthorized access attempt')
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    console.log('[CRON] Starting XAU_USD signal fetch')
    
    const baseUrl = url.origin
    const signalUrl = `${baseUrl}/api/signal/current?symbol=XAU_USD`
    
    console.log(`[CRON] Fetching from: ${signalUrl}`)
    
    const res = await fetch(signalUrl, { 
      method: 'GET',
      headers: { 'User-Agent': 'external-cron' }
    })
    
    if (!res.ok) {
      const errorBody = await res.text()
      console.error(`[CRON] Signal API returned ${res.status}: ${errorBody.substring(0, 500)}`)
      return NextResponse.json({
        success: false,
        status: res.status,
        error: 'Signal fetch failed',
        timestamp: new Date().toISOString(),
      }, { status: 200 })
    }
    
    const data = await res.json()
    
    console.log(`[CRON] SUCCESS: ${data.signal?.type || 'UNKNOWN'} signal received`)
    
    return NextResponse.json({
      success: true,
      signal: data.signal,
      timestamp: new Date().toISOString(),
    }, { status: 200 })
    
  } catch (error) {
    console.error('[CRON] Error:', error instanceof Error ? error.message : String(error))
    return NextResponse.json({
      success: false,
      error: 'Cron job failed',
      details: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
    }, { status: 200 })
  }
}
