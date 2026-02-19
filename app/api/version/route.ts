import { NextResponse } from "next/server"
import { SYSTEM_VERSION } from "@/app/api/signal/current/route"

export async function GET() {
  return NextResponse.json({
    version: SYSTEM_VERSION,
    timestamp: new Date().toISOString(),
    status: "operational"
  })
}
