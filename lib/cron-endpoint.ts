export class CronEndpoint {
  private baseUrl: string
  private cronSecret: string

  constructor(baseUrl = "https://xptswitch.vercel.app", cronSecret = "") {
    this.baseUrl = baseUrl
    this.cronSecret = cronSecret
  }

  /**
   * Generate the cron-job.org URL for external scheduling
   */
  getExternalCronUrl(): string {
    if (!this.cronSecret) {
      return `${this.baseUrl}/api/external-cron?secret=YOUR_CRON_SECRET_HERE`
    }
    return `${this.baseUrl}/api/external-cron?secret=${this.cronSecret}`
  }

  /**
   * Instructions for setting up cron-job.org
   */
  getSetupInstructions(): string {
    return `
XPTSWITCH External Cron Setup Instructions:

1. Visit: https://cron-job.org/en/
2. Create New Cronjob
3. Set URL: ${this.getExternalCronUrl()}
4. Schedule: Every 10 minutes (*/10 * * * *)
5. Authentication: Query parameter included in URL
6. Enable Email notifications on failure
7. Verify: Check Vercel logs for [v0] CRON-JOB STARTED messages
8. Save and activate

The system will:
- Fetch latest OANDA candles for XAU/USD and XAG/USD every 10 minutes
- Evaluate A+ and A tier signals
- Send Telegram alerts for qualified trades
- Cache results for 30 seconds
- Skip processing if market is closed
- Log all activity to Vercel console for debugging

IMPORTANT:
- Ensure CRON_SECRET environment variable is set and matches the URL secret
- Ensure TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID are configured
- Verify OANDA_API_KEY and OANDA_ACCOUNT_ID are set
- Check Vercel deployment for active environment variables
`
  }

  /**
   * Validate cron secret is configured
   */
  validateConfiguration(): { valid: boolean; issues: string[] } {
    const issues: string[] = []

    if (!this.cronSecret) {
      issues.push("CRON_SECRET environment variable is not set - alerts will not be sent")
    }

    if (!process.env.TELEGRAM_BOT_TOKEN) {
      issues.push("TELEGRAM_BOT_TOKEN environment variable is not set - Telegram alerts disabled")
    }

    if (!process.env.TELEGRAM_CHAT_ID) {
      issues.push("TELEGRAM_CHAT_ID environment variable is not set - Telegram alerts disabled")
    }

    if (!process.env.OANDA_API_KEY) {
      issues.push("OANDA_API_KEY environment variable is not set - data fetching disabled")
    }

    if (!process.env.OANDA_ACCOUNT_ID) {
      issues.push("OANDA_ACCOUNT_ID environment variable is not set - account operations disabled")
    }

    return {
      valid: issues.length === 0,
      issues,
    }
  }

  /**
   * Get comprehensive system status
   */
  getSystemStatus(): string {
    const config = this.validateConfiguration()
    return `
XPTSWITCH System Status:

Configuration Status: ${config.valid ? "✓ READY" : "✗ ISSUES FOUND"}
${config.issues.length > 0 ? `Issues:\n${config.issues.map(i => `  - ${i}`).join("\n")}` : ""}

Cron Job URL: ${this.getExternalCronUrl()}

Environment Variables:
  CRON_SECRET: ${process.env.CRON_SECRET ? "✓ Set" : "✗ NOT SET"}
  TELEGRAM_BOT_TOKEN: ${process.env.TELEGRAM_BOT_TOKEN ? "✓ Set" : "✗ NOT SET"}
  TELEGRAM_CHAT_ID: ${process.env.TELEGRAM_CHAT_ID ? "✓ Set" : "✗ NOT SET"}
  OANDA_API_KEY: ${process.env.OANDA_API_KEY ? "✓ Set" : "✗ NOT SET"}
  OANDA_ACCOUNT_ID: ${process.env.OANDA_ACCOUNT_ID ? "✓ Set" : "✗ NOT SET"}

Deployment:
  Base URL: ${this.baseUrl}
  Region: Vercel (Edge Runtime)
  Max Duration: 60 seconds per request

Next Steps:
1. Verify all environment variables are set in Vercel dashboard
2. Visit https://cron-job.org/en/ and create/update cronjob with URL above
3. Set schedule to Every 10 minutes
4. Monitor Vercel logs for [v0] CRON-JOB messages
5. Test manually: curl "${this.getExternalCronUrl()}"
`
  }
}
