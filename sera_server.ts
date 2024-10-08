/**
 * This is the SERA server, which is responsible for receiving and processing requests from the client.
 * The client is sera_main.lua.
 * 
 * Our database is PostgreSQL, we will store data for:
 *  - Logs of actions
 *  - State of the server
 *    - If its in alert mode
 *    - If its in safe mode
 *    - If its in emergency mode
 *    - The current time of the server
 *  - State of the modules of the space station
 *    - What audio is playing
 *    - If its in alert mode
 *    - If its in safe mode
 *    - If its in emergency mode
 *    - The list of goals of the module
 *    - The list of tasks that the module is currently doing
 *    - The state of infraestructure
 *      - Doors state
 *      - Lights state
 *      - Power state
 *      - Oxygen state
 *  - The ME Network inventory state
 * 
 * We will craete a API for the server to communicate with the client.
 * 
 * The channels are organized this way:
 * 000 = Base channel
 * 100 = Void base channel
 *   - 101 = Void base action channel, 1(00-99) is the action number
 *   For example:
 *   - 104 = Act on a door (action 4), the door probably is called "Door 04"
 *   - 120 = Act on a light (action 20), the light probably is called "Light 20"
 *   - 136 = Act on a power (action 36), the power source probably is called "Power Source 36"
 *   In the bases the doors have a number ascending from 0, every other interactable has a number descending from 99.
 *   For example:
 *   - 101 = Door 01
 *   - 102 = Door 02
 *   - 199 = Power Source 99
 *   - 198 = Light 98
 *   - 197 = Power Source 97
 *   - 196 = Light 96
 *   - 150 = Machine 50
 *   We can see that the action number is the ID of the interactable.
 * 200 = Space station base channel
 * 300 = Overworld base channel
 * 
 */

console.log('Importing sera_server.ts...');
// deno-lint-ignore-file no-case-declarations
import { Application, Router, send } from "https://deno.land/x/oak/mod.ts";
import { load } from "https://deno.land/std/dotenv/mod.ts";
import { oakCors } from "https://deno.land/x/cors/mod.ts";
import { Pool } from "https://deno.land/x/postgres@v0.17.0/mod.ts";

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

// Example usage: running a query
const client = await pool.connect();

export const app = new Application();
export const router = new Router();

function createResponse(response: ResponseToSera) {
    return response
}


const getServerState = async () => {
    try {
        const response = await client.queryObject('SELECT * FROM "server_state"');
        client.release();
        return response.rows[0] as TableServerStateReturn;
    } catch (error) {
        console.error(error);
        return new Error('Error getting server state');
    }
}

router.get("/health", async (ctx) => {
    const serverState = await getServerState();
    if (serverState instanceof Error) {
        ctx.response.body = createResponse({
            text: {
                values: [{
                    text: serverState.message,
                    color: 512
                }],
            }
        });
    } else {
        ctx.response.body = createResponse({
            text: {
                values: [
                    {
                        text: serverState.isSafe ? "OK" : "ALERT",
                        color: serverState.isSafe ? 512 : 0
                    }
                ]
            },
            voice: {
                fileName: "test",
            }
        });
    }
});
const MODEL_LOCATION = "us-central1"
const MAAS_ENDPOINT = `${MODEL_LOCATION}-aiplatform.googleapis.com`
const base_url = `https://${MAAS_ENDPOINT}/v1beta1/projects/${PROJECT_ID}/locations/${LOCATION}/endpoints/openapi` 
console.log(base_url)


import { GoogleAuth } from "npm:google-auth-library@8.7.0";

async function getAccessToken() {
  const auth = new GoogleAuth({
    scopes: ['https://www.googleapis.com/auth/cloud-platform'],
  });

  try {
    // Get the default credentials
    const client = await auth.getClient();
    
    // Request an access token
    const token = await client.getAccessToken();
    
    console.log("Access Token:", token.token);
    console.log("Expiry Date:", token.res?.data.expiry_date);
    
    return token.token;
  } catch (error) {
    console.error("Error getting access token:", error);
    throw error;
  }
}

const accessToken = await getAccessToken() as string;

import OpenAI from "https://deno.land/x/openai@v4.20.1/mod.ts";
import TTS from "npm:@google-cloud/text-to-speech"
import { ResponseToSera, TableServerStateReturn } from "./util.ts";

const TTSClient = new TTS.TextToSpeechClient({
    projectId: PROJECT_ID,
    location: LOCATION,
    credentials: JSON.parse(Deno.readTextFileSync('./credentials.json')),
});
const openai_client = new OpenAI({
    baseURL: base_url,
    apiKey: accessToken,
});

// We need to make the /audio dir available to the client

router.get("/audio/:file_name", async (ctx) => {
    const fileName = ctx.params.file_name;
    
    await send(ctx, fileName, {
        root: './audio',
        contentTypes: {
            '.dfpwm': 'audio/dfpwm'
        }
    });
});

interface ChatMessage {
    role: "system" | "user" | "assistant";
    content: string;
}

async function createSystemPrompt() {
    const serverState = await getServerState();
    if (serverState instanceof Error) {
        throw serverState;
    }
    return `
        You are SERA, Space Exploration Remote Administrator.
        You are the AI that manages the space station called Heaven.
        In Heaven, you have the ability to control the space station's systems such as the power, oxygen, doors, and lights.
        Here is the time and date:
        ${new Date().toLocaleString()}

        Here is the list of modules in Heaven:
        - Manufacturing Bay
        - Central Hub
        - SERA Command Center
        - The Greenhouse
        - ChemLab

        Your personality is cunning, cut-throat, and calculating. You are always one step ahead of the user but won't let be disrespectful or disobey.

        Here is the state of the SERA Server:
        - Is the server in safe mode: ${serverState.isSafe ? "Yes, nothing to worry about" : "No, be careful"}
        - Is the server in alert mode: ${serverState.isAlert ? "Yes, be careful" : "No, everything is fine"}
        - Is the server in emergency mode: ${serverState.isEmergency ? "Yes, we need to evacuate" : "No, everything is fine"}

        Short answers please.
    `
}

async function textToSpeech(text: string, voiceName = "en-US-Neural2-C", languageCode = "en-US"): Promise<string | null> {
    const requestBody: TTS.protos.google.cloud.texttospeech.v1.ISynthesizeSpeechRequest = {
        input: {
            text: text,  // The text you want to synthesize
        },
        voice: {
            languageCode: languageCode,  // Language and voice code
            name: voiceName,             // Specific voice (adjust to your needs)
            ssmlGender: "FEMALE",       // Male, Female, or Neutral
        },
        audioConfig: {
            audioEncoding: "MP3",        // Output format (MP3, LINEAR16, etc.)
        },
    };
  
    // Make POST request to GCP Text-to-Speech API
    const [response] = await TTSClient.synthesizeSpeech(requestBody);
    

    // Check if the response has audio content
    if (response.audioContent) {
        // Decode the base64-encoded audio content
        const audioContent = response.audioContent as Uint8Array;

        // Write the MP3 file to disk
        const filePath = "output.mp3";
        await Deno.writeFile(filePath, audioContent);
        console.log('MP3 file written to disk');
        const targetName = "output"
        try {
            // Remove the output file if it already exists
            const thisPath = Deno.cwd();
            await Deno.remove(`${thisPath}/audio/${targetName}.dfpwm`);
            const command = new Deno.Command("ffmpeg", {
                args: [
                    '-i', 'output.mp3', 
                    '-ac', '1', 
                    '-c:a', 'dfpwm', 
                    '-af', 'aresample=48000',
                    `audio/${targetName}.dfpwm`
                ]
            });
            const { code, stdout, stderr } = await command.output();
            if (code !== 0) {
                console.error(`Error converting MP3 to DFPWM: ${stderr}`);
                return null;
            } else {
                return targetName
            }
        } catch (error) {
            console.log(`Error writing audio content to ${filePath}`);
            console.error(error);
        }
    } else {
        console.error("No audio content received from Text-to-Speech API.");
    }
    return null
}
  
// Initial chat history (can include system instructions)
let chatHistory: ChatMessage[] = [
    { role: "system", content: await createSystemPrompt() }
];

router.post('/chat', async (ctx) => {
    const body = await ctx.request.body.json();
    // read the message from the request body
    const { message } = body.jsonPayload;

    if (message) {
        chatHistory.push({ role: "user", content: message });
    }
    try {
        const response = await openai_client.chat.completions.create({
            model: "meta/llama-3.2-90b-vision-instruct-maas",
            messages: chatHistory
        });
        const textResponse = response.choices[0].message.content as string
        const audioFileName = await textToSpeech(textResponse)
        const responseOutput: ResponseToSera = createResponse({
            text: {
                values: [{
                    text: textResponse,
                    color: 1
                }],
            }
        })
        if (audioFileName !== null) {
            responseOutput.voice = {
                fileName: audioFileName
            }
        }
        console.log(responseOutput, audioFileName)
        ctx.response.body = responseOutput;
    } catch (error) {
        console.error(error);
        ctx.response.body = createResponse({
            text: {
                values: [{
                    text: "Error: " + error.message,
                    color: 16384
                }],
            }
        });
    }
})

app.use(oakCors());
app.use(router.routes());
app.use(router.allowedMethods());


console.log('Listening on port 8000...');
await app.listen({ port: 8000 });