import {PublicKey} from '@solana/web3.js';
import {PoolManager} from "./poolManager";
import {solPrivateConnection} from "./connections";
import {RAYDIUM_POOL_V4_PROGRAM_ID} from "./const";
import {Database} from "./database";
import {TokenManager} from "./tokenManager";

export interface TokenMetadata {
    name?: string,
    symbol?: string,
    logo?: string,
    isMutable: boolean
    description?: string,
    extensions?: string
}

export interface ParsedPoolInfo {
    baseTokenAmount: number,
    quoteTokenAmount: number,
    basePriceUsd: number,
    quotePriceUsd: number,
    baseLiquidity: number,
    quoteLiquidity: number
}

// This class is used mainly to monitor the logs of the Raydium program and detect new pools
export class NewTokensDetector {
    private processedTokens: Set<string> = new Set<string>()
    private poolManager = new PoolManager()
    private db = new Database()
    private tokenManager = new TokenManager()


    // TODO: if open time is still negative, then put the tokens to a queue and query for info
    // again to check before investing
    public async findNewPotentialTokens() {
        console.log("Monitoring logs for raydium program");
        solPrivateConnection.onLogs(
            new PublicKey(RAYDIUM_POOL_V4_PROGRAM_ID),
            async ({logs, err, signature}) => {
                try {
                    if (err) {
                        return
                    }
                    if (logs && logs.includes("Initialize the associated token account")) {
                        console.log("Signature for Initialize the associated token account:", signature);
                    }

                    if (logs && logs.some(log => log.includes("initialize2"))) {
                        await this.handleSignatureNewPoolDetection(signature)
                        if (this.processedTokens.size > 10000) {
                            this.processedTokens = new Set<string>()
                        }
                    }
                } catch (e) {
                    console.log(`error in findNewPotentialTokens: ${e}`)
                }
            },
            "finalized"
        );
    }

    async handleSignatureNewPoolDetection(signature: string): Promise<any> {
        try {
            console.log("Signature for 'initialize2':", signature);
            if (this.processedTokens.has(signature)) return
            this.processedTokens.add(signature)

            let [poolState, poolOpenTime, lpReserve] = await this.poolManager.fetchPoolKeysForLPInitTransactionHash(signature)
            console.log("Parse pool state successfully, poolOpenTime " + poolOpenTime)

            if (!poolState) return

            if (!poolState.id) {
                console.error("Pool state doesn't have pool id")
                return
            }

            let tokenAddress = poolState.baseMint.toBase58()

            if (!await this.db.tokenExists(tokenAddress)) return

            const rawToken = {
                initTx: signature,
                tokenAddress: tokenAddress,
                poolState: poolState,
                poolId: poolState.id.toBase58(),
                lpReserve: lpReserve,
                poolCreatedAt: poolOpenTime
            }

            // save new token with pool info
            await this.db.insertToken({data: rawToken})

            // The justification is to simplify the passed argument to just token address instead of whole raw token
            return await this.tokenManager.enrichPotentialToken(tokenAddress)
        } catch (e) {
            // @ts-ignore
            console.error(e.stack)
        }
    }
}
