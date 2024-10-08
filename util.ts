export type TableServerStateReturn = {
    isAlert: boolean;
    isSafe: boolean;
    isEmergency: boolean;
    time: Date;
}
export type TableItemsReturn = {
    amount: number;
    displayName: string;
    fingerprint: number;
    isCraftable: boolean;
    name: string;
    nbt: any | string | object;
    scan_date: Date;
    tags: string[];
}

export type ResponseToSera = {
    // If the response will play a voice message from SERA to the user
    voice?: {
        fileName: string;
    };
    text?: {
        values: {
            text: string;
            color: number;
        }[];
    }
    jsonPayload?: {
        [key: string]: any;
    };
    redirect?: {
        // The modem channel to redirect this message response to
        // The computer hooked to this channel will receive the message and can play the voice or text or do some action
        channel: number;
    }
}

export type RequestFromSera = {
    originComputerId: string;
    originComputerChannel: number;
    requestId: string;
    userId?: string;
    jsonPayload?: {
        [key: string]: any;
    };
}
