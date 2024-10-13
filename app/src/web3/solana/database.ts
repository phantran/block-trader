import { prisma } from 'wasp/server'

export class Database {
    async tokenExists(tokenAddress: string): Promise<boolean> {
        return await this.getToken(tokenAddress) != null;
    }

    async insertToken(token: { data: any }): Promise<void> {
        await prisma.potentialToken.create(token);
    }

    async updateToken(tokenAddress: string, data: any): Promise<void> {
        await prisma.potentialToken.update({
            where: {
                tokenAddress: tokenAddress
            },
            // @ts-ignore
            data: data,
        });
    }


    async getToken(tokenAddress: string): Promise<any> {
        return prisma.potentialToken.findUnique({
            where: {
                tokenAddress: tokenAddress
            }
        })
    }
}