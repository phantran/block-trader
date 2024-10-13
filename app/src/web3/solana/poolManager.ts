import {
    ApiPoolInfoV4,
    Liquidity,
    LIQUIDITY_STATE_LAYOUT_V4,
    LiquidityPoolKeysV4,
    Market,
    MARKET_STATE_LAYOUT_V3,
    SPL_MINT_LAYOUT,
    TOKEN_PROGRAM_ID,
} from '@raydium-io/raydium-sdk';
import { NATIVE_MINT } from "@solana/spl-token";
import {
    Commitment,
    Connection,
    ParsedInnerInstruction,
    ParsedInstruction,
    ParsedTransactionWithMeta,
    PartiallyDecodedInstruction,
    PublicKey,
} from '@solana/web3.js';
import { OPENBOOK_PROGRAM_ID, RAYDIUM_POOL_V4_PROGRAM_ID, SOL_DECIMALS, SOL_MINT } from './const';
import { solPrivateConnection, solPublicConnection } from './connections';
import { OpenOrders } from '@project-serum/serum';
import { sleep } from 'openai/core';


export class PoolManager {

    /**
     * Retrieves the token price for a given pool ID.
     *
     * @param poolId - The ID of the pool to fetch the token price from.
     * @return The token price in SOL. Returns undefined if an error occurs.
     */
    async getTokenPrice(connection: Connection, poolId: string): Promise<number> {
        try {
            //fetching pool data
            const version: 4 | 5 = 4;


            const account = await connection.getAccountInfo(new PublicKey(poolId));
            const { state: LiquidityStateLayout } = Liquidity.getLayouts(version);

            //@ts-ignore
            const poolState = LiquidityStateLayout.decode(account?.data);

            const baseDecimal = 10 ** poolState.baseDecimal.toNumber();
            const quoteDecimal = 10 ** poolState.quoteDecimal.toNumber();

            const baseTokenAmount = await connection.getTokenAccountBalance(poolState.baseVault);
            const quoteTokenAmount = await connection.getTokenAccountBalance(poolState.quoteVault);

            const basePnl = poolState.baseNeedTakePnl.toNumber() / baseDecimal;
            const quotePnl = poolState.quoteNeedTakePnl.toNumber() / quoteDecimal;

            const OPENBOOK_PROGRAM_ID = poolState.marketProgramId;

            const openOrders = await OpenOrders.load(connection, poolState.openOrders, OPENBOOK_PROGRAM_ID);

            const openOrdersBaseTokenTotal = openOrders.baseTokenTotal.toNumber() / baseDecimal;
            const openOrdersQuoteTokenTotal = openOrders.quoteTokenTotal.toNumber() / quoteDecimal;

            const base = (baseTokenAmount.value?.uiAmount || 0) + openOrdersBaseTokenTotal - basePnl;
            const quote = (quoteTokenAmount.value?.uiAmount || 0) + openOrdersQuoteTokenTotal - quotePnl;

            let priceInSol = "";

            if (poolState.baseMint.equals(NATIVE_MINT)) {
                priceInSol = (base / quote).toString();
            } else if (poolState.quoteMint.equals(NATIVE_MINT)) {
                priceInSol = (quote / base).toString();
            }

            return parseFloat(priceInSol);
        } catch (e) {
            console.error(e);
            return 0;
        }
    }


    async getPoolInfo(connection: Connection, poolId: PublicKey): Promise<ApiPoolInfoV4> {
        const info = await connection.getAccountInfo(poolId);
        if (!info) {
            throw Error('No Pool Info')
        }

        let amAccountData = { id: poolId, programId: info.owner, ...LIQUIDITY_STATE_LAYOUT_V4.decode(info.data) }
        const marketProgramId = amAccountData.marketProgramId
        const allMarketInfo = await connection.getAccountInfo(marketProgramId)
        if (!allMarketInfo) {
            throw Error('No Pool Info')
        }
        const itemMarketInfo = MARKET_STATE_LAYOUT_V3.decode(allMarketInfo.data)


        const marketInfo = {
            marketProgramId: allMarketInfo.owner.toString(),
            marketAuthority: Market.getAssociatedAuthority({ programId: allMarketInfo.owner, marketId: marketProgramId }).publicKey.toString(),
            marketBaseVault: itemMarketInfo.baseVault.toString(),
            marketQuoteVault: itemMarketInfo.quoteVault.toString(),
            marketBids: itemMarketInfo.bids.toString(),
            marketAsks: itemMarketInfo.asks.toString(),
            marketEventQueue: itemMarketInfo.eventQueue.toString()
        }

        return {
            id: amAccountData.id.toString(),
            baseMint: amAccountData.baseMint.toString(),
            quoteMint: amAccountData.quoteMint.toString(),
            lpMint: amAccountData.lpMint.toString(),
            baseDecimals: amAccountData.baseDecimal.toNumber(),
            quoteDecimals: amAccountData.quoteDecimal.toNumber(),
            lpDecimals: amAccountData.baseDecimal.toNumber(),
            version: 4,
            programId: amAccountData.programId.toString(),
            authority: Liquidity.getAssociatedAuthority({ programId: amAccountData.programId }).publicKey.toString(),
            openOrders: amAccountData.openOrders.toString(),
            targetOrders: amAccountData.targetOrders.toString(),
            baseVault: amAccountData.baseVault.toString(),
            quoteVault: amAccountData.quoteVault.toString(),
            withdrawQueue: amAccountData.withdrawQueue.toString(),
            lpVault: amAccountData.lpVault.toString(),
            marketVersion: 3,
            marketId: amAccountData.marketId.toString(),
            ...marketInfo,
            lookupTableAccount: PublicKey.default.toString()
        }
    }


    async getVaultsInfoFromPoolState(poolState: any): Promise<number[]|undefined> {
        try {
            //to load openOrders from openbook
            const openOrders = await OpenOrders.load(
              solPrivateConnection,
              new PublicKey(poolState.openOrders),
              OPENBOOK_PROGRAM_ID
            );

            const baseDecimal = 10 ** poolState.baseDecimal; // e.g. 10 ^ 6
            const quoteDecimal = 10 ** poolState.quoteDecimal;

            const baseTokenAmount = await solPrivateConnection.getTokenAccountBalance(
              new PublicKey(poolState.baseVault)
            );
            await sleep(500)
            const quoteTokenAmount = await solPrivateConnection.getTokenAccountBalance(
              new PublicKey(poolState.quoteVault)
            );

            const basePnl = poolState.baseNeedTakePnl / baseDecimal;
            const quotePnl = poolState.quoteNeedTakePnl / quoteDecimal;

            // @ts-ignore
            const openOrdersBaseTokenTotal = openOrders.baseTokenTotal / baseDecimal;
            // @ts-ignore
            const openOrdersQuoteTokenTotal = openOrders.quoteTokenTotal / quoteDecimal;

            const base =
              (baseTokenAmount.value?.uiAmount || 0) + openOrdersBaseTokenTotal - basePnl;
            const quote =
              (quoteTokenAmount.value?.uiAmount || 0) +
              openOrdersQuoteTokenTotal -
              quotePnl;

            console.log(
              "Pool info:",
              "\n base tokens in pool " + base,
              "\n quote tokens in pool " + quote,
            );
            return [base, quote]
        } catch (e) {
            console.error(e)
        }
    }

    async fetchPoolKeysForLPInitTransactionHash(txSignature: string): Promise<[LiquidityPoolKeysV4, number, number]> {
        const tx = await solPrivateConnection.getParsedTransaction(txSignature, {maxSupportedTransactionVersion: 0});
        if (!tx) {
            throw new Error('Failed to fetch transaction with signature ' + txSignature);
        }
        const poolInfo = this.parsePoolInfoFromLpTransaction(tx);
        console.log("Market Info " + poolInfo.marketId.toBase58())
        const marketInfo = await this.fetchMarketInfo(poolInfo.marketId);

        return [{
            id: poolInfo.id,
            baseMint: poolInfo.baseMint,
            quoteMint: poolInfo.quoteMint,
            lpMint: poolInfo.lpMint,
            baseDecimals: poolInfo.baseDecimals,
            quoteDecimals: poolInfo.quoteDecimals,
            lpDecimals: poolInfo.lpDecimals,
            version: 4,
            programId: poolInfo.programId,
            authority: poolInfo.authority,
            openOrders: poolInfo.openOrders,
            targetOrders: poolInfo.targetOrders,
            baseVault: poolInfo.baseVault,
            quoteVault: poolInfo.quoteVault,
            withdrawQueue: poolInfo.withdrawQueue,
            lpVault: poolInfo.lpVault,
            marketVersion: 3,
            marketProgramId: poolInfo.marketProgramId,
            marketId: poolInfo.marketId,
            marketAuthority: Market.getAssociatedAuthority({
                programId: poolInfo.marketProgramId,
                marketId: poolInfo.marketId
            }).publicKey,
            // @ts-ignore
            marketBaseVault: marketInfo.baseVault,
            // @ts-ignore
            marketQuoteVault: marketInfo.quoteVault,
            // @ts-ignore
            marketBids: marketInfo.bids,
            // @ts-ignore
            marketAsks: marketInfo.asks,
            // @ts-ignore
            marketEventQueue: marketInfo.eventQueue,
        } as LiquidityPoolKeysV4, poolInfo.openTime, poolInfo.lpReserve];
    }

    findLogEntry(needle: string, logEntries: Array<string>): string | null {
        for (let i = 0; i < logEntries.length; ++i) {
            if (logEntries[i].includes(needle)) {
                return logEntries[i];
            }
        }

        return null;
    }

    async fetchMarketInfo(marketId: PublicKey) {
        try {
            console.log(marketId.toBase58())
            const marketAccountInfo = await solPublicConnection.getAccountInfo(marketId);
            if (!marketAccountInfo) {
                throw new Error('Failed to fetch market info for market id ' + marketId.toBase58());
            }
            console.log("Fetch market info successfully " + marketId.toBase58())

            return MARKET_STATE_LAYOUT_V3.decode(marketAccountInfo.data);
        } catch (e) {
            // @ts-ignore
            console.log('Cannot fetch market info ' + e.stack)
        }
    }


    parsePoolInfoFromLpTransaction(txData: ParsedTransactionWithMeta) {
        const initInstruction = this.findInstructionByProgramId(txData.transaction.message.instructions, new PublicKey(RAYDIUM_POOL_V4_PROGRAM_ID)) as PartiallyDecodedInstruction | null;
        if (!initInstruction) {
            throw new Error('Failed to find lp init instruction in lp init tx');
        }
        const baseMint = initInstruction.accounts[8];
        const baseVault = initInstruction.accounts[10];
        const quoteMint = initInstruction.accounts[9];
        const quoteVault = initInstruction.accounts[11];
        const lpMint = initInstruction.accounts[7];
        const baseAndQuoteSwapped = baseMint.toBase58() === SOL_MINT;
        const lpMintInitInstruction = this.findInitializeMintInInnerInstructionsByMintAddress(txData.meta?.innerInstructions ?? [], lpMint);
        if (!lpMintInitInstruction) {
            throw new Error('Failed to find lp mint init instruction in lp init tx');
        }
        const lpMintInstruction = this.findMintToInInnerInstructionsByMintAddress(txData.meta?.innerInstructions ?? [], lpMint);
        if (!lpMintInstruction) {
            throw new Error('Failed to find lp mint to instruction in lp init tx');
        }
        const baseTransferInstruction = this.findTransferInstructionInInnerInstructionsByDestination(txData.meta?.innerInstructions ?? [], baseVault, TOKEN_PROGRAM_ID);
        if (!baseTransferInstruction) {
            throw new Error('Failed to find base transfer instruction in lp init tx');
        }
        const quoteTransferInstruction = this.findTransferInstructionInInnerInstructionsByDestination(txData.meta?.innerInstructions ?? [], quoteVault, TOKEN_PROGRAM_ID);
        if (!quoteTransferInstruction) {
            throw new Error('Failed to find quote transfer instruction in lp init tx');
        }
        const lpDecimals = lpMintInitInstruction.parsed.info.decimals;
        const lpInitializationLogEntryInfo = this.extractLPInitializationLogEntryInfoFromLogEntry(this.findLogEntry('init_pc_amount', txData.meta?.logMessages ?? []) ?? '');
        const basePreBalance = (txData.meta?.preTokenBalances ?? []).find(balance => balance.mint === baseMint.toBase58());
        if (!basePreBalance) {
            throw new Error('Failed to find base tokens preTokenBalance entry to parse the base tokens decimals');
        }
        const baseDecimals = basePreBalance.uiTokenAmount.decimals;

        return {
            id: initInstruction.accounts[4],
            baseMint,
            quoteMint,
            lpMint,
            baseDecimals: baseAndQuoteSwapped ? SOL_DECIMALS : baseDecimals,
            quoteDecimals: baseAndQuoteSwapped ? baseDecimals : SOL_DECIMALS,
            lpDecimals,
            version: 4,
            programId: new PublicKey(RAYDIUM_POOL_V4_PROGRAM_ID),
            authority: initInstruction.accounts[5],
            openOrders: initInstruction.accounts[6],
            targetOrders: initInstruction.accounts[13],
            baseVault,
            quoteVault,
            withdrawQueue: new PublicKey("11111111111111111111111111111111"),
            lpVault: new PublicKey(lpMintInstruction.parsed.info.account),
            marketVersion: 3,
            marketProgramId: initInstruction.accounts[15],
            marketId: initInstruction.accounts[16],
            baseReserve: parseInt(baseTransferInstruction.parsed.info.amount),
            quoteReserve: parseInt(quoteTransferInstruction.parsed.info.amount),
            lpReserve: parseInt(lpMintInstruction.parsed.info.amount),
            openTime: lpInitializationLogEntryInfo.open_time,
        }
    }

    findTransferInstructionInInnerInstructionsByDestination(innerInstructions: Array<ParsedInnerInstruction>, destinationAccount: PublicKey, programId?: PublicKey): ParsedInstruction | null {
        for (let i = 0; i < innerInstructions.length; i++) {
            for (let y = 0; y < innerInstructions[i].instructions.length; y++) {
                const instruction = innerInstructions[i].instructions[y] as ParsedInstruction;
                if (!instruction.parsed) {
                    continue
                }
                if (instruction.parsed.type === 'transfer' && instruction.parsed.info.destination === destinationAccount.toBase58() && (!programId || instruction.programId.equals(programId))) {
                    return instruction;
                }
            }
        }

        return null;
    }

    findInitializeMintInInnerInstructionsByMintAddress(innerInstructions: Array<ParsedInnerInstruction>, mintAddress: PublicKey): ParsedInstruction | null {
        for (let i = 0; i < innerInstructions.length; i++) {
            for (let y = 0; y < innerInstructions[i].instructions.length; y++) {
                const instruction = innerInstructions[i].instructions[y] as ParsedInstruction;
                if (!instruction.parsed) {
                    continue
                }
                if (instruction.parsed.type === 'initializeMint' && instruction.parsed.info.mint === mintAddress.toBase58()) {
                    return instruction;
                }
            }
        }

        return null;
    }

    findMintToInInnerInstructionsByMintAddress(innerInstructions: Array<ParsedInnerInstruction>, mintAddress: PublicKey): ParsedInstruction | null {
        for (let i = 0; i < innerInstructions.length; i++) {
            for (let y = 0; y < innerInstructions[i].instructions.length; y++) {
                const instruction = innerInstructions[i].instructions[y] as ParsedInstruction;
                if (!instruction.parsed) {
                    continue
                }
                if (instruction.parsed.type === 'mintTo' && instruction.parsed.info.mint === mintAddress.toBase58()) {
                    return instruction;
                }
            }
        }

        return null;
    }

    findInstructionByProgramId(instructions: Array<ParsedInstruction | PartiallyDecodedInstruction>, programId: PublicKey): ParsedInstruction | PartiallyDecodedInstruction | null {
        for (let i = 0; i < instructions.length; i++) {
            if (instructions[i].programId.equals(programId)) {
                return instructions[i];
            }
        }

        return null;
    }

    extractLPInitializationLogEntryInfoFromLogEntry(lpLogEntry: string): {
        nonce: number,
        open_time: number,
        init_pc_amount: number,
        init_coin_amount: number
    } {
        const lpInitializationLogEntryInfoStart = lpLogEntry.indexOf('{');

        return JSON.parse(this.fixRelaxedJsonInLpLogEntry(lpLogEntry.substring(lpInitializationLogEntryInfoStart)));
    }

    fixRelaxedJsonInLpLogEntry(relaxedJson: string): string {
        return relaxedJson.replace(/([{,])\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*:/g, "$1\"$2\":");
    }


    // // Define a function to fetch and decode OpenBook accounts
    // // @ts-ignore
    // async fetchOpenBookAccounts(base, quote, commitment) {
    //     const accounts = await solPrivateConnection.getProgramAccounts(
    //         OPENBOOK_PROGRAM_ID,
    //         {
    //             commitment,
    //             filters: [
    //                 {dataSize: MARKET_STATE_LAYOUT_V3.span},
    //                 {
    //                     memcmp: {
    //                         offset: MARKET_STATE_LAYOUT_V3.offsetOf("baseMint"),
    //                         bytes: base.toBase58(),
    //                     },
    //                 },
    //                 {
    //                     memcmp: {
    //                         offset: MARKET_STATE_LAYOUT_V3.offsetOf("quoteMint"),
    //                         bytes: quote.toBase58(),
    //                     },
    //                 },
    //             ],
    //         }
    //     );
    //
    //     // @ts-ignore
    //     return accounts.map(({account}) => MARKET_STATE_LAYOUT_V3.decode(account.data));
    // }

    // Define a function to fetch and decode Market accounts
    // async fetchMarketAccounts(base: PublicKey, quote: PublicKey, commitment: Commitment) {
    //     const accounts = await solPrivateConnection.getProgramAccounts(
    //         new PublicKey(RAYDIUM_POOL_V4_PROGRAM_ID),
    //         {
    //             commitment: commitment,
    //             filters: [
    //                 {dataSize: LIQUIDITY_STATE_LAYOUT_V4.span},
    //                 {
    //                     memcmp: {
    //                         offset: LIQUIDITY_STATE_LAYOUT_V4.offsetOf("baseMint"),
    //                         bytes: base.toBase58(),
    //                     },
    //                 },
    //                 {
    //                     memcmp: {
    //                         offset: LIQUIDITY_STATE_LAYOUT_V4.offsetOf("quoteMint"),
    //                         bytes: quote.toBase58(),
    //                     },
    //                 },
    //             ],
    //         }
    //     );
    //     console.log(accounts)
    //     // @ts-ignore
    //     return accounts.map(({pubkey, account}) => ({
    //         id: pubkey.toString(),
    //         ...LIQUIDITY_STATE_LAYOUT_V4.decode(account.data),
    //     }));
    // }

    async fetchMarketAccounts(base: PublicKey, quote: PublicKey, commitment: Commitment = 'finalized') {
        const marketProgramId = new PublicKey(RAYDIUM_POOL_V4_PROGRAM_ID)
        const accounts = await solPrivateConnection.getProgramAccounts(
            marketProgramId,
            {
                commitment,
                filters: [
                    { dataSize: LIQUIDITY_STATE_LAYOUT_V4.span },
                    {
                        memcmp: {
                            offset: LIQUIDITY_STATE_LAYOUT_V4.offsetOf("baseMint"),
                            bytes: base.toBase58(),
                        },
                    },
                    {
                        memcmp: {
                            offset: LIQUIDITY_STATE_LAYOUT_V4.offsetOf("quoteMint"),
                            bytes: quote.toBase58(),
                        },
                    },
                ],
            }
        );
        return accounts.map(({ pubkey, account }) => ({
            id: pubkey.toString(),
            ...LIQUIDITY_STATE_LAYOUT_V4.decode(account.data),
        }));
    }

    async getPoolKeys(base: string, quote: string) {
        const rsp = await this.fetchMarketAccounts(new PublicKey(base), new PublicKey(quote), 'finalized')
        return await this.formatAmmKeysById(rsp[0].id)
    }

    async formatAmmKeysById(id: string): Promise<LiquidityPoolKeysV4> {
        const account = await solPrivateConnection.getAccountInfo(new PublicKey(id))
        if (account === null) throw Error(' get id info error ')
        const info = LIQUIDITY_STATE_LAYOUT_V4.decode(account.data)

        const marketId = info.marketId
        const marketAccount = await solPrivateConnection.getAccountInfo(marketId)
        if (marketAccount === null) throw Error(' get market info error')
        const marketInfo = MARKET_STATE_LAYOUT_V3.decode(marketAccount.data)

        const lpMint = info.lpMint
        const lpMintAccount = await solPrivateConnection.getAccountInfo(lpMint)
        if (lpMintAccount === null) throw Error(' get lp mint info error')
        const lpMintInfo = SPL_MINT_LAYOUT.decode(lpMintAccount.data)

        return {
            id: new PublicKey(id),
            baseMint: info.baseMint,
            quoteMint: info.quoteMint,
            lpMint: info.lpMint,
            baseDecimals: info.baseDecimal.toNumber(),
            quoteDecimals: info.quoteDecimal.toNumber(),
            lpDecimals: lpMintInfo.decimals,
            version: 4,
            programId: account.owner,
            authority: Liquidity.getAssociatedAuthority({programId: account.owner}).publicKey,
            openOrders: info.openOrders,
            targetOrders: info.targetOrders,
            baseVault: info.baseVault,
            quoteVault: info.quoteVault,
            withdrawQueue: info.withdrawQueue,
            lpVault: info.lpVault,
            marketVersion: 3,
            marketProgramId: info.marketProgramId,
            marketId: info.marketId,
            marketAuthority: Market.getAssociatedAuthority({programId: info.marketProgramId, marketId: info.marketId}).publicKey,
            marketBaseVault: marketInfo.baseVault,
            marketQuoteVault: marketInfo.quoteVault,
            marketBids: marketInfo.bids,
            marketAsks: marketInfo.asks,
            marketEventQueue: marketInfo.eventQueue,
            lookupTableAccount: PublicKey.default,
        } as LiquidityPoolKeysV4
    }
}
