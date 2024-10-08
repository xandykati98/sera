import { Application, Router, send } from "https://deno.land/x/oak/mod.ts";
import { load } from "https://deno.land/std/dotenv/mod.ts";
import { oakCors } from "https://deno.land/x/cors/mod.ts";
import { Pool } from "https://deno.land/x/postgres@v0.17.0/mod.ts";
import { TableItemsReturn } from "./util.ts";
import { QueryObjectResult } from "https://deno.land/x/postgres@v0.17.0/query/query.ts";

const app = new Application();
const router = new Router();


// Load environment variables
const env = await load();
// Function to safely get environment variables
function getEnvOrThrow(key: string): string {
    const value = env[key];
    if (!value) {
        throw new Error(`Environment variable ${key} is not set`);
    }
    return value;
}

// Get the connection parameters from environment variables
const ip = getEnvOrThrow("DB_IP");
const user = getEnvOrThrow("DB_USER");
const password = getEnvOrThrow("DB_PASSWORD");
const dbName = getEnvOrThrow("DB_NAME");
const PROJECT_ID = getEnvOrThrow("PROJECT_ID");
const LOCATION = getEnvOrThrow("LOCATION");
const port = Deno.env.get("DB_PORT")! || '5432';

// Construct the database URL
const databaseUrl = `postgres://${user}:${password}@${ip}:${port}/${dbName}`;
console.log('Database URL:', databaseUrl);
// Create a database pool with three connections that are lazily established
const pool = new Pool(databaseUrl, 3, true);
const client = await pool.connect();

router.get("/health", async (ctx) => {
    ctx.response.body = {
        text: {
            values: [
                {
                    text: "OK",
                    color: 512
                }
            ]
        },
    };
});

router.post("/receive", async (ctx) => {
    const body = await ctx.request.body.json();
    // read the message from the request body
    const { items: itemsJson } = body.jsonPayload;
    const { items } = JSON.parse(itemsJson) as { items: TableItemsReturn[] };
    console.log('Received items:', items.length)
    if (!items || items.length === 0) {
        ctx.response.body = {
            text: {
                values: [
                    {
                        text: "No items found in the request body",
                        color: 16384
                    }
                ]
            },
        };
        return;
    }
    try {
        console.log('Starting transaction')
        // Start a transaction
        await client.queryObject('BEGIN');

        const insertQuery = `INSERT INTO "items" ("amount", "displayName", "fingerprint", "isCraftable", "name", "nbt", "scan_date", "tags") VALUES `;
        const batchSize = 1024;
        let values: string[] = [];
        let params: any[] = [];
        let paramIndex = 1;

        const tagsToArray = (tags: object | undefined | string[]): string[] => {
            if (typeof tags === 'object' && !Array.isArray(tags)) {
                return [];
            }
            if (Array.isArray(tags)) {
                return tags.filter(tag => typeof tag === 'string');
            }
            if (tags === undefined) {
                return [];
            }
            return tags;
        };
        const tagsToPgArray = (tags: string[]): string => {
            if (tags.length === 0) {
                return '{}'; // Return empty Postgres array
            }
            return `{${tags.map(tag => `"${tag}"`).join(',')}}`; // Format tags into PostgreSQL array
        };

        for (const item of items) {
            // Add placeholders for the current item
            values.push(`($${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++})`);

            // Add the actual values to the params array
            params.push(
                item.amount || 0,
                item.displayName || item.name || 'Bugged name',
                item.fingerprint,
                item.isCraftable,
                item.name,
                JSON.stringify(item.nbt),
                new Date().toISOString(),
                tagsToPgArray(tagsToArray(item.tags))
            );

            // If batch size reached, execute the batch insert
            if (values.length === batchSize) {
                await client.queryObject(insertQuery + values.join(', '), params); // Use params array directly
                values = [];
                params = [];
                paramIndex = 1; // Reset the param index for the next batch
            }
        }

        // Insert remaining values if any
        if (values.length > 0) {
            await client.queryObject(insertQuery + values.join(', '), params); // Use params array directly
        }


        // Commit the transaction
        await client.queryObject('COMMIT');
        console.log('Transaction committed')
        ctx.response.body = {
            text: {
                values: [
                    {
                        text: `Successfully inserted ${items.length} items`,
                        color: 512
                    }
                ]
            },
        };
    } catch (error) {
        // Rollback the transaction in case of error
        await client.queryObject('ROLLBACK');
        
        console.error(error);
        ctx.response.body = {
            text: {
                values: [
                    {
                        text: "Error: " + error.message,
                        color: 16384
                    }
                ]
            },
        };
    }
});

app.use(oakCors());
app.use(router.routes());
app.use(router.allowedMethods());

console.log('Listening on port 7000...');
await app.listen({ port: 7000 });