#!/usr/bin/env node

/**
 * OANDA Instruments Fetcher
 * 
 * Fetches all tradable CFD instruments from OANDA and filters for:
 * - NAS (Nasdaq 100)
 * - SPX (S&P 500)
 * - 225 (Nikkei 225)
 * 
 * Returns exact "name" field as OANDA expects for API calls
 */

import https from 'https'

const OANDA_API_KEY = process.env.OANDA_API_KEY
const ACCOUNT_ID = process.env.OANDA_ACCOUNT_ID || 'demo'

if (!OANDA_API_KEY) {
  console.error('ERROR: OANDA_API_KEY environment variable not set')
  process.exit(1)
}

function fetchInstruments(): Promise<void> {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api-fxpractice.oanda.com',
      port: 443,
      path: `/v3/accounts/${ACCOUNT_ID}/instruments`,
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${OANDA_API_KEY}`,
        'Content-Type': 'application/json',
        'Accept-Datetime-Format': 'RFC3339',
      },
    }

    const req = https.request(options, (res) => {
      let data = ''

      res.on('data', (chunk) => {
        data += chunk
      })

      res.on('end', () => {
        try {
          const response = JSON.parse(data)

          if (!response.instruments || !Array.isArray(response.instruments)) {
            console.error('ERROR: Invalid response format - no instruments array')
            reject(new Error('Invalid response'))
            return
          }

          console.log(`\n📊 FULL INSTRUMENT LIST (${response.instruments.length} total instruments)\n`)
          console.log('='.repeat(100))

          // Filter for CFD instruments
          const cfdInstruments = response.instruments.filter(
            (inst: any) => inst.type === 'CFD'
          )

          console.log(`\nCFD Instruments Only (${cfdInstruments.length} total)\n`)

          // Filter for our target indices
          const targets = ['NAS', 'SPX', '225']
          const filteredInstruments = cfdInstruments.filter((inst: any) =>
            targets.some(target => inst.displayName?.includes(target))
          )

          console.log(`\n🎯 FILTERED RESULTS - CFD instruments containing NAS/SPX/225:\n`)
          console.log('='.repeat(100))

          if (filteredInstruments.length === 0) {
            console.log('\nNo matching instruments found!')
            console.log('\nSearching for closest matches...\n')
            
            const partialMatches = cfdInstruments.filter((inst: any) => {
              const displayName = (inst.displayName || '').toUpperCase()
              return displayName.includes('NAS') || displayName.includes('S&P') || displayName.includes('NIKKEI')
            })

            if (partialMatches.length > 0) {
              console.log('Partial matches found:\n')
              partialMatches.forEach((inst: any) => {
                console.log(`  name: "${inst.name}"`)
                console.log(`  displayName: "${inst.displayName}"`)
                console.log(`  type: ${inst.type}`)
                console.log('')
              })
            }
          } else {
            console.log('\n✅ INSTRUMENT NAMES FOR API CALLS:\n')
            filteredInstruments.forEach((inst: any) => {
              console.log(`\n${inst.displayName}:`)
              console.log(`  ├─ name: "${inst.name}"`)
              console.log(`  ├─ displayName: "${inst.displayName}"`)
              console.log(`  ├─ type: ${inst.type}`)
              console.log(`  └─ pipLocation: ${inst.pipLocation}`)
            })

            console.log('\n' + '='.repeat(100))
            console.log('\n📌 RECOMMENDED TRADING_SYMBOLS UPDATE:\n')
            
            const instrumentNames = filteredInstruments.map((inst: any) => `"${inst.name}"`).join(', ')
            console.log(`export const TRADING_SYMBOLS = [${instrumentNames}] as const`)
          }

          resolve()
        } catch (error) {
          console.error('ERROR parsing response:', error)
          reject(error)
        }
      })
    })

    req.on('error', (error) => {
      console.error('ERROR fetching instruments:', error)
      reject(error)
    })

    req.end()
  })
}

// Run
fetchInstruments().catch((error) => {
  process.exit(1)
})
