import {solPrivateConnection, solPublicConnection} from "./connections";
import {PublicKey, TokenAccountBalancePair} from "@solana/web3.js";
import {sleep} from "openai/core";
import {sendMessage} from "../../websocket";
import {Database} from "./database";
import {PoolManager} from "./poolManager";
import {Liquidity} from "@raydium-io/raydium-sdk";
import {Metaplex} from "@metaplex-foundation/js";
import {ENV, TokenListProvider} from "@solana/spl-token-registry";
import {ParsedPoolInfo, TokenMetadata} from "./newTokensDetector";

export class TokenManager {
    private db = new Database()
    private raydiumPool = new PoolManager()

    /**
     * This method is used to refresh token data manually from the UI
     * @param tokenAddress
     */
    async getRefreshedTokenData(tokenAddress: string): Promise<any> {
        return await this.enrichPotentialToken(tokenAddress, true, false)
    }

    /**
     * This method is used to enrich potential token data
     * It called from 2 places: UI on refresh token data and from the NewTokensDetector class
     * @param tokenAddress
     * @param getMetadata
     * @param skippedIfRegFlags
     */
    async enrichPotentialToken(tokenAddress: string, getMetadata: boolean = false, skippedIfRegFlags = true): Promise<any> {
        try {
            console.log("Fetching potential token data from db")
            let tokenData = await this.db.getToken(tokenAddress)

            if (!tokenData) return

            console.log("Getting tokenInfo")
            let tokenInfo = await solPublicConnection.getParsedAccountInfo(new PublicKey(tokenAddress))
            // @ts-ignore
            let mintAuthority = tokenInfo.value?.data?.parsed?.info?.mintAuthority
            // @ts-ignore
            let freezeAuthority = tokenInfo.value?.data?.parsed?.info?.freezeAuthority
            if (skippedIfRegFlags && (mintAuthority || freezeAuthority)) {
                console.log("Skipped - Token has mint authority or free authority enabled")
                return
            }

            console.log("Getting holdersDistribution")
            let holdersDistribution = await this.getTokenHoldersDistribution(tokenAddress)
            await sleep(500)
            console.log("Getting poolState")
            let poolState = await this.getPoolInfo(tokenData.poolId!!)
            await sleep(500)
            let burnedLpPercentage = tokenData.burnedLpPercentage ?? undefined
            let parsedPoolInfo = tokenData.parsedPoolInfo ?? undefined
            if (poolState) {
                console.log("Getting burnedLpPercentage")
                // @ts-ignore
                burnedLpPercentage = await this.lpBurnedPercentage(poolState.lpMint, tokenData.lpReserve) ?? undefined
                await sleep(500)
                console.log("Getting parsedPoolInfo")
                // @ts-ignore
                parsedPoolInfo = await this.parsePoolInfo(poolState) ?? undefined
            } else {
                console.error("Can't fetch pool state")
            }
            let metadata = tokenData.metadata ?? undefined
            if (getMetadata) {
                console.log("Getting tokenInfoFromChain")
                // @ts-ignore
                metadata = await this.getTokenMetadata(tokenAddress)
            }

            let updatedData = {
                initTx: tokenData.initTx!!,
                tokenAddress: tokenAddress,
                poolId: tokenData.poolId!!,
                // @ts-ignore
                mintAuthority: tokenInfo.value?.data?.parsed?.info?.mintAuthority,
                // @ts-ignore
                freezeAuthority: tokenInfo.value?.data?.parsed?.info?.freezeAuthority,
                // @ts-ignore
                supply: parseInt(tokenInfo.value?.data?.parsed?.info?.supply),
                // @ts-ignore
                decimals: tokenInfo.value?.data?.parsed?.info?.decimals,
                holdersDistribution: holdersDistribution ?? undefined,
                burnedLpPercentage: burnedLpPercentage ?? undefined,
                parsedPoolInfo: parsedPoolInfo ?? undefined,
                metadata: metadata ?? undefined,
                poolCreatedAt: tokenData.poolCreatedAt
            }

            await this.db.updateToken(tokenAddress, updatedData)

            // Send data to the frontend
            await sendMessage(updatedData.tokenAddress)
            return await this.db.getToken(tokenAddress)
        } catch (e: any) {
            console.error(e.stack)
        }
    }


    public async getPoolInfo(poolAddress: string): Promise<any | null> {
        try {
            console.log(poolAddress)
            let data = await solPublicConnection.getParsedAccountInfo(new PublicKey(poolAddress));
            if (!data) {
                console.log("getPoolInfo data is null")
                return null
            }
            console.log(data)
            return Liquidity.getLayouts(4).state.decode(data.value?.data as Buffer)
        } catch (e) {
            // @ts-ignore
            console.error("Error in getPoolInfo: " + poolAddress + " " + e.stack)
            return null
        }
    }

    private getBurnPercentage(lpReserve: number, actualSupply: number): number {
        const maxLpSupply = Math.max(actualSupply, (lpReserve - 1));
        const burnAmt = (maxLpSupply - actualSupply)
        console.log(`burn amt: ${burnAmt}`)
        return (burnAmt / maxLpSupply) * 100;
    }

    async lpBurnedPercentage(lpMint: string, rawLpReserve: number,): Promise<number | null> {
        try {
            //Once we have the lpMint address, we need to fetch the current token supply and decimals
            const parsedAccInfo = await solPrivateConnection.getParsedAccountInfo(new PublicKey(lpMint));
            await sleep(500)
            // @ts-ignore
            const mintInfo = parsedAccInfo?.value?.data?.parsed?.info
            //We divide the values based on the mint decimals
            const lpReserve = rawLpReserve / Math.pow(10, mintInfo?.decimals)
            const actualSupply = parseFloat(mintInfo?.supply) / Math.pow(10, mintInfo?.decimals)
            console.log(`lpMint: ${lpMint}, Reserve: ${lpReserve}, Actual Supply: ${actualSupply}`);
            if (!actualSupply) return null
            const burnPct = this.getBurnPercentage(lpReserve, actualSupply)
            console.log(`${burnPct} LP burned`);
            return burnPct
        } catch (e) {
            // @ts-ignore
            console.error("Error in lpBurnedPercentage: " + lpMint + " " + rawLpReserve + " " + e.stack)
            return null
        }
    }

    //We have to check how much tokens are present in openbook market as well
    async parsePoolInfo(poolState: any): Promise<ParsedPoolInfo | null> {
        try {
            let res = this.raydiumPool.getVaultsInfoFromPoolState(poolState)
            if (!res) return null
            // @ts-ignore
            let base = res[0]
            // @ts-ignore
            let quote = res[1]
            //Get the price of the tokens
            //We are using Jup pricing APIs, you can use whichever you want
            const priceInfo = await this.getTokenPrices(poolState.baseMint, poolState.quoteMint);
            const baseLiquidity = base * priceInfo.basePrice;
            const quoteLiquidity = quote * priceInfo.quotePrice;
            console.log(`Base Token liquidity: ${baseLiquidity} \n`);
            console.log(`Quote Token liquidity: ${quoteLiquidity} \n`);
            console.log(`Total liquidity in the pool: ${baseLiquidity + quoteLiquidity}`)
            return {
                baseTokenAmount: base,
                quoteTokenAmount: quote,
                basePriceUsd: priceInfo.basePrice,
                quotePriceUsd: priceInfo.quotePrice,
                baseLiquidity: baseLiquidity,
                quoteLiquidity: quoteLiquidity
            } as ParsedPoolInfo
        } catch (e) {
            // @ts-ignore
            console.error("Error in parsePoolInfo: " + e.stack)
            return null
        }
    }

    //Fetch token prices in USD using Jup pricing APIs
    async getTokenPrices(base: string, quote: string) {
        const baseMintPrice = await (await fetch(
            `https://price.jup.ag/v4/price?ids=${base}`)).json()
        const quoteMintPrice = await (await fetch(`https://price.jup.ag/v4/price?ids=${quote}`)).json()
        return {basePrice: baseMintPrice.data[base]?.price || 0, quotePrice: quoteMintPrice.data[quote]?.price || 0}
    }

    public async test(poolAddress: string): Promise<any> {
    }

    public async getTokenHoldersDistribution(tokenAddress: string): Promise<TokenAccountBalancePair[]> {
        try {
            let data = await solPrivateConnection.getTokenLargestAccounts(new PublicKey(tokenAddress));
            await sleep(500)
            if (!data) return [];
            const sortedBalances = data.value.sort((a, b) => parseInt(b.amount) - parseInt(a.amount));
            return sortedBalances.slice(0, 10)
        } catch (e) {
            // @ts-ignore
            console.log("Error in getTokenHoldersDistribution: " + tokenAddress + " " + e.stack)
            return []
        }
    }

    async getTokenMetadata(tokenAddress: string): Promise<TokenMetadata> {
        let name;
        let symbol;
        let image;
        let isMutable;
        let description;
        let extensions;
        const metaplex = Metaplex.make(solPublicConnection);
        const addressPublicKey = new PublicKey(tokenAddress);
        const metadataAccount = metaplex
            .nfts()
            .pdas()
            .metadata({mint: addressPublicKey});

        const metadataAccountInfo = await solPublicConnection.getAccountInfo(metadataAccount);
        await sleep(500)

        if (metadataAccountInfo) {
            const token = await metaplex.nfts().findByMint({mintAddress: addressPublicKey});
            name = token.name;
            symbol = token.symbol;
            image = token.json?.image;
            isMutable = token.isMutable;
            description = token.json?.description
            extensions = token.json?.extensions
        } else {
            const provider = await new TokenListProvider().resolve();
            const tokenList = provider.filterByChainId(ENV.MainnetBeta).getList();
            console.log(tokenList)
            const tokenMap = tokenList.reduce((map, item) => {
                map.set(item.address, item);
                return map;
            }, new Map());

            const token = tokenMap.get(addressPublicKey.toBase58());
            console.log(token)
            name = token.name;
            symbol = token.symbol;
            image = token.logoURI;
            isMutable = token.isMutable
            description = token.json?.description
            extensions = token.json?.extensions
        }

        return {
            name: name,
            symbol: symbol,
            image: image,
            isMutable: isMutable,
            description: description,
            extensions: extensions
        } as TokenMetadata
    }
}