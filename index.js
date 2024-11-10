import fs from 'fs'
import { PublicKey, Connection, StakeProgram } from '@solana/web3.js'

// Retry wrapper function
async function withRetry(operation, maxAttempts = 20, delay = 1000) {
  let lastError

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await operation()
    } catch (error) {
      lastError = error
      console.error(`Attempt ${attempt}/${maxAttempts} failed: ${error.message}`)

      if (attempt < maxAttempts) {
        console.log(`Waiting ${delay}ms before retry...`)
        await new Promise(resolve => setTimeout(resolve, delay))
        // Exponential backoff
        delay *= 2
      }
    }
  }

  throw lastError
}

function isArrayNotEmpty(array) {
  return array?.length > 0
}

export async function isValidSolanaAddress(address) {
  try {
    new PublicKey(address)
    return true
  } catch (err) {
    console.error(`Address is invalid`)
    return false
  }
}

export async function hasStakeAccount(connection, address) {
  const stakeAccounts = await getStakeAccountsForAddress(connection, address)
  const hasStakeAccount = isArrayNotEmpty(stakeAccounts.stakeAccounts)
  return hasStakeAccount
}

async function getStakeAccountsForAddress(
    connection,
    address,
    maxAttempts = 3,
    delay = 1000
) {
  return withRetry(
      async () => {
        const stakeAccounts = await connection.getProgramAccounts(
            StakeProgram.programId,
            {
              filters: [
                {
                  dataSize: 200,
                },
                {
                  memcmp: {
                    offset: 44,
                    bytes: address,
                  },
                },
              ],
            }
        )

        console.log(`Found ${stakeAccounts.length} stake accounts for address`)
        return { stakeAccounts }
      },
      maxAttempts,
      delay
  )
}

export async function getAssociatedStakeAccounts(connection, address) {
  return withRetry(async () => {
    const stakeAccounts = await getStakeAccountsForAddress(connection, address)
    const associatedStakeAccounts = stakeAccounts.stakeAccounts.map((account) =>
        account.pubkey.toBase58()
    )
    console.log(
        `Found ${associatedStakeAccounts.length} associated stake accounts for address`
    )
    return associatedStakeAccounts
  })
}

export async function getSignaturesForAddress(
    connection,
    address,
    commitment = 'confirmed'
) {
  return withRetry(async () => {
    const publicKey = new PublicKey(address)
    let signatures = []
    let fetchedSignatures
    let lastSignature = null

    do {
      fetchedSignatures = await connection.getSignaturesForAddress(publicKey, {
        before: lastSignature,
        limit: 1000,
        commitment,
      })
      signatures.push(...fetchedSignatures)
      lastSignature =
          fetchedSignatures.length > 0
              ? fetchedSignatures[fetchedSignatures.length - 1].signature
              : null
    } while (fetchedSignatures.length === 1000)
    return { signatures }
  })
}

export async function readAddressesFromFile(filePath) {
  return withRetry(async () => {
    const addresses = new Set()
    const data = await fs.promises.readFile(filePath, 'utf8')
    const lines = data.trim().split('\n')

    for (const line of lines) {
      const address = line.trim()
      if (await isValidSolanaAddress(address)) {
        addresses.add(address)
      } else {
        console.error(`Invalid address: ${address}, skipping...`)
      }
    }

    return Array.from(addresses)
  })
}

export async function getTotalTransactionCount(connection, addresses) {
  let totalTransactions = 0

  for (const address of addresses) {
    try {
      console.log(`Processing address ${address}`)
      const accountInfo = await withRetry(() =>
          connection.getParsedAccountInfo(new PublicKey(address))
      )

      if (accountInfo?.value?.data?.program === 'stake') {
        console.log(`Address is a stake account`)
        const { signatures } = await getSignaturesForAddress(connection, address)
        totalTransactions += signatures.length
        console.log(`Total transactions for stake account: ${signatures.length}`)
      }
      else if (await hasStakeAccount(connection, address)) {
        console.log(`Address is a main authority account`)
        const { signatures } = await getSignaturesForAddress(connection, address)
        console.log(
            `Total transactions for main authority account: ${signatures.length}`
        )
        totalTransactions += signatures.length

        const associatedStakeAccounts = await getAssociatedStakeAccounts(
            connection,
            address
        )

        for (const stakeAccount of associatedStakeAccounts) {
          console.log('Processing associated stake account:', stakeAccount)
          const { signatures } = await getSignaturesForAddress(
              connection,
              stakeAccount
          )
          totalTransactions += signatures.length
          console.log(
              `Total transactions for associated stake account: ${signatures.length}`
          )
        }
      }
      else if (
          !(await hasStakeAccount(connection, address)) &&
          accountInfo?.value?.data?.program !== 'stake'
      ) {
        console.log(`Address is a normal account`)
        const { signatures } = await getSignaturesForAddress(connection, address)
        totalTransactions += signatures.length
        console.log(`Total transactions for normal account: ${signatures.length}`)
      }
      else {
        console.log('invalid address')
      }

      console.log('Accumulating total transactions:', totalTransactions)
      console.log(`====================================`)

    } catch (error) {
      console.error(`Error processing address ${address}:`, error)
      continue // Skip to next address on error
    }
  }

  return totalTransactions
}

async function main() {
  const connection = new Connection(
      process.env.RPC_URL || 'https://api.mainnet-beta.solana.com',
      'confirmed'
  )
  const addressFile = './addresses.txt'

  try {
    const addresses = await readAddressesFromFile(addressFile)
    console.log(`Processing ${addresses.length} addresses`)
    const totalTransactions = await getTotalTransactionCount(connection, addresses)
    console.log(`Total transactions: ${totalTransactions}`)
  } catch (error) {
    console.error('Fatal error:', error)
    process.exit(1)
  }
}

main()