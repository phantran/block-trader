/**
 * Used purely to help compiler check for exhaustiveness in switch statements,
 * will never execute. See https://stackoverflow.com/a/39419171.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function assertUnreachable(x: never): never {
  throw Error('This code should be unreachable');
}

export function secondsSinceEpoch(epoch: number) {
  const currentTimestamp = Date.now() / 1000;
  return (currentTimestamp - epoch).toFixed(1)
}

export function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
