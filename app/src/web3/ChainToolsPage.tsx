import {executeChainMethod} from 'wasp/client/operations';
import {useEffect, useState} from 'react';

export default function ChainToolsPage() {
    const [methodName, setMethodName] = useState('');
    const [argumentsValue, setArgumentsValue] = useState<string>('');
    const [result, setResult] = useState(null);

    const handleExecuteMethod = async () => {
        try {
            const res = await executeChainMethod({methodName: methodName, args: JSON.parse(argumentsValue)});
            console.log(res)
            const resultObject = JSON.parse(res.result);
            setResult(resultObject);
        } catch (error) {
            console.error('Error executing chain method:', error);
            setResult(null);
        }
    };

    useEffect(() => {
        setMethodName(localStorage.getItem("methodName") ?? "");
        setArgumentsValue(localStorage.getItem("argumentsValue") ?? "");
    }, []);

    // @ts-ignore
    const handleMethodNameChange = (e) => {
        setMethodName(e.target.value);
        localStorage.setItem("methodName", e.target.value);
    };

    // @ts-ignore
    const handleArgumentsValueChange = (e) => {
        setArgumentsValue(e.target.value);
        localStorage.setItem("argumentsValue", e.target.value);
    };

    return (
        <div className='py-10 lg:mt-10'>
            <div className='mx-auto max-w-7xl px-6 lg:px-8'>
                <div className='mx-auto max-w-4xl text-center'>
                    <h2 className='mt-2 text-4xl font-bold tracking-tight text-gray-900 sm:text-5xl dark:text-white'>
                        <span className='text-yellow-500'>Chain</span> Tools
                    </h2>
                </div>
                <p className='mx-auto mt-6 max-w-2xl text-center text-lg leading-8 text-gray-600 dark:text-white'>
                    On this page, you can send execute a method belong to the block chain connection object. e.g:
                    getAccountInfo
                </p>
                <div className="flex">
                    <div className="w-1/2 p-4">
                        <input
                            type="text"
                            className="w-full mb-4 p-2 border border-gray-300 rounded"
                            placeholder="Method Name"
                            value={methodName}
                            onChange={handleMethodNameChange}
                        />
                        <textarea
                            className="w-full h-50 px-3 py-2 mb-2 text-base placeholder-gray-500 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500 focus:ring focus:ring-blue-200"
                            placeholder="Comma-separated Arguments"
                            value={argumentsValue}
                            onChange={handleArgumentsValueChange}
                        />
                        <button
                            className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded"
                            onClick={handleExecuteMethod}
                        >
                            Execute Method
                        </button>
                    </div>
                    <div className="w-1/2 p-4">
                        <div className="border border-gray-300 rounded p-4">
                            {result && (
                                <pre>{JSON.stringify(result, null, 2)}</pre>
                            )}
                            {!result && (
                                <p>No result available</p>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
