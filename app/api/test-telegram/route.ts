import { NextResponse } from "next/server"
import { TelegramNotifier } from "@/lib/telegram"

export const dynamic = "force-dynamic"

const DASHBOARD_URL = "https://xptswitch.vercel.app"

export async function GET() {
  return handleTest()
}

export async function POST() {
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
    await notifier.sendTestMessage()
    console.log("[v0] Telegram test - Message sent successfully!")

    return NextResponse.json({
      success: true,
      message: "Test message sent to Telegram",
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    console.error("[v0] Telegram test failed:", error)

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
