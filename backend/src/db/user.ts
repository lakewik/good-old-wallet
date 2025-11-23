import { Collection, ObjectId } from "mongodb";
import { getDb } from "../setup/mongodb.js";
import { logger } from "../setup/logger.js";

export interface UserBalance {
  _id?: ObjectId;
  userId: string; // Can be wallet address or any unique identifier
  userAddress: string; // Ethereum address
  balance: string; // Store as string to avoid precision issues with bigints
  createdAt: Date;
  updatedAt: Date;
}

const COLLECTION_NAME = "user_balances";

/**
 * Get user balances collection
 */
function getUserBalancesCollection(): Collection<UserBalance> {
  const db = getDb();
  return db.collection<UserBalance>(COLLECTION_NAME);
}

/**
 * Get user balance by address
 */
export async function getUserBalance(
  userAddress: string
): Promise<UserBalance | null> {
  try {
    const collection = getUserBalancesCollection();
    const user = await collection.findOne({ userAddress });
    
    logger.debug("Fetched user balance", { userAddress, balance: user?.balance });
    
    return user;
  } catch (error) {
    logger.error("Error fetching user balance", { userAddress, error });
    throw error;
  }
}

/**
 * Create or update user balance
 */
export async function upsertUserBalance(
  userAddress: string,
  balance: bigint
): Promise<UserBalance> {
  try {
    const collection = getUserBalancesCollection();
    const now = new Date();
    
    const result = await collection.findOneAndUpdate(
      { userAddress },
      {
        $set: {
          userId: userAddress, // Using address as userId for simplicity
          userAddress,
          balance: balance.toString(),
          updatedAt: now,
        },
        $setOnInsert: {
          createdAt: now,
        },
      },
      {
        upsert: true,
        returnDocument: "after",
      }
    );
    
    if (!result) {
      throw new Error("Failed to upsert user balance");
    }
    
    logger.info("User balance updated", {
      userAddress,
      newBalance: balance.toString(),
    });
    
    return result;
  } catch (error) {
    logger.error("Error upserting user balance", { userAddress, error });
    throw error;
  }
}

/**
 * Add to user balance (credit)
 */
export async function creditUserBalance(
  userAddress: string,
  amount: bigint
): Promise<UserBalance> {
  try {
    const user = await getUserBalance(userAddress);
    const currentBalance = user ? BigInt(user.balance) : 0n;
    const newBalance = currentBalance + amount;
    
    logger.info("Crediting user balance", {
      userAddress,
      currentBalance: currentBalance.toString(),
      creditAmount: amount.toString(),
      newBalance: newBalance.toString(),
    });
    
    return await upsertUserBalance(userAddress, newBalance);
  } catch (error) {
    logger.error("Error crediting user balance", { userAddress, amount: amount.toString(), error });
    throw error;
  }
}

/**
 * Deduct from user balance (debit)
 */
export async function debitUserBalance(
  userAddress: string,
  amount: bigint
): Promise<{ success: boolean; balance?: UserBalance; error?: string }> {
  try {
    const user = await getUserBalance(userAddress);
    
    if (!user) {
      return {
        success: false,
        error: "User not found",
      };
    }
    
    const currentBalance = BigInt(user.balance);
    
    if (currentBalance < amount) {
      return {
        success: false,
        error: "Insufficient balance",
      };
    }
    
    const newBalance = currentBalance - amount;
    
    logger.info("Debiting user balance", {
      userAddress,
      currentBalance: currentBalance.toString(),
      debitAmount: amount.toString(),
      newBalance: newBalance.toString(),
    });
    
    const updatedUser = await upsertUserBalance(userAddress, newBalance);
    
    return {
      success: true,
      balance: updatedUser,
    };
  } catch (error) {
    logger.error("Error debiting user balance", { userAddress, amount: amount.toString(), error });
    throw error;
  }
}

/**
 * Get or create user
 * If user exists, return their data
 * If user doesn't exist, create them with 0 balance
 */
export async function getOrCreateUser(
    userAddress: string
  ): Promise<{ exists: boolean; user: UserBalance }> {
    try {
      // Try to get existing user
      let user = await getUserBalance(userAddress);
      
      if (user) {
        logger.info("User already exists", { userAddress, balance: user.balance });
        return {
          exists: true,
          user,
        };
      }
      
      // User doesn't exist, create them with 0 balance
      logger.info("Creating new user", { userAddress });
      const newUser = await upsertUserBalance(userAddress, 0n);
      
      return {
        exists: false,
        user: newUser,
      };
    } catch (error) {
      logger.error("Error in getOrCreateUser", { userAddress, error });
      throw error;
    }
  }
  
  