#!/usr/bin/env node

/**
 * OANDA Instruments Fetcher
 * Calls OANDA v3 accounts/instruments endpoint and filters for CFD indices
 * Returns correct instrument "name" fields for NAS100, SPX500, JP225
 */

const https = require('https')

// Detect server from environment or use live by default
const server = process.env.OANDA_SERVER || 'live'
const OANDA_HOST = server === 'live' ? 'api-fxtrade.oanda.com' : 'api-fxpractice.oanda.com'
const ACCOUNT_ID = process.env.OANDA_ACCOUNT_ID
const API_KEY = process.env.OANDA_API_KEY

if (!API_KEY || !ACCOUNT_ID) {
  console.error('ERROR: Missing OANDA_API_KEY or OANDA_ACCOUNT_ID environment variables')
  process.exit(1)
}

// OANDA account IDs are numeric strings - use as-is
const formattedAccountId = String(ACCOUNT_ID).trim()
const OANDA_PATH = `/v3/accounts/${formattedAccountId}/instruments`

console.log(`[OANDA] Connecting to ${server} server: ${OANDA_HOST}`)
console.log(`[OANDA] Using Account ID: ${formattedAccountId}`)
console.log(`[OANDA] Fetching from ${OANDA_PATH}\n`)

const options = {
  hostname: OANDA_HOST,
  path: OANDA_PATH,
  method: 'GET',
  headers: {
    'Authorization': `Bearer ${API_KEY}`,
    'Content-Type': 'application/json',
    'User-Agent': 'TradeB-v5.2.1',
  },
}

const req = https.request(options, (res) => {
  let data = ''

  res.on('data', (chunk) => {
    data += chunk
  })

  res.on('end', () => {
    if (res.statusCode !== 200) {
      console.error(`ERROR: OANDA API returned ${res.statusCode}`)
      try {
        const errorData = JSON.parse(data)
        console.error(JSON.stringify(errorData, null, 2))
      } catch {
        console.error(data)
      }
      process.exit(1)
    }

    try {
      const response = JSON.parse(data)
      const instruments = response.instruments || []

      console.log(`[OANDA] Total instruments available: ${instruments.length}\n`)

      // Print first 10 instruments for context
      console.log('[INFO] First 10 available instruments:')
      instruments.slice(0, 10).forEach((inst) => {
        console.log(`  - ${inst.name}: ${inst.displayName} (${inst.type})`)
      })
      console.log()

      // Filter for CFD indices containing NAS, SPX, or 225
      const indexCFDs = instruments.filter((inst) => {
        return (
          inst.type === 'CFD' &&
          (inst.displayName.includes('NAS') ||
            inst.displayName.includes('SPX') ||
            inst.displayName.includes('225'))
        )
      })

      if (indexCFDs.length === 0) {
        console.error('[ERROR] No CFD indices found matching NAS/SPX/225 criteria')
        console.log('\n[HELP] Check if these indices are available in your account')
        process.exit(1)
      }

      console.log('[FILTERED] CFD Indices matching criteria:\n')
      console.log('Symbol Mapping for Trading System:')
      console.log('=====================================\n')

      const mapping = {}

      indexCFDs.forEach((inst) => {
        console.log(`Display Name: ${inst.displayName}`)
        console.log(`OANDA Name:   ${inst.name}`)
        console.log(`Type:         ${inst.type}`)
        console.log(`Pipette:      ${inst.pipette}`)
        console.log()

        // Map to our symbols
        if (inst.displayName.includes('NAS')) {
          mapping.US100 = inst.name
        } else if (inst.displayName.includes('SPX')) {
          mapping.US500 = inst.name
        } else if (inst.displayName.includes('225')) {
          mapping.JP225 = inst.name
        }
      })

      console.log('\n[CONFIG] Update lib/data-fetcher.ts to use exact OANDA names:')
      console.log('=====================================\n')
      console.log(`const OANDA_INSTRUMENT_NAMES = {`)
      console.log(`  XAU_USD: "XAU_USD",`)
      console.log(`  US100: "${mapping.US100 || 'NOT_FOUND'}",`)
      console.log(`  US500: "${mapping.US500 || 'NOT_FOUND'}",`)
      console.log(`  JP225: "${mapping.JP225 || 'NOT_FOUND'}",`)
      console.log(`}`)

      if (Object.keys(mapping).length < 3) {
        console.error(
          '\n[ERROR] Not all required indices found. Check OANDA account permissions and available instruments.'
        )
        process.exit(1)
      }

      console.log('\n[SUCCESS] All required indices found and mapped.')
    } catch (err) {
      console.error('ERROR parsing JSON response:', err.message)
      process.exit(1)
    }
  })
})

req.on('error', (err) => {
  console.error('ERROR making OANDA request:', err.message)
  process.exit(1)
})

req.end()


