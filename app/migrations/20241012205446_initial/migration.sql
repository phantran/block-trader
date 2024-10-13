-- CreateTable
CREATE TABLE "PotentialToken" (
    "id" TEXT NOT NULL,
    "initTx" TEXT,
    "tokenAddress" TEXT NOT NULL,
    "poolState" JSONB,
    "poolId" TEXT,
    "mintAuthority" TEXT,
    "freezeAuthority" TEXT,
    "lpReserve" DOUBLE PRECISION,
    "supply" DOUBLE PRECISION,
    "decimals" INTEGER,
    "holdersDistribution" JSONB,
    "burnedLpPercentage" DOUBLE PRECISION,
    "parsedPoolInfo" JSONB,
    "metadata" JSONB,
    "poolCreatedAt" INTEGER,
    "foundAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PotentialToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Transaction" (
    "id" TEXT NOT NULL,
    "txId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenAddress" TEXT NOT NULL,
    "inputToken" TEXT NOT NULL,
    "outputToken" TEXT NOT NULL,
    "inputAmount" DOUBLE PRECISION,
    "outputAmount" DOUBLE PRECISION,
    "status" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "timeTaken" TEXT,
    "isTesting" BOOLEAN,

    CONSTRAINT "Transaction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PotentialToken_tokenAddress_key" ON "PotentialToken"("tokenAddress");

-- CreateIndex
CREATE UNIQUE INDEX "Transaction_txId_key" ON "Transaction"("txId");

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
