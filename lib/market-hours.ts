export class MarketHours {
  // OANDA Market Hours: Sunday 11:00 PM GMT - Friday 10:00 PM GMT (22:00 GMT close)
  // Note: Forex/precious metals close at 22:00 GMT Friday (10 PM UK time)
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
    
    // Sunday opens at 11 PM GMT (hour 23)
    if (gmtDay === 0) {
      const isOpen = gmtHours >= 23
      console.log(`[v0] Sunday check: hour=${gmtHours}, isOpen=${isOpen} (opens 23:00 GMT)`)
      return isOpen
    }
    
    // Monday-Thursday: Open 24/5 (all hours 0-23)
    if (gmtDay >= 1 && gmtDay <= 4) {
      console.log(`[v0] ${["Mon", "Tue", "Wed", "Thu"][gmtDay - 1]}: Open 24/5`)
      return true
    }
    
    // Friday: Open until 22:00 GMT (10 PM UK time), then CLOSED
    if (gmtDay === 5) {
      const isOpen = gmtHours < 22
      console.log(`[v0] Friday check: hour=${gmtHours}, isOpen=${isOpen} (closes 22:00 GMT / 10 PM UK)`)
      return isOpen
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
        message: "Market closed for weekend. Opens Sunday 11:00 PM GMT",
        nextOpen: "Sunday 11:00 PM GMT",
      }
    }

    // Sunday before 11 PM GMT
    if (gmtDay === 0 && gmtHours < 23) {
      return {
        isOpen: false,
        message: "Market opens Sunday 11:00 PM GMT",
        nextOpen: "Sunday 11:00 PM GMT",
      }
    }

    // Friday after 10 PM GMT (22:00) - FINAL MARKET CLOSE
    if (gmtDay === 5 && gmtHours >= 22) {
      return {
        isOpen: false,
        message: "Market closed for weekend. Friday close at 22:00 GMT (10 PM UK). Reopens Sunday 11:00 PM GMT",
        nextOpen: "Sunday 11:00 PM GMT",
      }
    }

    return {
      isOpen: false,
      message: "Market is closed",
    }
  }
}
