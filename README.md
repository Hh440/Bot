# Bot

## Overview

The **Bot** is a swapping bot built on the Solana blockchain that utilizes the Jupiter Swap API. It automatically swaps USD to SOL or vice versa based on predefined conditions. The bot continuously monitors the market and executes trades when the specified conditions are met.

## Features

- Swaps USD to SOL and SOL to USD.
- Uses the Jupiter Swap API for efficient trading.
- Continuously monitors market conditions.
- Configurable parameters for trading conditions.

## Prerequisites

Before running the bot, ensure you have the following installed:

- Node.js (v14 or higher)
- npm (Node package manager)
- Solana CLI

## Installation

1. Clone the repository:

   ```bash
   git clone https://github.com/yourusername/bot.git
   ```
2. Navigate to the Repositary:

   ```bash
   cd bot
   ```
3. Install the required dependencies:

   ```bash
   npm install
   ```
4. Create a .env file in the root directory and add Configuration:
   ```bash
   # Replace with your Your Solana wallet secret key
   SECRET_KEY=[00, 00, ... 00]
   # Replace with your QuickNode Solana Mainnet RPC endpoint
   SOLANA_ENDPOINT=https://example.solana-mainnet.quiknode.pro/123456/
   # Replace with your QuickNode Jupiter API endpoint (or a public one: https://www.jupiterapi.com/)
   METIS_ENDPOINT=https://jupiter-swap-api.quiknode.pro/123456
   
   ```

## Usage

To start the bot:

```bash
npx tsc
node dist/index.js
```

## How it Works

- The bot continuously fetches current market prices using the Jupiter Swap API.
- It checks if the market conditions match the specified criteria.
- If conditions are met, it executes the swap.
- The process repeats until manually stopped or until the specified conditions are no longer met.

## Contribbuting

Contributions are welcome! Please follow these steps to contribute:

- Fork the repository.
- Create a new branch (git checkout -b feature-branch).
- Make your changes and commit them (git commit -m 'Add new feature').
- Push to the branch (git push origin feature-branch).
- Create a new Pull Request.

## License

This project is licensed under the MIT License. See the LICENSE file for details.


