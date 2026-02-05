export class MarketHours {
  static isPlatinumMarketOpen(): boolean {
    const now = new Date()

    const ukTime = new Date(now.toLocaleString("en-US", { timeZone: "Europe/London" }))
    const day = ukTime.getDay() // 0 = Sunday, 6 = Saturday
    const hours = ukTime.getHours()
    const minutes = ukTime.getMinutes()
    const timeInMinutes = hours * 60 + minutes

    // Saturday: Market closed
    if (day === 6) {
      return false
    }

    // Sunday: Opens at 11:00 PM UK time (6:00 PM ET)
    if (day === 0) {
      return timeInMinutes >= 23 * 60
    }

    // Friday: Closes at 10:15 PM UK time (5:15 PM ET)
    if (day === 5) {
      return timeInMinutes < 22 * 60 + 15
    }

    // Monday-Thursday: Check for daily maintenance window
    // Market closes 10:15 PM - 11:00 PM UK time (5:15 PM - 6:00 PM ET)
    const inMaintenanceWindow = timeInMinutes >= 22 * 60 + 15 && timeInMinutes < 23 * 60

    return !inMaintenanceWindow
  }

  static getMarketStatus(): { isOpen: boolean; message: string; nextOpen?: string } {
    const isOpen = this.isPlatinumMarketOpen()

    if (isOpen) {
      return {
        isOpen: true,
        message: "Platinum market is open",
      }
    }

    const now = new Date()
    const ukTime = new Date(now.toLocaleString("en-US", { timeZone: "Europe/London" }))
    const day = ukTime.getDay()
    const hours = ukTime.getHours()
    const minutes = ukTime.getMinutes()

    // Saturday
    if (day === 6) {
      return {
        isOpen: false,
        message: "Market closed for weekend. Opens Sunday 11:00 PM UK time",
        nextOpen: "Sunday 11:00 PM UK",
      }
    }

    // Sunday before 11 PM
    if (day === 0 && hours < 23) {
      return {
        isOpen: false,
        message: "Market opens Sunday 11:00 PM UK time",
        nextOpen: "Sunday 11:00 PM UK",
      }
    }

    // Friday after 10:15 PM
    if (day === 5 && (hours > 22 || (hours === 22 && minutes >= 15))) {
      return {
        isOpen: false,
        message: "Market closed until Sunday 11:00 PM UK time",
        nextOpen: "Sunday 11:00 PM UK",
      }
    }

    // Monday-Thursday: Daily maintenance window 10:15 PM - 11:00 PM UK time
    if ((day >= 1 && day <= 4) && hours === 22 && minutes >= 15) {
      return {
        isOpen: false,
        message: "Market temporarily closed (10:15 PM - 11:00 PM UK). Reopens at 11:00 PM UK today",
        nextOpen: "Today 11:00 PM UK",
      }
    }

    return {
      isOpen: false,
      message: "Market status unknown",
    }
  }
}
