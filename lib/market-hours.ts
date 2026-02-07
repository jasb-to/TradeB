export class MarketHours {
  // Gold and Silver trade 24 hours per day, 5 days per week (Sun 5 PM ET - Fri 5 PM ET)
  static isGoldSilverMarketOpen(): boolean {
    const now = new Date()
    
    // Convert to ET for market hours
    const etTime = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }))
    const day = etTime.getDay() // 0 = Sunday, 6 = Saturday
    const hours = etTime.getHours()
    
    // Saturday is completely closed
    if (day === 6) {
      return false
    }
    
    // Sunday opens at 5 PM ET (day 0, hour 17)
    if (day === 0) {
      return hours >= 17
    }
    
    // Monday-Thursday: Open all day (0-23)
    if (day >= 1 && day <= 4) {
      return true
    }
    
    // Friday: Open until 5 PM ET (hour < 17)
    if (day === 5) {
      return hours < 17
    }
    
    return false
  }

  static getMarketStatus(): { isOpen: boolean; message: string; nextOpen?: string } {
    const isOpen = this.isGoldSilverMarketOpen()

    if (isOpen) {
      return {
        isOpen: true,
        message: "Market is open",
      }
    }

    const now = new Date()
    const etTime = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }))
    const day = etTime.getDay()
    const hours = etTime.getHours()

    // Saturday
    if (day === 6) {
      return {
        isOpen: false,
        message: "Market closed for weekend. Opens Sunday 5:00 PM ET",
        nextOpen: "Sunday 5:00 PM ET",
      }
    }

    // Sunday before 5 PM ET
    if (day === 0 && hours < 17) {
      return {
        isOpen: false,
        message: "Market opens Sunday 5:00 PM ET",
        nextOpen: "Sunday 5:00 PM ET",
      }
    }

    // Friday after 5 PM ET
    if (day === 5 && hours >= 17) {
      return {
        isOpen: false,
        message: "Market closed until Sunday 5:00 PM ET",
        nextOpen: "Sunday 5:00 PM ET",
      }
    }

    return {
      isOpen: false,
      message: "Market is closed",
    }
  }
}
