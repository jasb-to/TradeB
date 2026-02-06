import { NextResponse } from "next/server"
import { TelegramNotifier } from "@/lib/telegram"
import { SignalCache } from "@/lib/signal-cache"

export const dynamic = "force-dynamic"

const DASHBOARD_URL = "https://tradeb.vercel.app"

export async function GET() {
  console.log("[v0] Test Telegram GET request received")
  return handleTest()
}

export async function POST(request: Request) {
  console.log("[v0] Test Telegram POST request received")
  
  // Check if this is a callback query (button click)
  const body = await request.json().catch(() => null)
  if (body && body.callback_query) {
    return handleCallback(body.callback_query)
  }
  
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
    
    // Debug: Check current state before reset
    const currentState = SignalCache.getDetailedState("XAU_USD")
    console.log("[v0] Current state before reset:", JSON.stringify(currentState, null, 2))
    
    SignalCache.resetState("XAU_USD")
    
    // Debug: Check state after reset
    const newState = SignalCache.getDetailedState("XAU_USD")
    console.log("[v0] State after reset:", JSON.stringify(newState, null, 2))
    
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

async function handleCallback(callbackQuery: any) {
  console.log("[v0] Telegram callback received:", callbackQuery.data)
  
  const telegramBotToken = process.env.TELEGRAM_BOT_TOKEN
  const telegramChatId = process.env.TELEGRAM_CHAT_ID

  if (!telegramBotToken || !telegramChatId) {
    return NextResponse.json(
      {
        success: false,
        error: "Telegram not configured",
      },
      { status: 400 },
    )
  }

  try {
    const notifier = new TelegramNotifier(telegramBotToken, telegramChatId, DASHBOARD_URL)
    
    // Handle different button actions
    const action = callbackQuery.data
    
    if (action === "reset_gold_cooldown") {
      console.log("[v0] Resetting Gold cooldown via button")
      
      // Debug: Check current state before reset
      const currentState = SignalCache.getDetailedState("XAU_USD")
      console.log("[v0] Current state before reset:", JSON.stringify(currentState, null, 2))
      
      // Actually reset the state using SignalCache
      SignalCache.resetState("XAU_USD")
      
      // Debug: Check state after reset
      const newState = SignalCache.getDetailedState("XAU_USD")
      console.log("[v0] State after reset:", JSON.stringify(newState, null, 2))
      
      // Send confirmation message
      await notifier.sendTestMessage()
      
      return NextResponse.json({
        success: true,
        message: "Gold cooldown reset",
        action: "reset_cooldown",
        stateBefore: currentState,
        stateAfter: newState,
      })
    } else if (action === "test_silver") {
      console.log("[v0] Testing Silver signal via button")
      // This would trigger a Silver signal test
      return NextResponse.json({
        success: true,
        message: "Silver test triggered",
        action: "test_silver",
      })
    } else {
      console.log("[v0] Unknown callback action:", action)
      return NextResponse.json({
        success: false,
        message: "Unknown action",
        action: action,
      })
    }
  } catch (error) {
    console.error("[v0] Callback handling failed:", error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    )
  }
}
