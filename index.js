import fs from 'fs'
import { PublicKey, Connection, StakeProgram } from '@solana/web3.js'

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
  maxAttempts = 1,
  delay = 1000
) {
  let stakeAccounts = []

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    stakeAccounts = await connection.getProgramAccounts(
      StakeProgram.programId,
      {
        filters: [
          {
            dataSize: 200, // This filter specifies that we're only interested in accounts with a data size of exactly 200 bytes.
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

    if (isArrayNotEmpty(stakeAccounts)) {
      console.log(`Found ${stakeAccounts.length} stake accounts for address`)
      break // Exit if success
    }

    if (attempt < maxAttempts - 1) {
      console.log(`No stake accounts found, waiting 1 second before retrying`)
      await new Promise((resolve) => setTimeout(resolve, delay)) // Wait for delay ms before the next attempt
    }
  }

  return { stakeAccounts }
}

export async function getAssociatedStakeAccounts(connection, address) {
  const stakeAccounts = await getStakeAccountsForAddress(connection, address)
  const associatedStakeAccounts = stakeAccounts.stakeAccounts.map((account) =>
    account.pubkey.toBase58()
  )
  console.log(
    `Found ${associatedStakeAccounts.length} associated stake accounts for address`
  )
  return associatedStakeAccounts
}

export async function getSignaturesForAddress(
  connection,
  address,
  commitment = 'confirmed'
) {
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
}

export async function readAddressesFromFile(filePath) {
  const addresses = new Set()

  try {
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
  } catch (err) {
    throw new Error(`Error reading file: ${err}`)
  }

  return Array.from(addresses)
}

export async function getTotalTransactionCount(connection, addresses) {
  let totalTransactions = 0

  for (const address of addresses) {
    console.log(`Processing address ${address}`)
    const accountInfo = await connection.getParsedAccountInfo(
      new PublicKey(address)
    )

    // Check if the address is a stake account
    if (accountInfo?.value?.data?.program === 'stake') {
      console.log(`Address is a stake account`)
      const { signatures } = await getSignaturesForAddress(connection, address)
      totalTransactions += signatures.length
      console.log(`Total transactions for stake account: ${signatures.length}`)

      console.log(``)
      console.log(`====================================`)
      console.log(``)
    }
    // check if address is a main authority account
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
        console.log(``)
        console.log(
          `Total transactions for associated stake account: ${signatures.length}`
        )
        console.log(``)
      }
    }
    // Check if the address is a normal account
    else if (
      !(await hasStakeAccount(connection, address)) &&
      accountInfo?.value?.data?.program !== 'stake'
    ) {
      console.log(`Address is a normal account`)
      const { signatures } = await getSignaturesForAddress(connection, address)

      totalTransactions += signatures.length

      console.log(`Total transactions for normal account: ${signatures.length}`)

      console.log(``)
      console.log(`====================================`)
      console.log(``)
    } else {
      console.log('invalid address')
    }

    console.log('Accumulating total transactions:', totalTransactions)
  }

  return totalTransactions
}

async function main() {
  const connection = new Connection('<RPC ENDPOINT HERE>', 'confirmed')
  const addressFile = './addresses.txt'
  const addresses = await readAddressesFromFile(addressFile)

  console.log(`Processing ${addresses.length} addresses`)
  const totalTransactions = await getTotalTransactionCount(
    connection,
    addresses
  )
  console.log(`Total transactions: ${totalTransactions}`)
}

main()
