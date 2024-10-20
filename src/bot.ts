import { Keypair, Connection, PublicKey, VersionedTransaction, LAMPORTS_PER_SOL, TransactionInstruction, AddressLookupTableAccount, TransactionMessage, TransactionSignature, TransactionConfirmationStatus, SignatureStatus, MessageAccountKeys } from "@solana/web3.js";
import { createJupiterApiClient, DefaultApi, ResponseError, QuoteGetRequest, QuoteResponse, Instruction, AccountMeta, BlobApiResponse } from '@jup-ag/api';
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import * as fs from 'fs';
import * as path from 'path';


interface AirBotConfig{
    solanaEndpoint :string;
    metisEndpoint:string;
    secretKey:Uint8Array
    firstTradePrice:number;
    targetGainPercentage?:number;
    checkInterval?:number;
    initialInputToken:SwapToken;
    initialInputAmount:number
}

interface NextTrade extends QuoteGetRequest{
    nextTradeThreshold:number
}

export enum SwapToken{
    SOL,
    USDC
}

interface LogSwapArgs{
    inputToken:string;
    inAmount:string;
    outputToken:string;
    outAmount:string;
    txId:string;
    timestamp:string;
}

export class ArbBot{
    private solanaConnection : Connection;
    private jupiterApi:DefaultApi;
    private wallet:Keypair
    private usdcMint: PublicKey = new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");
    private solMint: PublicKey = new PublicKey("So11111111111111111111111111111111111111112");
    private usdcTokenAccount:PublicKey
    private solBalance:number=0;
    private usdcBalance:number=0;
    private lastCheck:number=0;
    private checkInterval:number=1000*10;
    private priceWatchInterValId?:NodeJS.Timeout
    private targetGainPercentage:number=1;
    private nextTrade:NextTrade;
    private waitingForConfirmation:boolean=false


    constructor(config:AirBotConfig){
        const {
            solanaEndpoint,
            metisEndpoint,
            secretKey,
            targetGainPercentage,
            checkInterval,
            initialInputToken,
            initialInputAmount,
            firstTradePrice
        }=config

        this.solanaConnection=new Connection(solanaEndpoint)
        this.jupiterApi=createJupiterApiClient({basePath:metisEndpoint})
        this.wallet=Keypair.fromSecretKey(secretKey)
        this.usdcTokenAccount=getAssociatedTokenAddressSync(this.usdcMint,this.wallet.publicKey)
        if(targetGainPercentage){
            this.targetGainPercentage=targetGainPercentage
        }
        if(checkInterval){
            this.checkInterval=checkInterval
        }

        this.nextTrade={
            inputMint:initialInputToken===SwapToken.SOL?this.solMint.toBase58():this.usdcMint.toBase58(),
            outputMint:initialInputToken===SwapToken.SOL?this.usdcMint.toBase58():this.solMint.toBase58(),
            amount:initialInputAmount,
            nextTradeThreshold:firstTradePrice
        }

    }

    async init():Promise<void>{

        console.log(`🤖 Initiating arb bot for wallet: ${this.wallet.publicKey.toBase58()} `)
        await this.refreshBalances()

        console.log(`🏦 Current balance :\nSOL: ${this.solBalance/LAMPORTS_PER_SOL},\nUSDC:${this.usdcBalance}`)
        this.initiatePriceWatch()
    }


    // use to fetch the sol and usdc balance

    private async refreshBalances():Promise<void>{
        try{
            const results= await Promise.allSettled([
                this.solanaConnection.getBalance(this.wallet.publicKey),
                this.solanaConnection.getTokenAccountBalance(this.usdcTokenAccount)
            ])
            const solBalanceResult= results[0]
            const usdcBalanceResult= results[1]

            if(solBalanceResult.status==='fulfilled'){
                this.solBalance=solBalanceResult.value
            }else{
                console.error('Error fetching SOL balance: ',solBalanceResult.reason)
            }

            if(usdcBalanceResult.status==='fulfilled'){
                this.usdcBalance=usdcBalanceResult.value.value.uiAmount??0
            }else{
                this.usdcBalance=0;
            }



            if(this.solBalance<LAMPORTS_PER_SOL/100){
                this.terminateSession("Low SOL balance")
            }
        }catch(error){
            console.error('Unexpected error during balance refresh: ',error)
        }
    }

    //use to start the price watch interval.

    private initiatePriceWatch():void{
        this.priceWatchInterValId=setInterval(async()=>{
            const currentTime= Date.now()

            if(currentTime-this.lastCheck>=this.checkInterval){
                this.lastCheck=currentTime

                try{
                    if(this.waitingForConfirmation){
                        console.log('waiting for the previous transition to confirm...')
                        return;
                    }
                    const quote= await this.getQuote(this.nextTrade)
                    this.evaluateQuoteAndSwap(quote)
                }catch(error){
                    console.log('Error getting quote: ',error)
                }
            }
        },this.checkInterval)
    }

    // function to get the quote from the jupiter's quoteGet

    private async getQuote(quoteRequest:QuoteGetRequest):Promise<QuoteResponse>{
        try{
            const quote :QuoteResponse|null= await this.jupiterApi.quoteGet(quoteRequest)
            if(!quote){
                throw new Error('No quote found')
            }
            return quote
        }catch(error){
            if(error instanceof ResponseError){
                console.log(await error.response.json())
            }else{
                console.error(error)
            }
            throw new Error('unable to find quote')
        }
    }

    // function evaluate the quote and then perform swap

    private async evaluateQuoteAndSwap(quote:QuoteResponse):Promise<void>{
        let difference =(parseInt(quote.outAmount)-this.nextTrade.nextTradeThreshold)/this.nextTrade.nextTradeThreshold;
        console.log(`📈 Current price: ${quote.outAmount} is ${difference > 0 ? 'higher' : 'lower'
        } than the next trade threshold: ${this.nextTrade.nextTradeThreshold} by ${Math.abs(difference * 100).toFixed(2)}%.`);

        if(parseInt(quote.outAmount)>this.nextTrade.nextTradeThreshold){
            try{
            this.waitingForConfirmation=true;
            await this.executeSwap(quote)
        }catch(error){
            console.log('Erorr executing swap: ',error)
        }
      }
    }
       
    // function to confirm the transaction
    private async confirmTransaction(
        connection: Connection,
        signature: TransactionSignature,
        desiredConfirmationStatus: TransactionConfirmationStatus = 'confirmed',
        timeout: number = 30000,
        pollInterval: number = 1000,
        searchTransactionHistory: boolean = false
    ): Promise<SignatureStatus> {
        const start = Date.now();

        while (Date.now() - start < timeout) {
            const { value: statuses } = await connection.getSignatureStatuses([signature], { searchTransactionHistory });

            if (!statuses || statuses.length === 0) {
                throw new Error('Failed to get signature status');
            }

            const status = statuses[0];

            if (status === null) {
                await new Promise(resolve => setTimeout(resolve, pollInterval));
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

            await new Promise(resolve => setTimeout(resolve, pollInterval));
        }

        throw new Error(`Transaction confirmation timeout after ${timeout}ms`);
    };
  


    /* if the bot detects that market conditions are appropriate to satisfy our requirments, we should execute the trade
    steps:
    1. fetch the swap instructions from jupiter's api
    2. Refractor our recieved instructions data to transaction instructions
    3. fetch the address lookup table accounts
    4. create and send a Solana Transaction
    5. On success, log the swap and update the next trade conditions
    
    
    
    */
    private async executeSwap(route:QuoteResponse):Promise<void>{
        try{
            const {
                computeBudgetInstructions,
                setupInstructions,
                swapInstruction,
                cleanupInstruction,
                addressLookupTableAddresses,
            } = await this.jupiterApi.swapInstructionsPost({
                swapRequest: {
                    quoteResponse: route,
                    userPublicKey: this.wallet.publicKey.toBase58(),
                    prioritizationFeeLamports: 'auto'
                },
            });


            const instructions:TransactionInstruction[]=[
                ...computeBudgetInstructions.map(this.instructionDataToTransactionInstruction),
                ...setupInstructions.map(this.instructionDataToTransactionInstruction),
                this.instructionDataToTransactionInstruction(swapInstruction),
                this.instructionDataToTransactionInstruction(cleanupInstruction)
            ].filter((ix)=>ix!==null)as  TransactionInstruction[]

            
            const addressLookupTableAccounts= await this.getAdressLookupTableAccounts(
                addressLookupTableAddresses,
                this.solanaConnection
            )


            const {blockhash,lastValidBlockHeight}=  await this.solanaConnection.getLatestBlockhash();

            const messageV0= new TransactionMessage({
                payerKey:this.wallet.publicKey,
                recentBlockhash:blockhash,
                instructions
            }).compileToV0Message(addressLookupTableAccounts)

            const transaction = new VersionedTransaction(messageV0)
            transaction.sign([this.wallet])

            const rawTransaction= transaction.serialize()

            const txid = await this.solanaConnection.sendRawTransaction(rawTransaction,{
                skipPreflight:true,
                maxRetries:2
            })


           const confirmation = await this.confirmTransaction(this.solanaConnection,txid)

           if(confirmation.err){
            throw new Error('Transaction Failed')
           }

           await this.postTransactionProcessing(route,txid)
        }catch(error){
            if(error instanceof ResponseError){
                console.log(await error.response.json())
            }else{
                console.error(error)
            }

            throw new Error('unable to execute swap')
        }finally{
            this.waitingForConfirmation=false
        }
    }

    //upadte the arguments after the trade execution

    private async updateNextTrade(lastTrade:QuoteResponse):Promise<void>{
        const priceChange= this.targetGainPercentage/100;
        this.nextTrade={
            inputMint:this.nextTrade.outputMint,
            outputMint:this.nextTrade.inputMint,
            amount:parseInt(lastTrade.outAmount),
            nextTradeThreshold:parseInt(lastTrade.inAmount)*(1+priceChange)
        }
    }

    private async logSwap(args: LogSwapArgs): Promise<void> {
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
            } else {
                console.log("File exists. Reading content...");
                const data = fs.readFileSync(filePath, { encoding: 'utf-8' });
                console.log("File content before update:", data); // Log the content of the file before parsing
    
                // Only parse if file is not empty
                let trades;
                if (data.trim()) {
                    console.log("Parsing file content...");
                    trades = JSON.parse(data);
                    console.log("Parsed trades:", trades); // Log parsed trades array
                } else {
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
        } catch (error) {
            console.error('Error logging swap:', error);
        }
    }
    
    


    private terminateSession(reason:string):void{
        console.warn(`❌ Terminating bot...${reason}`)
        console.log(`Current balance:\nSOL:${this.solBalance/LAMPORTS_PER_SOL},\nUSDC:${this.usdcBalance}`)
        if(this.priceWatchInterValId){
            clearInterval(this.priceWatchInterValId)
            this.priceWatchInterValId=undefined
        }

        setTimeout(()=>{
            console.log('Bot has been terminated')
            process.exit(1)
        },1000)
    }


    private instructionDataToTransactionInstruction(
        instruction:Instruction|undefined

    ){
        if(instruction==null || instruction===undefined) return null;
        return new TransactionInstruction({
            programId:new PublicKey(instruction.programId),
            keys:instruction.accounts.map((key:AccountMeta)=>({
                pubkey:new PublicKey(key.pubkey),
                isSigner:key.isSigner,
                isWritable:key.isWritable
            })),
            data:Buffer.from(instruction.data,"base64")
        })
    }


    // will be used to fetch address lookup accounts
    private async getAdressLookupTableAccounts(
        keys:string[],connection:Connection

    ):Promise<AddressLookupTableAccount[]>{

        const addressLookupTableAccountInfos=await connection.getMultipleAccountsInfo(
            keys.map((key)=>new PublicKey(key))
        )


        return addressLookupTableAccountInfos.reduce((acc,accountInfo,index)=>{
            const addressLookupTableAddress=keys[index]

            if(accountInfo){
                const addressLookupTableAccount=new AddressLookupTableAccount({
                    key:new PublicKey(addressLookupTableAddress),
                    state:AddressLookupTableAccount.deserialize(accountInfo.data),
                });
                acc.push(addressLookupTableAccount)
            }

            return acc;
        },new Array<AddressLookupTableAccount>())
    }

    private async postTransactionProcessing(quote:QuoteResponse,txid:string):Promise<void>{

        const {inputMint,inAmount,outputMint,outAmount}=quote
        await this.updateNextTrade(quote)
        await this.refreshBalances()
        await this.logSwap({inputToken:inputMint,inAmount,outputToken:outputMint,outAmount,txId:txid,timestamp:new Date().toISOString()})
    }
}



