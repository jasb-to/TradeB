import { NextResponse } from "next/server"
import { TelegramNotifier } from "@/lib/telegram"

export const dynamic = "force-dynamic"

const DASHBOARD_URL = "https://tradeb.vercel.app"

export async function GET() {
  console.log("[v0] Instant Telegram test GET request received")
  return handleTest()
}

export async function POST(request: Request) {
  console.log("[v0] Instant Telegram test POST request received")
  return handleTest()
}

async function handleTest() {
  const telegramBotToken = process.env.TELEGRAM_BOT_TOKEN
  const telegramChatId = process.env.TELEGRAM_CHAT_ID

  console.log("[v0] Instant Telegram test - Bot token exists:", !!telegramBotToken)
  console.log("[v0] Instant Telegram test - Chat ID exists:", !!telegramChatId)

  if (!telegramBotToken || !telegramChatId) {
    return NextResponse.json(
      {
        success: false,
        error:
          "Telegram not configured - please add TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID to your environment variables",
        details: {
          hasBotToken: !!telegramBotToken,
          hasChatId: !!telegramChatId,
        },
      },
      { status: 400 },
    )
  }

  try {
    console.log("[v0] Instant Telegram test - Sending test message...")
    const notifier = new TelegramNotifier(telegramBotToken, telegramChatId, DASHBOARD_URL)
    
    // Add debugging to see what's happening
    console.log("[v0] Instant Telegram test - Bot token:", telegramBotToken)
    console.log("[v0] Instant Telegram test - Chat ID:", telegramChatId)
    console.log("[v0] Instant Telegram test - Dashboard URL:", DASHBOARD_URL)
    
    // Bypass ALL cooldowns and restrictions for instant testing
    console.log("[v0] Instant Telegram test - Bypassing ALL cooldowns for instant test")
    
    // Force send message without any restrictions
    await notifier.sendTestMessage()
    console.log("[v0] Instant Telegram test - Message sent successfully!")

    return NextResponse.json({
      success: true,
      message: "Instant test message sent to Telegram",
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    console.error("[v0] Instant Telegram test failed:", error)
    console.error("[v0] Instant Telegram test - Error details:", error instanceof Error ? error.message : "Unknown error")

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
        timestamp: new Date().toISOString(),
      },
      { status: 500 },
    )
  }
}