import {LAMPORTS_PER_SOL, Transaction, TransactionMessage, VersionedTransaction} from '@solana/web3.js'
import {
    Liquidity,
    LiquidityPoolKeys,
    LiquidityPoolKeysV4,
    Percent,
    SPL_ACCOUNT_LAYOUT,
    Token,
    TOKEN_PROGRAM_ID,
    TokenAmount,
} from '@raydium-io/raydium-sdk';

import {Wallet} from "@project-serum/anchor";
import {solPrivateConnection, solPublicConnection} from "./connections";
import { prisma } from 'wasp/server';
import { SOL_MINT } from './const';
import { randomUUID } from 'crypto';

export class RaydiumSwap {

    constructor(private wallet: Wallet) {
    }

    async getOwnerTokenAccounts() {
        const walletTokenAccount = await solPrivateConnection.getTokenAccountsByOwner(this.wallet.publicKey, {
            programId: TOKEN_PROGRAM_ID,
        })

        return walletTokenAccount.value.map((i) => ({
            pubkey: i.pubkey,
            programId: i.account.owner,
            accountInfo: SPL_ACCOUNT_LAYOUT.decode(i.account.data),
        }))
    }

    async swap(
        toMint: string,
        poolInfo: LiquidityPoolKeysV4,
        amount: number,
        executeSwap: boolean = false
    ) {
        try {
            const useVersionedTransaction = true // Use versioned transaction

            const tx = await this.getSwapTransaction(
                toMint,
                amount,
                poolInfo,
                0.0005 * LAMPORTS_PER_SOL, // Prioritization fee, now set to (0.0005 SOL)
                useVersionedTransaction,
                'in',
                5 // Slippage
            )
            let isTesting = false
            let txId
            if (executeSwap) {
                txId = useVersionedTransaction
                    ? await this.sendVersionedTransaction(tx as VersionedTransaction)
                    : await this.sendLegacyTransaction(tx as Transaction)

                console.log(`https://solscan.io/tx/${txId}`)

            } else {
                isTesting = true
                txId = randomUUID()
                let res = useVersionedTransaction
                    ? await this.simulateVersionedTransaction(tx as VersionedTransaction)
                    : await this.simulateLegacyTransaction(tx as Transaction)
                console.log("Simulated swap: " + res)
            }

            let inputToken = toMint === SOL_MINT? poolInfo.baseMint.toBase58(): SOL_MINT
            let outputToken = inputToken == SOL_MINT? poolInfo.baseMint.toBase58(): SOL_MINT
            await prisma.transaction.create({
                data: {
                    txId: txId,
                    // TODO: userId is used as 0 temporarily
                    userId: "0",
                    tokenAddress: poolInfo.baseMint.toBase58(),
                    inputToken: inputToken,
                    outputToken: outputToken,
                    status: "pending",
                    isTesting: isTesting
                }
            })
            // In the caller of this method, swapping status will be checked to confirm
            return txId
        } catch (e) {
            // @ts-ignore
            console.error('Error while swapping ' + e.stack)
            return null
        }
    }


    async getSwapTransaction(
        toToken: string,
        amount: number,
        poolKeys: LiquidityPoolKeys,
        maxLamports: number = 100000,
        useVersionedTransaction = true,
        fixedSide: 'in' | 'out' = 'in',
        slippage: number = 5
    ): Promise<Transaction | VersionedTransaction> {
        const directionIn = poolKeys.quoteMint.toString() == toToken
        const { minAmountOut, amountIn } = await this.calcAmountOut(poolKeys, amount, slippage, directionIn)

        const userTokenAccounts = await this.getOwnerTokenAccounts()
        const swapTransaction = await Liquidity.makeSwapInstructionSimple({
            connection: solPrivateConnection,
            makeTxVersion: useVersionedTransaction ? 0 : 1,
            poolKeys: {
                ...poolKeys,
            },
            userKeys: {
                tokenAccounts: userTokenAccounts,
                owner: this.wallet.publicKey,
            },
            amountIn: amountIn,
            amountOut: minAmountOut,
            fixedSide: fixedSide,
            config: {
                bypassAssociatedCheck: false,
            },
            computeBudgetConfig: {
                microLamports: maxLamports,
            },
        })
        console.log("Getting latest block hash for swapping")
        const recentBlockhashForSwap = await solPrivateConnection.getLatestBlockhash()
        const instructions = swapTransaction.innerTransactions[0].instructions.filter(Boolean)

        if (useVersionedTransaction) {
            const versionedTransaction = new VersionedTransaction(
                new TransactionMessage({
                    payerKey: this.wallet.publicKey,
                    recentBlockhash: recentBlockhashForSwap.blockhash,
                    instructions: instructions,
                }).compileToV0Message()
            )

            versionedTransaction.sign([this.wallet.payer])

            console.log("Got versioned Transaction")

            return versionedTransaction
        }

        const legacyTransaction = new Transaction({
            blockhash: recentBlockhashForSwap.blockhash,
            lastValidBlockHeight: recentBlockhashForSwap.lastValidBlockHeight,
            feePayer: this.wallet.publicKey,
        })

        legacyTransaction.add(...instructions)
        console.log("Got legacy Transaction")

        return legacyTransaction
    }

    async sendLegacyTransaction(tx: Transaction) {
        return await solPrivateConnection.sendTransaction(tx, [this.wallet.payer], {
            skipPreflight: true,
        })
    }

    async sendVersionedTransaction(tx: VersionedTransaction) {
        return await solPrivateConnection.sendTransaction(tx, {
            skipPreflight: false,
        })
    }

    async simulateLegacyTransaction(tx: Transaction) {
        return await solPrivateConnection.simulateTransaction(tx, [this.wallet.payer])
    }

    async simulateVersionedTransaction(tx: VersionedTransaction) {
        return await solPrivateConnection.simulateTransaction(tx)
    }

    async calcAmountOut(
        poolKeys: LiquidityPoolKeys,
        rawAmountIn: number,
        slippage: number = 5,
        swapInDirection: boolean
    ) {
        const poolInfo = await Liquidity.fetchInfo({ connection: solPrivateConnection, poolKeys })

        let currencyInMint = poolKeys.baseMint
        let currencyInDecimals = poolInfo.baseDecimals
        let currencyOutMint = poolKeys.quoteMint
        let currencyOutDecimals = poolInfo.quoteDecimals

        if (!swapInDirection) {
            currencyInMint = poolKeys.quoteMint
            currencyInDecimals = poolInfo.quoteDecimals
            currencyOutMint = poolKeys.baseMint
            currencyOutDecimals = poolInfo.baseDecimals
        }

        const currencyIn = new Token(TOKEN_PROGRAM_ID, currencyInMint, currencyInDecimals)
        const amountIn = new TokenAmount(currencyIn, rawAmountIn, false)
        const currencyOut = new Token(TOKEN_PROGRAM_ID, currencyOutMint, currencyOutDecimals)
        const slippageX = new Percent(slippage, 100) // 5% slippage

        const { amountOut, minAmountOut, currentPrice, executionPrice, priceImpact, fee } = Liquidity.computeAmountOut({
            poolKeys,
            poolInfo,
            amountIn,
            currencyOut,
            slippage: slippageX,
        })
        console.log({
            amountIn: Number(amountIn.numerator),
            amountOut: Number(amountOut.numerator),
            fee: Number(fee.numerator),
        })

        return {
            amountIn,
            amountOut,
            minAmountOut,
            currentPrice,
            executionPrice,
            priceImpact,
            fee,
        }
    }
}
