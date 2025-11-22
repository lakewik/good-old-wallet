export function formatBalance(balance: bigint, decimals: number): string {
    if (balance === 0n) {
      return "0";
    }
  
    const divisor = BigInt(10 ** decimals);
    const whole = balance / divisor;
    const remainder = balance % divisor;
  
    if (remainder === 0n) {
      return whole.toString();
    }
  
    const remainderStr = remainder.toString().padStart(decimals, "0");
    const trimmed = remainderStr.replace(/0+$/, "");
    return `${whole}.${trimmed}`;
  }