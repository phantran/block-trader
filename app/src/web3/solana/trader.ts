import { WalletContainer } from './wallet';
import { type PotentialToken } from 'wasp/entities';
import { prisma } from 'wasp/server';
import { SOL_MINT } from './const';
import { jsonInfo2PoolKeys, LiquidityPoolKeys, TOKEN_PROGRAM_ID } from '@raydium-io/raydium-sdk';
import { RaydiumSwap } from './raydiumSwap';
import { PoolManager } from './poolManager';
import { solPrivateConnection } from './connections';
import { PublicKey } from '@solana/web3.js';
import { delay } from '../../shared/utils';


export class Trader {
    private raydiumSwap: RaydiumSwap
    private raydiumPool: PoolManager

    constructor(
        private walletContainer: WalletContainer,
    ) {
        this.raydiumSwap = new RaydiumSwap(this.walletContainer.wallet)
        this.raydiumPool = new PoolManager()
    }

    async getTokensAccountOverview() {
        return await solPrivateConnection.getParsedTokenAccountsByOwner(
          this.walletContainer.wallet.publicKey, {
              programId: TOKEN_PROGRAM_ID,
          })
    }

    async getTokenInAccountOverview(mint: string) {
        return await solPrivateConnection.getParsedTokenAccountsByOwner(
          this.walletContainer.wallet.publicKey, {
              mint: new PublicKey(mint)
          })
    }

    async shouldSell(tokenMint: string) {
        let shouldSell = false
        // check if price has increase since bought (data from database)
        let tokenInDb = await prisma.potentialToken.findUnique({
            where: {
                tokenAddress: tokenMint
            }
        })
        if (!tokenInDb) {
            console.error(`Token ${tokenMint} does not exist in db`)
            return null
        }
        // fetch base and quote vault amount
        let vaultInfo = await this.raydiumPool.getVaultsInfoFromPoolState(tokenInDb.poolState)
        if (!vaultInfo) {
            console.error(`Cannot fetch base and quote vault info for Token ${tokenMint}`)
            return null
        }
        // @ts-ignore
        let base = vaultInfo[0]
        // @ts-ignore
        let quote = vaultInfo[1]

        // Sell % of the balance info retrieved from getTokenInAccountOverview
        let currentPriceInSol = base/quote
        // NOTE: ONLY SUPPORT 1 TRADE FOR 1 TOKEN AT THE MOMENT FOR SIMPLICITY
        let transactions = await prisma.transaction.findMany({
              where: {
                    // TODO: support querying by userId later, for now only 1 user
                  tokenAddress: tokenMint
              },
              orderBy: {
                  createdAt: 'desc'
             }
          }
        )
        let lastTransaction = transactions[0]
        // @ts-ignore
        let boughtPriceInSol = lastTransaction.inputAmount / lastTransaction.outputAmount
        let increase = currentPriceInSol - boughtPriceInSol
        if (increase > 0) {
            console.log(`Already got some benefits for ${tokenMint}`)
             if (increase/boughtPriceInSol >0.2) {
                 console.log(`Benefits for ${tokenMint} is already more than 0.2, it's now: ${increase}`)
                 shouldSell = true
            }
        }
        return shouldSell
    }

    async trade(
        mint: string,
        toToken: boolean,  // true to swap to token, false to swap to sol
        amount: number,
        checkRedFlags: boolean,
        executeSwap: boolean = false
    ) {
        let start = performance.now()
        let txId = null
        let txStatus = "success"
        try {
            let token = await prisma.potentialToken.findUnique({
                where: {
                    tokenAddress: mint
                }
            })
            if (!token || !token.poolState) {
                console.log("Fetch pool keys because new token or token doesn't have pool info")
                let poolKeys = await this.raydiumPool.getPoolKeys(mint, SOL_MINT)
                if (!poolKeys) return
                let newToken = {
                    tokenAddress: mint,
                    // @ts-ignore
                    poolState: poolKeys
                }
                await prisma.potentialToken.create({
                    // @ts-ignore
                    data: newToken as PotentialToken
                })
            }

            token = await prisma.potentialToken.findUnique({
                where: {
                    tokenAddress: mint
                }
            })

            if (checkRedFlags && token && !Trader.getRedFlags(token)) {
                console.log("Checking for red flags")
                return
            }

            console.log("Start swapping")
            txId = await this.raydiumSwap.swap(
                toToken ? token!!.tokenAddress : SOL_MINT,
                // @ts-ignore
                jsonInfo2PoolKeys(token.poolState) as LiquidityPoolKeys,
                amount,
                executeSwap
            )

            // Handle swap result
            if (!txId) {
                txStatus = "failed"
                throw Error("Error while swapping tokens")
            }
            let status = "pending"
            // Check status until it's finalized, DON'T retry swap because this is fast trading
            while (status === "pending") {
                status = await this.checkSwapStatus(txId)
                await delay(5000) // delay 5s before checking status again
            }
            // Handle swap result
            if (status === "error") {
                txStatus = "failed"
                throw Error("Error while swapping tokens")
            } else if (status === "success") {
                txStatus = "success"
                let amounts = await this.getInputAndOutputAmount(txId)
                let inputAmount = amounts[0]
                let outputAmount = amounts[1]
                await prisma.transaction.update({
                    where: {
                        txId: txId
                    },
                    data: {
                        status: txStatus,
                        inputAmount,
                        outputAmount,
                        // @ts-ignore
                        timeTaken: timeTaken
                    }
                })
            }


        } catch (e) {
            txStatus = "failed"
            // @ts-ignore
            console.error(e.stack)
        } finally {
            let timeTaken = (performance.now() - start)/1000
            if (txId) {
                await prisma.transaction.update({
                    where: {
                        txId: txId
                    },
                    data: {
                        status: txStatus,
                        // @ts-ignore
                        timeTaken: timeTaken
                    }
                })
            }
            console.log("Swapping took: " + timeTaken + " seconds")
        }
    }

    async getInputAndOutputAmount(txId: string) {
        return [0,0]
    }

    async checkSwapStatus(txId: string): Promise<string> {
        let transactionInfo = await solPrivateConnection.getParsedTransaction(
          txId,
        )
        if (transactionInfo) {
            // Check if the transaction was successful
            if (transactionInfo.meta && transactionInfo.meta.err === null) {
                return "success"
            } else {
                // Transaction has failed or is pending
                if (transactionInfo.meta && transactionInfo.meta.err !== null) {
                    console.error('Transaction failed with error:', transactionInfo.meta.err);
                    return "failed"
                } else {
                    return "pending"
                }
            }
        } else {
            return "pending"
        }
    }

    // async retrySwapWithExponentialBackoff(
    //   toToken: boolean,
    //   token: PotentialToken,
    //   amount: number,
    //   executeSwap: boolean,
    //   maxRetries: number = 2,
    //   baseDelay: number = 2
    // ) {
    //     let retries = 0;
    //     while (retries < maxRetries) {
    //         try {
    //             const txId = await this.raydiumSwap.swap(
    //               toToken ? token!!.tokenAddress : SOL_MINT,
    //               // @ts-ignore
    //               jsonInfo2PoolKeys(token.poolState) as LiquidityPoolKeys,
    //               amount,
    //               executeSwap
    //             )
    //             if (!txId) {
    //                 console.log("Error while swapping")
    //                 return null
    //             }
    //             console.log('Swap transaction sent');
    //             console.log('Checking swap status...');
    //             let status = await this.checkSwapStatus(txId);
    //             if (status === 'error') {
    //                 console.error('Swap status: irreversible error, retrying swap...');
    //                 continue; // Retry swap
    //             } else if (status === 'pending') {
    //                 console.log('Swap status: pending, waiting and retrying swap status check...');
    //                 while(status == 'pending') {
    //                     await new Promise(resolve => setTimeout(resolve, 5000));
    //                     status = await this.checkSwapStatus(txId);
    //                 }
    //                 return txId
    //             }
    //         } catch (error) {
    //             retries++;
    //             console.error('Swap failed, retrying...');
    //             const delay = baseDelay * Math.pow(2, retries);
    //             console.log(`Retry ${retries} in ${delay} milliseconds`);
    //             await new Promise(resolve => setTimeout(resolve, delay));
    //         }
    //     }
    //     throw new Error('Max retries reached, swap unsuccessful');
    // }

    async getRedFlagsFromTokenAddress(tokenAddress: string) {
        let token = await prisma.potentialToken.findUnique({
            where: {
                tokenAddress: tokenAddress
            }
        })
        if (token) {
            return Trader.getRedFlags(token)
        }
    }

    static getRedFlags(token: PotentialToken): string[] {
        let res = []
        if (this.isMintAuthorityEnable(token)) {
            res.push("mintAuthorityEnabled")
        }

        if (this.isFreezeAuthorityEnable(token)) {
            res.push("freezeAuthorityEnabled")
        }

        if (this.isLowLiquidity(token)) {
            res.push("quoteLiquidityBelowThreshold")
        }

        if (this.isNotNewToken(token)) {
            res.push("notNewToken")
        }

        if (this.isLiquidityPoolNotLocked(token)) {
            res.push("liquidityPoolNotLocked")
        }

        if (this.hasLiquidityDistributionIssue(token)) {
            res.push("liquidityDistributionIssue")
        }
        return res
    }

    static isMintAuthorityEnable(token: PotentialToken) {
        return !!token.mintAuthority;

    }

    static isFreezeAuthorityEnable(token: PotentialToken) {
        return !!token.freezeAuthority;

    }

    static isLowLiquidity(token: PotentialToken) {
        // @ts-ignore
        return (token.parsedPoolInfo?.quoteLiquidity ?? 0) < 2000;
    }

    static isNotNewToken(token: PotentialToken) {
        if (token.poolCreatedAt) {
            // Get the current epoch time in seconds
            const currentEpochSeconds = Math.floor(Date.now() / 1000);
            // Calculate the difference in seconds
            const differenceInSeconds = currentEpochSeconds - token.poolCreatedAt;
            // Return true if the difference is more than 20 seconds
            return differenceInSeconds > 30;
        }
        return false
    }

    static isLiquidityPoolNotLocked(token: PotentialToken) {
        return (token.burnedLpPercentage ?? 0) < 80;
    }

    static hasLiquidityDistributionIssue(token: PotentialToken) {
        try {
            let supply = token.supply ?? 0
            let decimals = token.decimals ?? 0
            let distribution = token.holdersDistribution ?? []
            // @ts-ignore
            let holdersSum: number = distribution.reduce((accumulator: number, currentValue: any) => accumulator + parseFloat(currentValue.uiAmount), 0);
            let supplyConsiderDecimals = supply / Math.pow(10, decimals)
            let totalPercentage = (holdersSum / supplyConsiderDecimals) * 100
            if (totalPercentage > 80) {
                console.log(`Top users hold a large amount of token: ${totalPercentage}%`)
                return true
            }
            // @ts-ignore
            distribution.map((item: any, index: number) => {
                let ratio = (parseFloat(item.uiAmount) / supplyConsiderDecimals) * 100
                if (ratio > 50) {
                    console.log(`There a user hold a large amount of token: ${ratio}%`)
                    return true
                }
            })
        } catch (e) {
            console.log("Error while calculating token distribution validity " + e)
            return false
        }
    }
}
