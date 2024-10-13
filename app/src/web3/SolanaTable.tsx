import React from 'react';
import {
    ColumnDef,
    flexRender,
    getCoreRowModel,
    getSortedRowModel,
    SortingState,
    useReactTable,
} from '@tanstack/react-table'
import toast from "react-hot-toast";
import {PotentialToken} from 'wasp/entities';
import {secondsSinceEpoch} from "../shared/utils";

interface Props {
    data: PotentialToken[];
    refreshCallback: (arg: any)  => Promise<any>
}

interface LinkProps {
    onClick: (event: React.MouseEvent<HTMLAnchorElement>, param: string) => void;
    value: string,
    param: string
}

export function ClickableCell({onClick, value, param}: LinkProps) {
    return <a className="text-primary" href="#" onClick={(event) => onClick(event, param)}>{value}</a>
}

const LinkCell: React.FC<{ value: string, platformUrl: string, cellValue: string }> = ({
                                                                                           value,
                                                                                           platformUrl,
                                                                                           cellValue
                                                                                       }) => {
    const link = `https://${platformUrl}/${value}`;
    return <div className="text-primary">
        <a href={link} target="_blank">{!cellValue ? truncateWithEllipsis(value) : cellValue}</a>
    </div>;
};

const SimpleLink: React.FC<{ text: string, link: string }> = ({text, link}) => {
    if (!link) return <div></div>
    return <div className="inline text-primary">
        <a href={link} target="_blank">{text + "  "}</a>
    </div>;
};


const ObjectsList: React.FC<{ values: any[] }> = ({values}) => {
    if (!values) return
    return (
        <ul className="list-disc list-inside">
            {values.map((item, index) => (
                <li key={index} className="mb-2 text-danger">
                    {Object.values(item).join('======')}
                </li>
            ))}
        </ul>
    );
};

const ObjectData: React.FC<{ data: { [key: string]: any } }> = ({data}) => {
    if (!data) return
    return (
        <ul className="list-disc list-inside">
            {Object.entries(data).map(([key, value]) => (
                // Create an HTML list item for each key-value pair
                <li key={key}>{key}: {value}</li>
            ))}
        </ul>
    );
};

const SolanaTokenTable: React.FC<Props> = ({data, refreshCallback}) => {
    const [sorting, setSorting] = React.useState<SortingState>([])
    const columns = React.useMemo<ColumnDef<PotentialToken>[]>(
        () => [
            {
                header: 'Name',
                // @ts-ignore
                id: 'tokenAddress',

                accessorFn: row => row,
                cell: (info: any) => <ClickableCell onClick={handleCopy} param={info.getValue().tokenAddress}
                                                    value={info.getValue().metadata?.symbol}/>

            },
            {
                header: 'Token Info',
                accessorFn: row => row,
                cell: (info: any) => {
                    let isMutable = info.getValue()?.metadata?.isMutable;
                    let mutableText = <b className="text-danger">Mutable Metadata: Yes</b>
                    if (isMutable === false) {
                        mutableText = <b className="text-success">Mutable Metadata: No</b>
                    }
                    let mintAuthority = info.getValue()?.mintAuthority;
                    let mintAuthorityText = <b className="text-success">Mint Authority Enabled: No</b>
                    if (mintAuthority) {
                        mintAuthorityText = <b className="text-danger">Mint Authority Enabled: Yes</b>
                    }
                    let freezeAuthority = info.getValue()?.metadata?.freezeAuthority;
                    let freezeAuthorityText = <b className="text-success">Freeze Authority Enabled: No</b>
                    if (freezeAuthority) {
                        freezeAuthorityText = <b className="text-danger">Freeze Authority Enabled: Yes</b>
                    }
                    return <ul>
                        <li>Name: {info.getValue()?.metadata?.name}</li>
                        <li>{mutableText}</li>
                        <li>{mintAuthorityText}</li>
                        <li>{freezeAuthorityText}</li>
                        <li>Logo: {info.getValue()?.metadata?.image ? "Yes" : "No"}</li>
                        <li>Desc: {truncateWithEllipsis(info.getValue()?.metadata?.description, 100)}</li>
                        <li>
                            <div>
                                <SimpleLink text="Web" link={info.getValue()?.metadata?.extensions?.website}/>
                                <SimpleLink text="Twitter" link={info.getValue()?.metadata?.extensions?.twitter}/>
                                <SimpleLink text="Telegram" link={info.getValue()?.metadata?.extensions?.telegram}/>
                            </div>
                        </li>
                    </ul>
                }
            },
            {
                header: 'Links',
                accessorFn: row => row,
                cell: (info: any) => <ul>
                    <li><LinkCell value={info.getValue().tokenAddress} platformUrl="rugcheck.xyz/tokens"
                                  cellValue="RugCheck"/></li>
                    <li><LinkCell value={info.getValue().tokenAddress} platformUrl="dexscreener.com/solana"
                                  cellValue="DexScreener"/></li>
                    <li><LinkCell value={info.getValue().tokenAddress} platformUrl="solscan.io/account"
                                  cellValue="TokenScan"/></li>
                    <li><LinkCell value={info.getValue().initTx} platformUrl="solscan.io/tx" cellValue='TxScan'/></li>
                    <li><LinkCell value={info.getValue().initTx} platformUrl="solana.fm/tx" cellValue='Tx-FM'/></li>

                </ul>
            },
            {
                header: 'Pool Info',
                accessorFn: row => row,
                cell: (info: any) => {

                    let poolInfo = info.getValue().parsedPoolInfo
                    if (!poolInfo) return <div></div>
                    let supplyConsiderDecimals = info.getValue().supply / Math.pow(10, info.getValue().decimals)
                    return (
                        <ul>
                            <li><b>Total Liquidity $:</b> {poolInfo.baseLiquidity + poolInfo.quoteLiquidity}</li>
                            <li><b>Token Liquidity $:</b> {poolInfo.baseLiquidity}</li>
                            <li><b>Token Price $:</b> {poolInfo.basePriceUsd}</li>
                            <li><b>Sol Liquidity $:</b> {poolInfo.quoteLiquidity}</li>
                            <li><b>Sol Price $:</b> {poolInfo.quotePriceUsd}</li>
                            <li><b>Token LP Amount:</b> {poolInfo.baseTokenAmount}</li>
                            <li><b>Sol LP Amount:</b> {poolInfo.quoteTokenAmount}</li>
                            <li><b>Market cap:</b> {poolInfo.basePriceUsd * supplyConsiderDecimals}</li>
                        </ul>
                    )
                }
            },
            {
                header: 'Burned LP',
                accessorFn: row => row.burnedLpPercentage?.toFixed(1)
            },
            {
                header: 'Top 10 Holders',
                accessorFn: row => row,
                cell: (info: any) => {
                    if (!info.getValue().supply || !info.getValue().decimals) return <div></div>
                    let distribution = info.getValue().holdersDistribution
                    // @ts-ignore
                    let holdersSum: number = distribution.reduce((accumulator: number, currentValue: any) => accumulator + parseFloat(currentValue.uiAmount), 0);
                    let supplyConsiderDecimals = info.getValue().supply / Math.pow(10, info.getValue().decimals)
                    let totalPercentage = (holdersSum / supplyConsiderDecimals) * 100
                    return (
                        <ul>
                            <li className={totalPercentage > 50 ? "text-danger" : "text-success"}>
                                <b>Total: {totalPercentage?.toFixed(2)}%</b></li>
                            {distribution.map((item: any, index: number) => {
                                if (index < 5) {

                                    let val = (parseFloat(item.uiAmount) / supplyConsiderDecimals) * 100
                                    return (<li key={index}>{truncateWithEllipsis(item.address)}:
                                        <b className={val > 50 ? "text-danger" : "text-success"}> {val?.toFixed(2)}%
                                        </b>
                                    </li>)
                                }
                            })}
                        </ul>
                    )
                }
            },
            {
                header: 'Pair Created',
                accessorFn: row => row.poolCreatedAt ? secondsSinceEpoch(row.poolCreatedAt) + "s" : "",
                sortingFn: 'datetime'
            },
            {
                header: 'Found At',
                accessorFn: row => row.foundAt.toUTCString(),
                sortingFn: 'datetime'
            },
            {
                header: 'Refresh',
                accessorFn: row => row,
                cell: (info: any) => {
                    return <button onClick={async () => await refreshCallback(info.getValue().tokenAddress)} className='font-medium text-sm text-indigo-600 hover:text-indigo-500 dark:text-indigo-400 dark:hover:text-indigo-300'>
                        Refresh
                    </button>
                }
            },
        ],
        []
    )

    // const [columnResizeMode, setColumnResizeMode] =
    //     React.useState<ColumnResizeMode>('onChange')
    // const [columnResizeDirection, setColumnResizeDirection] =
    //     React.useState<ColumnResizeDirection>('ltr')

    const table = useReactTable({
        data,
        columns,
        // columnResizeMode,
        // columnResizeDirection,
        state: {
            sorting,
        },
        onSortingChange: setSorting,
        getCoreRowModel: getCoreRowModel(),
        getSortedRowModel: getSortedRowModel(),
        debugTable: true
    })

    return (
        <div>
            <div className="h-2"/>
            <table
                className='table-auto w-full border-separate border border-spacing-1 rounded-md border-gray-200 shadow-sm'>
                <thead>
                {table.getHeaderGroups().map(headerGroup => (
                    <tr key={headerGroup.id}>
                        {headerGroup.headers.map(header => {
                            return (
                                <th key={header.id} colSpan={header.colSpan}>
                                    {header.isPlaceholder ? null : (
                                        <div
                                            className={
                                                header.column.getCanSort()
                                                    ? 'cursor-pointer select-none'
                                                    : ''
                                            }
                                            onClick={header.column.getToggleSortingHandler()}
                                            title={
                                                header.column.getCanSort()
                                                    ? header.column.getNextSortingOrder() === 'asc'
                                                        ? 'Sort ascending'
                                                        : header.column.getNextSortingOrder() === 'desc'
                                                            ? 'Sort descending'
                                                            : 'Clear sort'
                                                    : undefined
                                            }
                                        >
                                            {flexRender(
                                                header.column.columnDef.header,
                                                header.getContext()
                                            )}
                                            {{
                                                asc: ' 🔼',
                                                desc: ' 🔽',
                                            }[header.column.getIsSorted() as string] ?? null}
                                        </div>
                                    )}
                                </th>
                            )
                        })}
                    </tr>
                ))}
                </thead>
                <tbody>
                {table
                    .getRowModel()
                    .rows.slice(0, 10)
                    .map(row => {
                        return (
                            <tr key={row.id} className="hover:bg-gray-200">
                                {row.getVisibleCells().map(cell => {
                                    return (
                                        <td key={cell.id} className="px-4 py-1 border border-gray-200">
                                            {flexRender(
                                                cell.column.columnDef.cell,
                                                cell.getContext()
                                            )}
                                        </td>
                                    )
                                })}
                            </tr>
                        )
                    })}
                </tbody>
            </table>
            <div>{table.getRowModel().rows.length} Tokens</div>
            <pre>{JSON.stringify(sorting, null, 2)}</pre>
        </div>
    );
};

function truncateWithEllipsis(str: string | undefined, maxLength: number = 12): string {
    if (!str) return ""
    if (str.length <= maxLength) {
        return str;
    } else {
        return str.substring(0, maxLength / 2) + '...' + str.substring(str.length - maxLength / 2);
    }
}

const handleCopy = (event: React.MouseEvent<HTMLAnchorElement, MouseEvent>, param: string) => {
    navigator.clipboard.writeText(param)
        .then(() => {
            toast.success("Copied!");
        })
        .catch(err => console.error('Failed to copy:', err));
};

export default SolanaTokenTable;
