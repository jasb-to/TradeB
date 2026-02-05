import { NextResponse } from "next/server"
import { TelegramNotifier } from "@/lib/telegram"

export const dynamic = "force-dynamic"

const DASHBOARD_URL = "https://tradeb.vercel.app"

export async function GET() {
  console.log("[v0] Test Telegram GET request received")
  return handleTest()
}

export async function POST() {
  console.log("[v0] Test Telegram POST request received")
  return handleTest()
}

async function handleTest() {
  const telegramBotToken = process.env.TELEGRAM_BOT_TOKEN
  const telegramChatId = process.env.TELEGRAM_CHAT_ID

  console.log("[v0] Telegram test - Bot token exists:", !!telegramBotToken)
  console.log("[v0] Telegram test - Chat ID exists:", !!telegramChatId)

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
    console.log("[v0] Telegram test - Sending test message...")
    const notifier = new TelegramNotifier(telegramBotToken, telegramChatId, DASHBOARD_URL)
    
    // Add debugging to see what's happening
    console.log("[v0] Telegram test - Bot token:", telegramBotToken)
    console.log("[v0] Telegram test - Chat ID:", telegramChatId)
    console.log("[v0] Telegram test - Dashboard URL:", DASHBOARD_URL)
    
    // Bypass cooldown for test messages
    console.log("[v0] Telegram test - Bypassing cooldown for test message")
    
    // Force clear any existing cooldown for test
    console.log("[v0] Telegram test - Clearing any existing cooldown")
    await notifier.clearCooldown("XAU_USD")
    
    await notifier.sendTestMessage()
    console.log("[v0] Telegram test - Message sent successfully!")

    return NextResponse.json({
      success: true,
      message: "Test message sent to Telegram",
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    console.error("[v0] Telegram test failed:", error)
    console.error("[v0] Telegram test - Error details:", error instanceof Error ? error.message : "Unknown error")

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
