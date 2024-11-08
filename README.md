# Integral Get Solana Transaction Count

## Overview
This Node.js script processes a list of Solana addresses to count their total transactions, including those of associated stake accounts.

## Prerequisites
* Node.js and npm installed.
* A Solana RPC endpoint.

## Installation
1. Clone the repository:

```sh
git clone https://github.com/arint01/integral-get-solana-txn-count.git
cd integral-get-solana-txn-count
```

2. Install the necessary dependencies:

```sh
npm install
```

## Configuration
1. Create a file named `.env` in the root directory and add your Solana RPC endpoint:

```sh
RPC_ENDPOINT=<Your Solana RPC Endpoint>
```

2. Prepare a text file named `addresses.txt` in the root directory with one Solana address per line.

## Running the Script
To run the script and get the total transaction count:

```sh
node index.js
```

## Notes
* Ensure the `addresses.txt` file contains valid Solana addresses.
* The script will log the total transaction count for each address and associated stake accounts.

This README provides instructions for installing dependencies, configuring the environment, and running the Node.js script.
