import { LAMPORTS_PER_SOL, clusterApiUrl } from "@solana/web3.js";
import { ArbBot, SwapToken } from './bot';
import dotenv from "dotenv";
import bs58 from 'bs58'


dotenv.config({
    path:".env"
})


const defaultConfig={
    solanaEndpoint:clusterApiUrl('mainnet-beta'),
    jupiter: "https://quote-api.jup.ag/v6",
}


async function main(){
    if(!process.env.SECRET_KEY){
        throw new Error("SECRET_KEY ennvironment variable not set")
    }

    let decodeSecretKey:Uint8Array|undefined=undefined;
    try {
        if (process.env.SECRET_KEY) {
            // Decode the secret key (Base58 format is expected in Solana)
            decodeSecretKey = bs58.decode(process.env.SECRET_KEY);
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
        } else {
            throw new Error("SECRET_KEY environment variable is not defined.");
        }
    } catch (error) {
        console.error("Error decoding SECRET_KEY:", error);
        throw error;  // Re-throw the error to stop execution or handle it
    }
    
    if (!decodeSecretKey) {
        throw new Error("decodeSecretKey was not properly initialized.");
    }

    const bot = new ArbBot({
        solanaEndpoint:process.env.SOLANA_ENDPOINT?? defaultConfig.solanaEndpoint,
        metisEndpoint:process.env.METIS_ENDPOINT ?? defaultConfig.jupiter,
        secretKey:decodeSecretKey,
        firstTradePrice:0.11*LAMPORTS_PER_SOL,
        targetGainPercentage:1.5,
        initialInputToken:SwapToken.USDC,
        initialInputAmount:10_000_000
    })

    await bot.init()
}

main().catch(console.error)

