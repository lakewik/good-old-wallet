import { Address } from "../setup/types";

export function isValidAddress(address: string): address is Address {
    return /^0x[a-fA-F0-9]{40}$/.test(address);
  }