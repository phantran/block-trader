import {type WebSocketDefinition, type WaspSocketData} from 'wasp/server/webSocket'
import {type PotentialToken } from 'wasp/entities';
import createSubscriber from "pg-listen";
import {config, prisma} from 'wasp/server';

const subscriber = createSubscriber({ connectionString: config.databaseUrl })

subscriber.events.on("error", (error) => {
    console.error("Fatal database connection error:", error)
    process.exit(1)
})

process.on("exit", async () => {
    await subscriber.close()
})

export async function connect () {
    await subscriber.connect()
    await subscriber.listenTo("ws-channel")
}

export async function sendMessage (tokenAddress: string) {
    await subscriber.notify("ws-channel", {
        tokenAddress: tokenAddress,
    })
}

export const webSocketFn: WebSocketFn = (io, context) => {
    io.on('connection', async (socket) => {
        subscriber.notifications.on("ws-channel", async (payload) =>  {
            // Payload as passed to subscriber.notify() (see below)
            console.log("Received notification in 'ws-channel':", payload)
            // Use Prisma to query the newly inserted row
            const newRow = await prisma.potentialToken.findUnique({
                where: { tokenAddress: payload.tokenAddress },
            });

            console.log('New row:', newRow);
            io.emit("tokens", newRow as PotentialToken)
        })
    })

}


type WebSocketFn = WebSocketDefinition<
    ClientToServerEvents,
    ServerToClientEvents,
    InterServerEvents,
    SocketData
>

interface ServerToClientEvents {
    tokens: (data: PotentialToken) => void;
}
interface ClientToServerEvents {
}
interface InterServerEvents {}

// Data that is attached to the socket.
// NOTE: Wasp automatically injects the JWT into the connection,
// and if present/valid, the server adds a user to the socket.
interface SocketData extends WaspSocketData {}