#!/usr/bin/env node

/**
 * OANDA Instruments Fetcher
 * Calls OANDA v3 instruments endpoint and filters for CFD indices
 * Returns correct instrument "name" fields for NAS100, SPX500, JP225
 */

const https = require('https')

const OANDA_HOST = 'api-fxpractice.oanda.com'
const OANDA_PATH = '/v3/instruments'
const ACCOUNT_ID = process.env.OANDA_ACCOUNT_ID || 'demo'
const API_KEY = process.env.OANDA_API_KEY

if (!API_KEY) {
  console.error('ERROR: OANDA_API_KEY environment variable not set')
  process.exit(1)
}

console.log('[OANDA] Fetching instruments from OANDA v3 API...\n')

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
      console.error(data)
      process.exit(1)
    }

    try {
      const response = JSON.parse(data)
      const instruments = response.instruments || []

      console.log(`[OANDA] Total instruments available: ${instruments.length}\n`)

      // Filter for CFD indices containing NAS, SPX, or 225
      const indexCFDs = instruments.filter((inst) => {
        return (
          inst.type === 'CFD' &&
          (inst.displayName.includes('NAS') ||
            inst.displayName.includes('SPX') ||
            inst.displayName.includes('225'))
        )
      })

      console.log('[FILTERED] CFD Indices matching criteria:\n')
      console.log('Symbol Mapping for Trading System:')
      console.log('=====================================\n')

      const mapping = {}

      indexCFDs.forEach((inst) => {
        console.log(`Display Name: ${inst.displayName}`)
        console.log(`OANDA Name:   ${inst.name}`)
        console.log(`Type:         ${inst.type}`)
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

      console.log('\n[CONFIG] Update trading-symbols.ts with exact OANDA names:')
      console.log('=====================================\n')
      console.log(`export const OANDA_INSTRUMENT_MAPPING = {`)
      console.log(`  XAU_USD: "XAU_USD",  // Already correct`)
      console.log(`  US100: "${mapping.US100}",`)
      console.log(`  US500: "${mapping.US500}",`)
      console.log(`  JP225: "${mapping.JP225}",`)
      console.log(`}`)

      if (Object.keys(mapping).length < 3) {
        console.error(
          '\n[ERROR] Not all required indices found. Check OANDA account permissions.'
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
