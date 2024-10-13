import {PublicKey} from "@solana/web3.js";
import {Trader} from "./trader";
import {solPrivateConnection} from "./connections";
import {WalletContainer} from "./wallet";
import {PoolManager} from './poolManager';
import {connect} from "../../websocket";
import {RefreshTokenInfoInput} from "../operations";
import {NewTokensDetector} from "./newTokensDetector";
import {TokenManager} from "./tokenManager";

/**
 * ChainTools class that handles the chain methods
 * These methods are mainly triggered from the UI
 */
export class ChainTools {
    private readonly newTokensDetector: NewTokensDetector;
    private readonly trader: Trader;
    private readonly walletContainer: WalletContainer;
    private readonly tokenManager: TokenManager;

    constructor() {
        this.newTokensDetector = new NewTokensDetector()
        this.walletContainer = new WalletContainer()
        this.trader = new Trader(this.walletContainer)
        this.tokenManager = new TokenManager()
    }

    /**
     * This method runs continuously in the background to find new potential tokens
     * It the main entry point for background tasks that run on the server to find new potential tokens
     */
    public async listNewPotentialTokens() {
        await this.newTokensDetector.findNewPotentialTokens()
    }


    /**
     * Sometimes we want to refresh token data manually from the UI
     * It helps to get the latest token data to decide manually on buy or sell
     */
    public async refreshTokenInfo(args: RefreshTokenInfoInput): Promise<any> {
        return await this.tokenManager.getRefreshedTokenData(args.tokenAddress)
    }

    /**
     * This method is used to execute a chain method given from the UI
     * It parses the arguments and calls the respective method
     * Add or modify it to your own needs
     */
    public async executeChainMethod(methodName: string, args: { [key: string]: string }) {
        // @ts-ignore
        let parsedArgs = []
        Object.entries(args).forEach(([key, value]) => {
            console.log(`Key: ${key}, Value: ${value}`);
            if (key == "PublicKey") {
                parsedArgs.push(new PublicKey(value))
            } else {
                parsedArgs.push(value)
            }
        });
        if (methodName == "getPoolInfo") {
            // @ts-ignore
            // return JSON.stringify(await this.raydium.getPoolInfo(...parsedArgs))
            let temp = new PoolManager()
            // @ts-ignore
            return JSON.stringify(await temp.getPoolInfo(solPrivateConnection, ...parsedArgs))
        }
        if (methodName == "getTokenPrice") {
            // @ts-ignore
            // return JSON.stringify(await this.raydium.getPoolInfo(...parsedArgs))
            let temp = new PoolManager()
            // @ts-ignore
            return JSON.stringify(await temp.getTokenPrice(solPrivateConnection, ...parsedArgs))
        }
        if (methodName == "trade") {
            return JSON.stringify(await this.trader.trade(
                // @ts-ignore
                ...parsedArgs
            ))
        }
        if (methodName == "getTokensAccountOverview") {
            return JSON.stringify(await this.trader.getTokensAccountOverview(
                // @ts-ignore
                ...parsedArgs
            ))
        }
        if (methodName == "getTokenInAccountOverview") {
            return JSON.stringify(await this.trader.getTokenInAccountOverview(
                // @ts-ignore
                ...parsedArgs
            ))
        }
        if (methodName == "shouldSell") {
            return JSON.stringify(await this.trader.shouldSell(
                // @ts-ignore
                ...parsedArgs
            ))
        }

        try {
            // @ts-ignore
            let res = await solPrivateConnection[methodName](...parsedArgs)
            return JSON.stringify(res)
        } catch (e) {
            // @ts-ignore
            let res = await solPrivateConnection[methodName](...parsedArgs)
            return JSON.stringify(res)
        }
    }
}

async function backgroundTask() {
    await connect()
    // await chainTools.listNewPotentialTokens();
}

// Run the background task asynchronously
setTimeout(backgroundTask, 0);

export const chainTools = new ChainTools()
