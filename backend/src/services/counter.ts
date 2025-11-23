import { Collection, ObjectId } from "mongodb";
import { getDb } from "../setup/mongodb.js";
import { logger } from "../setup/logger.js";
import { debitUserBalance, getUserBalance } from "../db/user.js";

export interface Counter {
  _id?: ObjectId;
  userAddress: string;
  count: number;
  createdAt: Date;
  updatedAt: Date;
}

const COLLECTION_NAME = "counters";
const COUNTER_COST = BigInt("1000000000000000"); // 0.001 xDAI per click

/**
 * Get counters collection
 */
function getCountersCollection(): Collection<Counter> {
  const db = getDb();
  return db.collection<Counter>(COLLECTION_NAME);
}

/**
 * Get user counter
 */
export async function getUserCounter(
  userAddress: string
): Promise<Counter | null> {
  try {
    const collection = getCountersCollection();
    const counter = await collection.findOne({ userAddress });
    
    logger.debug("Fetched user counter", { userAddress, count: counter?.count });
    
    return counter;
  } catch (error) {
    logger.error("Error fetching user counter", { userAddress, error });
    throw error;
  }
}

/**
 * Increment counter with balance check
 */
export async function incrementCounter(
  userAddress: string
): Promise<{
  success: boolean;
  counter?: number;
  balance?: string;
  error?: string;
  message?: string;
}> {
  try {
    // Check user balance first
    const userBalance = await getUserBalance(userAddress);
    
    if (!userBalance) {
      return {
        success: false,
        error: "out_of_funds",
        message: "User not found. Please submit a payment first.",
      };
    }
    
    const currentBalance = BigInt(userBalance.balance);
    
    if (currentBalance < COUNTER_COST) {
      return {
        success: false,
        error: "out_of_funds",
        message: "Insufficient balance. Go to wallet to top up.",
        balance: userBalance.balance,
      };
    }
    
    // Debit the balance
    const debitResult = await debitUserBalance(userAddress, COUNTER_COST);
    
    if (!debitResult.success) {
      return {
        success: false,
        error: "out_of_funds",
        message: debitResult.error || "Failed to debit balance",
      };
    }
    
    // Increment counter
    const collection = getCountersCollection();
    const now = new Date();
    
    const result = await collection.findOneAndUpdate(
      { userAddress },
      {
        $inc: { count: 1 },
        $set: { updatedAt: now },
        $setOnInsert: { createdAt: now },
      },
      {
        upsert: true,
        returnDocument: "after",
      }
    );
    
    if (!result) {
      throw new Error("Failed to increment counter");
    }
    
    logger.info("Counter incremented successfully", {
      userAddress,
      newCount: result.count,
      newBalance: debitResult.balance?.balance,
    });
    
    return {
      success: true,
      counter: result.count,
      balance: debitResult.balance?.balance,
      message: "Counter incremented successfully",
    };
  } catch (error) {
    logger.error("Error incrementing counter", { userAddress, error });
    throw error;
  }
}

/**
 * Get counter cost
 */
export function getCounterCost(): bigint {
  return COUNTER_COST;
}

