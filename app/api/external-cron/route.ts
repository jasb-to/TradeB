import { NextResponse } from 'next/server'

export const maxDuration = 60
export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const url = new URL(req.url)
  const secret = url.searchParams.get('secret')
  
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const baseUrl = url.origin
    const signalUrl = `${baseUrl}/api/signal/current?symbol=XAU_USD`
    
    const res = await fetch(signalUrl, { method: 'GET' })
    const data = await res.json()
    
    return NextResponse.json({
      success: true,
      signal: data,
      timestamp: new Date().toISOString(),
    }, { status: 200 })
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: String(error),
    }, { status: 200 })
  }
}
