"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const web3_js_1 = require("@solana/web3.js");
const bot_1 = require("./bot");
const dotenv_1 = __importDefault(require("dotenv"));
const bs58_1 = __importDefault(require("bs58"));
dotenv_1.default.config({
    path: ".env"
});
const defaultConfig = {
    solanaEndpoint: (0, web3_js_1.clusterApiUrl)('mainnet-beta'),
    jupiter: "https://quote-api.jup.ag/v6",
};
function main() {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b;
        if (!process.env.SECRET_KEY) {
            throw new Error("SECRET_KEY ennvironment variable not set");
        }
        let decodeSecretKey = undefined;
        try {
            if (process.env.SECRET_KEY) {
                // Decode the secret key (Base58 format is expected in Solana)
                decodeSecretKey = bs58_1.default.decode(process.env.SECRET_KEY);
                console.log("Secret key successfully decoded:");
                // If the length is more than 64, slice the first 64 bytes (private key part)
                if (decodeSecretKey.length > 64) {
                    decodeSecretKey = decodeSecretKey.slice(0, 64);
                    console.log("Sliced secret key to 64 bytes:", decodeSecretKey);
                }
                // Check if the length is exactly 64 bytes
                if (decodeSecretKey.length !== 64) {
                    throw new Error(`Invalid secret key length: ${decodeSecretKey.length} bytes (expected 64 bytes)`);
                }
            }
            else {
                throw new Error("SECRET_KEY environment variable is not defined.");
            }
        }
        catch (error) {
            console.error("Error decoding SECRET_KEY:", error);
            throw error; // Re-throw the error to stop execution or handle it
        }
        if (!decodeSecretKey) {
            throw new Error("decodeSecretKey was not properly initialized.");
        }
        const bot = new bot_1.ArbBot({
            solanaEndpoint: (_a = process.env.SOLANA_ENDPOINT) !== null && _a !== void 0 ? _a : defaultConfig.solanaEndpoint,
            metisEndpoint: (_b = process.env.METIS_ENDPOINT) !== null && _b !== void 0 ? _b : defaultConfig.jupiter,
            secretKey: decodeSecretKey,
            firstTradePrice: 0.11 * web3_js_1.LAMPORTS_PER_SOL,
            targetGainPercentage: 1.5,
            initialInputToken: bot_1.SwapToken.USDC,
            initialInputAmount: 10000000
        });
        yield bot.init();
    });
}
main().catch(console.error);
