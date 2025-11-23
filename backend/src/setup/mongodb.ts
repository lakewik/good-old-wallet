import { MongoClient, Db } from "mongodb";
import { logger } from "./logger.js";

let client: MongoClient | null = null;
let db: Db | null = null;

const MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost:27017";
const DB_NAME = process.env.MONGODB_DB_NAME || "good_old_wallet";

/**
 * Connect to MongoDB
 */
export async function connectToMongoDB(): Promise<Db> {
  if (db) {
    return db;
  }

  try {
    logger.info("Connecting to MongoDB...", { uri: MONGODB_URI, db: DB_NAME });
    
    client = new MongoClient(MONGODB_URI);
    await client.connect();
    
    db = client.db(DB_NAME);
    
    logger.info("MongoDB connected successfully", { db: DB_NAME });
    
    return db;
  } catch (error) {
    logger.error("Failed to connect to MongoDB", error);
    throw error;
  }
}

/**
 * Get MongoDB database instance
 */
export function getDb(): Db {
  if (!db) {
    throw new Error("MongoDB not initialized. Call connectToMongoDB() first.");
  }
  return db;
}

/**
 * Close MongoDB connection
 */
export async function closeMongoDB(): Promise<void> {
  if (client) {
    await client.close();
    client = null;
    db = null;
    logger.info("MongoDB connection closed");
  }
}

