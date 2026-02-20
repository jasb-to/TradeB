import { TRADING_SYMBOLS } from "@/lib/symbol-config"
import { SYSTEM_VERSION } from "@/lib/system-version"

export async function GET() {
  return Response.json({
    status: "OK",
    version: SYSTEM_VERSION,
    symbols: TRADING_SYMBOLS,
    deploymentTime: new Date().toISOString(),
  })
}
