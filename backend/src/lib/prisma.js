import "dotenv/config";
import { PrismaClient } from "@prisma/client";

// ES module caching keeps one shared client per process.
export const prisma = new PrismaClient();
