export class MarketHours {
  // OANDA Market Hours: Sunday 10:00 PM GMT - Friday 10:00 PM GMT (24/5 continuous)
  static isGoldSilverMarketOpen(): boolean {
    const now = new Date()
    
    // Get current time in GMT (UTC)
    const gmtHours = now.getUTCHours()
    const gmtDay = now.getUTCDay() // 0 = Sunday, 6 = Saturday
    
    console.log(`[v0] Market hours check (GMT): day=${gmtDay}, hour=${gmtHours}, date=${now.toISOString()}`)
    
    // Saturday is completely closed
    if (gmtDay === 6) {
      console.log("[v0] Market closed: Saturday")
      return false
    }
    
    // Sunday opens at 10 PM GMT (hour 22)
    if (gmtDay === 0) {
      const isOpen = gmtHours >= 22
      console.log(`[v0] Sunday check: hour=${gmtHours}, isOpen=${isOpen} (opens 22:00 GMT)`)
      return isOpen
    }
    
    // Monday-Friday: Open 24/5 (all hours 0-23)
    if (gmtDay >= 1 && gmtDay <= 5) {
      console.log(`[v0] Weekday: Open 24/5`)
      return true
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
    const gmtHours = now.getUTCHours()
    const gmtDay = now.getUTCDay()

    // Saturday
    if (gmtDay === 6) {
      return {
        isOpen: false,
        message: "Market closed for weekend. Opens Sunday 10:00 PM GMT",
        nextOpen: "Sunday 10:00 PM GMT",
      }
    }

    // Sunday before 10 PM GMT
    if (gmtDay === 0 && gmtHours < 22) {
      return {
        isOpen: false,
        message: "Market opens Sunday 10:00 PM GMT",
        nextOpen: "Sunday 10:00 PM GMT",
      }
    }

    // Friday after 10 PM GMT
    if (gmtDay === 5 && gmtHours >= 22) {
      return {
        isOpen: false,
        message: "Market closed until Sunday 10:00 PM GMT",
        nextOpen: "Sunday 10:00 PM GMT",
      }
    }

    return {
      isOpen: false,
      message: "Market is closed",
    }
  }
}
