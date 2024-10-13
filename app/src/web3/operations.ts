import {HttpError} from 'wasp/server';
import {chainTools} from "./solana/chainTools";
import {ExecuteChainMethod, GetSavedPotentialTokens, RefreshTokenInfo} from "wasp/server/operations";
import {PotentialToken} from 'wasp/entities';

// To refresh token info from the UI (refresh button on portfolio page)
export type RefreshTokenInfoInput = {
    tokenAddress: string,
}

export const refreshTokenInfo: RefreshTokenInfo<RefreshTokenInfoInput, any> = async (args, context) => {
    if (!context.user) {
        throw new HttpError(401);
    }
    return {result: await chainTools.refreshTokenInfo(args)}
}

type ChainMethodInput = {
    methodName: string,
    args: { [key: string]: string }
}

type ChainMethodOutput = {
    result: string,
}

// To execute chain method on demand from chain tools UI page
export const executeChainMethod: ExecuteChainMethod<ChainMethodInput, ChainMethodOutput> = async (args, context) => {
    return {result: await chainTools.executeChainMethod(args.methodName, args.args)}
}


type GetPaginatedTokensInput = {
    offset: number | undefined;
    limit: number | undefined;
};

type GetPaginatedTokensOutput = {
    tokens: PotentialToken[];
    totalPages: number;
};

// To get paginated potential tokens from portfolio page
export const getSavedPotentialTokens: GetSavedPotentialTokens<GetPaginatedTokensInput, GetPaginatedTokensOutput> = async (args, context) => {
    if (!context.user) {
        throw new HttpError(401);
    }
    const totalTokens = await context.entities.PotentialToken.count();
    const totalPages = Math.ceil(totalTokens / 20);

    return {
        tokens: await context.entities.PotentialToken.findMany({
                orderBy: {
                    poolCreatedAt: 'desc',
                },
                skip: args.offset,
                take: args.limit,
            },
        ),
        totalPages: totalPages
    };
};