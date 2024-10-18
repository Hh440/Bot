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
import { clusterApiUrl, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { ArbBot, SwapToken } from "./bot";
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config({
    path: ".env"
});
const defaultConfig = {
    solanaEndpoint: (0, clusterApiUrl)('mainnet-beta'),
    jupiter: "https://quote-api.jup.ag/v6",
};
function main() {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b;
        if (!process.env.SECRET_KEY) {
            throw new Error("SECRET_KEY ennvironment variable not set");
        }
        let decodeSecretKey = Uint8Array.from(JSON.parse(process.env.SECRET_KEY));
        const bot = new ArbBot({
            solanaEndpoint: (_a = process.env.SOLANA_ENDPOINT) !== null && _a !== void 0 ? _a : defaultConfig.solanaEndpoint,
            metisEndpoint: (_b = process.env.METIS_ENDPOINT) !== null && _b !== void 0 ? _b : defaultConfig.jupiter,
            secretKey: decodeSecretKey,
            firstTradePrice: 0.11 * LAMPORTS_PER_SOL,
            targetGainPercentage: 1.5,
            initialInputToken: SwapToken.USDC,
            initialInputAmount: 10000000
        });
        yield bot.init();
    });
}
main().catch(console.error);
