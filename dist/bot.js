"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ArbBot = exports.SwapToken = void 0;
const web3_js_1 = require("@solana/web3.js");
const api_1 = require("@jup-ag/api");
const spl_token_1 = require("@solana/spl-token");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
var SwapToken;
(function (SwapToken) {
    SwapToken[SwapToken["SOL"] = 0] = "SOL";
    SwapToken[SwapToken["USDC"] = 1] = "USDC";
})(SwapToken || (exports.SwapToken = SwapToken = {}));
class ArbBot {
    constructor(config) {
        this.usdcMint = new web3_js_1.PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");
        this.solMint = new web3_js_1.PublicKey("So11111111111111111111111111111111111111112");
        this.solBalance = 0;
        this.usdcBalance = 0;
        this.lastCheck = 0;
        this.checkInterval = 1000 * 10;
        this.targetGainPercentage = 1;
        this.waitingForConfirmation = false;
        const { solanaEndpoint, metisEndpoint, secretKey, targetGainPercentage, checkInterval, initialInputToken, initialInputAmount, firstTradePrice } = config;
        this.solanaConnection = new web3_js_1.Connection(solanaEndpoint);
        this.jupiterApi = (0, api_1.createJupiterApiClient)({ basePath: metisEndpoint });
        this.wallet = web3_js_1.Keypair.fromSecretKey(secretKey);
        this.usdcTokenAccount = (0, spl_token_1.getAssociatedTokenAddressSync)(this.usdcMint, this.wallet.publicKey);
        if (targetGainPercentage) {
            this.targetGainPercentage = targetGainPercentage;
        }
        if (checkInterval) {
            this.checkInterval = checkInterval;
        }
        this.nextTrade = {
            inputMint: initialInputToken === SwapToken.SOL ? this.solMint.toBase58() : this.usdcMint.toBase58(),
            outputMint: initialInputToken === SwapToken.SOL ? this.usdcMint.toBase58() : this.solMint.toBase58(),
            amount: initialInputAmount,
            nextTradeThreshold: firstTradePrice
        };
    }
    init() {
        return __awaiter(this, void 0, void 0, function* () {
            console.log(`🤖 Initiating arb bot for wallet: ${this.wallet.publicKey.toBase58()} `);
            yield this.refreshBalances();
            console.log(`🏦 Current balance :\nSOL: ${this.solBalance / web3_js_1.LAMPORTS_PER_SOL},\nUSDC:${this.usdcBalance}`);
            this.initiatePriceWatch();
        });
    }
    // use to fetch the sol and usdc balance
    refreshBalances() {
        return __awaiter(this, void 0, void 0, function* () {
            var _a;
            try {
                const results = yield Promise.allSettled([
                    this.solanaConnection.getBalance(this.wallet.publicKey),
                    this.solanaConnection.getTokenAccountBalance(this.usdcTokenAccount)
                ]);
                const solBalanceResult = results[0];
                const usdcBalanceResult = results[1];
                if (solBalanceResult.status === 'fulfilled') {
                    this.solBalance = solBalanceResult.value;
                }
                else {
                    console.error('Error fetching SOL balance: ', solBalanceResult.reason);
                }
                if (usdcBalanceResult.status === 'fulfilled') {
                    this.usdcBalance = (_a = usdcBalanceResult.value.value.uiAmount) !== null && _a !== void 0 ? _a : 0;
                }
                else {
                    this.usdcBalance = 0;
                }
                if (this.solBalance < web3_js_1.LAMPORTS_PER_SOL / 100) {
                    this.terminateSession("Low SOL balance");
                }
            }
            catch (error) {
                console.error('Unexpected error during balance refresh: ', error);
            }
        });
    }
    //use to start the price watch interval.
    initiatePriceWatch() {
        this.priceWatchInterValId = setInterval(() => __awaiter(this, void 0, void 0, function* () {
            const currentTime = Date.now();
            if (currentTime - this.lastCheck >= this.checkInterval) {
                this.lastCheck = currentTime;
                try {
                    if (this.waitingForConfirmation) {
                        console.log('waiting for the previous transition to confirm...');
                        return;
                    }
                    const quote = yield this.getQuote(this.nextTrade);
                    this.evaluateQuoteAndSwap(quote);
                }
                catch (error) {
                    console.log('Error getting quote: ', error);
                }
            }
        }), this.checkInterval);
    }
    // function to get the quote from the jupiter's quoteGet
    getQuote(quoteRequest) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const quote = yield this.jupiterApi.quoteGet(quoteRequest);
                if (!quote) {
                    throw new Error('No quote found');
                }
                return quote;
            }
            catch (error) {
                if (error instanceof api_1.ResponseError) {
                    console.log(yield error.response.json());
                }
                else {
                    console.error(error);
                }
                throw new Error('unable to find quote');
            }
        });
    }
    // function evaluate the quote and then perform swap
    evaluateQuoteAndSwap(quote) {
        return __awaiter(this, void 0, void 0, function* () {
            let difference = (parseInt(quote.outAmount) - this.nextTrade.nextTradeThreshold) / this.nextTrade.nextTradeThreshold;
            console.log(`📈 Current price: ${quote.outAmount} is ${difference > 0 ? 'higher' : 'lower'} than the next trade threshold: ${this.nextTrade.nextTradeThreshold} by ${Math.abs(difference * 100).toFixed(2)}%.`);
            if (parseInt(quote.outAmount) > this.nextTrade.nextTradeThreshold) {
                try {
                    this.waitingForConfirmation = true;
                    yield this.executeSwap(quote);
                }
                catch (error) {
                    console.log('Erorr executing swap: ', error);
                }
            }
        });
    }
    // function to confirm the transaction
    confirmTransaction(connection_1, signature_1) {
        return __awaiter(this, arguments, void 0, function* (connection, signature, desiredConfirmationStatus = 'confirmed', timeout = 30000, pollInterval = 1000, searchTransactionHistory = false) {
            const start = Date.now();
            while (Date.now() - start < timeout) {
                const { value: statuses } = yield connection.getSignatureStatuses([signature], { searchTransactionHistory });
                if (!statuses || statuses.length === 0) {
                    throw new Error('Failed to get signature status');
                }
                const status = statuses[0];
                if (status === null) {
                    yield new Promise(resolve => setTimeout(resolve, pollInterval));
                    continue;
                }
                if (status.err) {
                    throw new Error(`Transaction failed: ${JSON.stringify(status.err)}`);
                }
                if (status.confirmationStatus && status.confirmationStatus === desiredConfirmationStatus) {
                    return status;
                }
                if (status.confirmationStatus === 'finalized') {
                    return status;
                }
                yield new Promise(resolve => setTimeout(resolve, pollInterval));
            }
            throw new Error(`Transaction confirmation timeout after ${timeout}ms`);
        });
    }
    ;
    /* if the bot detects that market conditions are appropriate to satisfy our requirments, we should execute the trade
    steps:
    1. fetch the swap instructions from jupiter's api
    2. Refractor our recieved instructions data to transaction instructions
    3. fetch the address lookup table accounts
    4. create and send a Solana Transaction
    5. On success, log the swap and update the next trade conditions
    
    
    
    */
    executeSwap(route) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const { computeBudgetInstructions, setupInstructions, swapInstruction, cleanupInstruction, addressLookupTableAddresses, } = yield this.jupiterApi.swapInstructionsPost({
                    swapRequest: {
                        quoteResponse: route,
                        userPublicKey: this.wallet.publicKey.toBase58(),
                        prioritizationFeeLamports: 'auto'
                    },
                });
                const instructions = [
                    ...computeBudgetInstructions.map(this.instructionDataToTransactionInstruction),
                    ...setupInstructions.map(this.instructionDataToTransactionInstruction),
                    this.instructionDataToTransactionInstruction(swapInstruction),
                    this.instructionDataToTransactionInstruction(cleanupInstruction)
                ].filter((ix) => ix !== null);
                const addressLookupTableAccounts = yield this.getAdressLookupTableAccounts(addressLookupTableAddresses, this.solanaConnection);
                const { blockhash, lastValidBlockHeight } = yield this.solanaConnection.getLatestBlockhash();
                const messageV0 = new web3_js_1.TransactionMessage({
                    payerKey: this.wallet.publicKey,
                    recentBlockhash: blockhash,
                    instructions
                }).compileToV0Message(addressLookupTableAccounts);
                const transaction = new web3_js_1.VersionedTransaction(messageV0);
                transaction.sign([this.wallet]);
                const rawTransaction = transaction.serialize();
                const txid = yield this.solanaConnection.sendRawTransaction(rawTransaction, {
                    skipPreflight: true,
                    maxRetries: 2
                });
                const confirmation = yield this.confirmTransaction(this.solanaConnection, txid);
                if (confirmation.err) {
                    throw new Error('Transaction Failed');
                }
                yield this.postTransactionProcessing(route, txid);
            }
            catch (error) {
                if (error instanceof api_1.ResponseError) {
                    console.log(yield error.response.json());
                }
                else {
                    console.error(error);
                }
                throw new Error('unable to execute swap');
            }
            finally {
                this.waitingForConfirmation = false;
            }
        });
    }
    //upadte the arguments after the trade execution
    updateNextTrade(lastTrade) {
        return __awaiter(this, void 0, void 0, function* () {
            const priceChange = this.targetGainPercentage / 100;
            this.nextTrade = {
                inputMint: this.nextTrade.outputMint,
                outputMint: this.nextTrade.inputMint,
                amount: parseInt(lastTrade.outAmount),
                nextTradeThreshold: parseInt(lastTrade.inAmount) * (1 + priceChange)
            };
        });
    }
    logSwap(args) {
        return __awaiter(this, void 0, void 0, function* () {
            const { inputToken, inAmount, outputToken, outAmount, txId, timestamp } = args;
            const logEntry = {
                inputToken,
                inAmount,
                outputToken,
                outAmount,
                txId,
                timestamp,
            };
            const filePath = path.join(__dirname, 'trades.json');
            console.log("File path is:", filePath); // Log the file path
            try {
                // Check if file exists
                if (!fs.existsSync(filePath)) {
                    console.log(`File not found. Creating ${filePath}...`);
                    fs.writeFileSync(filePath, JSON.stringify([logEntry], null, 2), 'utf-8');
                    console.log("File created and log entry written successfully.");
                }
                else {
                    console.log("File exists. Reading content...");
                    const data = fs.readFileSync(filePath, { encoding: 'utf-8' });
                    console.log("File content before update:", data); // Log the content of the file before parsing
                    // Only parse if file is not empty
                    let trades;
                    if (data.trim()) {
                        console.log("Parsing file content...");
                        trades = JSON.parse(data);
                        console.log("Parsed trades:", trades); // Log parsed trades array
                    }
                    else {
                        console.log("File is empty, initializing with empty array.");
                        trades = [];
                    }
                    trades.push(logEntry); // Add new log entry
                    console.log("Updated trades with new log entry:", trades); // Log updated trades
                    // Write updated trades back to file
                    fs.writeFileSync(filePath, JSON.stringify(trades, null, 2), 'utf-8');
                    console.log("Log entry appended to file successfully.");
                }
                console.log(`✅ Logged swap: ${inAmount} ${inputToken} -> ${outAmount} ${outputToken}, TX: ${txId}`);
            }
            catch (error) {
                console.error('Error logging swap:', error);
            }
        });
    }
    terminateSession(reason) {
        console.warn(`❌ Terminating bot...${reason}`);
        console.log(`Current balance:\nSOL:${this.solBalance / web3_js_1.LAMPORTS_PER_SOL},\nUSDC:${this.usdcBalance}`);
        if (this.priceWatchInterValId) {
            clearInterval(this.priceWatchInterValId);
            this.priceWatchInterValId = undefined;
        }
        setTimeout(() => {
            console.log('Bot has been terminated');
            process.exit(1);
        }, 1000);
    }
    instructionDataToTransactionInstruction(instruction) {
        if (instruction == null || instruction === undefined)
            return null;
        return new web3_js_1.TransactionInstruction({
            programId: new web3_js_1.PublicKey(instruction.programId),
            keys: instruction.accounts.map((key) => ({
                pubkey: new web3_js_1.PublicKey(key.pubkey),
                isSigner: key.isSigner,
                isWritable: key.isWritable
            })),
            data: Buffer.from(instruction.data, "base64")
        });
    }
    // will be used to fetch address lookup accounts
    getAdressLookupTableAccounts(keys, connection) {
        return __awaiter(this, void 0, void 0, function* () {
            const addressLookupTableAccountInfos = yield connection.getMultipleAccountsInfo(keys.map((key) => new web3_js_1.PublicKey(key)));
            return addressLookupTableAccountInfos.reduce((acc, accountInfo, index) => {
                const addressLookupTableAddress = keys[index];
                if (accountInfo) {
                    const addressLookupTableAccount = new web3_js_1.AddressLookupTableAccount({
                        key: new web3_js_1.PublicKey(addressLookupTableAddress),
                        state: web3_js_1.AddressLookupTableAccount.deserialize(accountInfo.data),
                    });
                    acc.push(addressLookupTableAccount);
                }
                return acc;
            }, new Array());
        });
    }
    postTransactionProcessing(quote, txid) {
        return __awaiter(this, void 0, void 0, function* () {
            const { inputMint, inAmount, outputMint, outAmount } = quote;
            yield this.updateNextTrade(quote);
            yield this.refreshBalances();
            yield this.logSwap({ inputToken: inputMint, inAmount, outputToken: outputMint, outAmount, txId: txid, timestamp: new Date().toISOString() });
        });
    }
}
exports.ArbBot = ArbBot;
