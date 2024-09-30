-- Open the wireless modem
local modem = peripheral.find("modem") or error("No modem attached", 0)
local monitor = peripheral.find("monitor") or error("No monitor attached", 0)
local speaker = peripheral.find("speaker") or error("No speaker attached", 0)
local dfpwm = require("cc.audio.dfpwm")
modem.open(100)  -- Open channel 100

local json = require("util_json")

-- Set up the monitor
monitor.clear()
monitor.setTextScale(1)
local width, height = monitor.getSize()

-- Function to wrap and print colored text
local function wrapColoredText(segments)
    local x, y = 1, 1
    for _, segment in ipairs(segments) do
        local text, color = segment.text, segment.color
        monitor.setTextColor(color)
        term.setTextColor(color)

        for word in text:gmatch("%S+") do
            local wordLength = #word
            if x + wordLength > width then
                x, y = 1, y + 1
                if y > height then
                    monitor.scroll(1)
                    y = height
                end
            end
            monitor.setCursorPos(x, y)
            monitor.write(word)
            write(word)
            write(" ")
            x = x + wordLength + 1
        end
    end
    monitor.setTextColor(colors.white)
    term.setTextColor(colors.white)
    write("\n")
end

local introductionText = {
    {
        text = "Welcome to", color = colors.white
    },
    { text = "SERA", color = colors.blue },
    { text = "- the Space Exploration Remote Administrator", color = colors.white },
}

wrapColoredText(introductionText)

local forwarded_address = "https://vc93t86v-8000.brs.devtunnels.ms/"
local function callServer(route, method, payload)
    local response
    if method == "POST" then
        response = http.post(forwarded_address .. route, textutils.serializeJSON(payload), {
            ["Content-Type"] = "application/json",
        })
    elseif method == "GET" then
        response = http.get(forwarded_address .. route, {
            ["Content-Type"] = "application/json",
        })
    else
        error("Unsupported method: " .. method)
    end

    if response.getResponseCode() ~= 200 then
        error("Error calling server: " .. response.getResponseCode())
    end

    return json.parse(response.readAll())
end

local function findAudioFile(name)
    local response = http.get(forwarded_address .. 'audio/' .. name, {
        ["Content-Type"] = "audio/dfpwm",
    })
    print("URL: " .. forwarded_address .. name)
    if response.getResponseCode() ~= 200 then
        error("Error findind audio file: " .. response.getResponseCode())
    end
    return response
end

local function playAudio(name)
    local response = findAudioFile(name .. ".dfpwm")
    local decoder = dfpwm.make_decoder()
    
    while true do
        local chunk = response.read(16 * 1024)
        if not chunk then break end
        
        local buffer = decoder(chunk)
        while not speaker.playAudio(buffer) do
            os.pullEvent("speaker_audio_empty")
        end
    end
    
    response.close()
end

local function printTable(t, indent) 
    indent = indent or 0
    for k, v in pairs(t) do
        local formatting = string.rep("  ", indent) .. k .. ": "
        if type(v) == "table" then
            print(formatting)
            printTable(v, indent + 1)
        else
            print(formatting .. tostring(v))
        end
    end
end

local divider = "=x================x="
local function printDivider()
    monitor_color = monitor.getTextColor()
    terminal_color = term.getTextColor()
    -- set the color to colors.gray
    monitor.setTextColor(colors.gray)
    term.setTextColor(colors.gray)
    print(divider)
    -- reset the color to the original
    monitor.setTextColor(monitor_color)
    term.setTextColor(terminal_color)
end
-- Main loop
while true do
    print("Type 'chat' to activate Redstone, or 'exit' to quit.")
    local userInput = read()

    if userInput == "chat" then
        printDivider()
        ::chat_start::
        print("Type your message for SERA: (write 'exit' to quit)")
        printDivider()
        local text = read()
        if text == "exit" then
            break
        end
        printDivider()
        print("Sending message to SERA...")
        local response = callServer("chat", "POST", {
            jsonPayload = {
                message = text
            }
        })
        printDivider()
        wrapColoredText(response.text.values)
        if response.voice then
            if response.voice.fileName then
                playAudio(response.voice.fileName)
            end
        end
        printDivider()
        goto chat_start
    -- elseif userInput == "send" then
    --     modem.transmit(100, 100, "activate")
    --     local coloredText = {
    --         { text = "Message sent:", color = colors.white },
    --         { text = "ACTIVATE", color = colors.red },
    --         { text = "- to channel:", color = colors.white },
    --         { text = "100", color = colors.yellow },
    --     }
    --     monitor.clear()
    --     local response = callServer("health", "GET", nil)
    --     wrapColoredText(response.text.values)
    --     if response.voice then
    --         if response.voice.fileName then
    --             playAudio(response.voice.fileName)
    --         end
    --     else
    --         print("No voice message to play.")
    --         printTable(response)
    --     end
    --     wrapColoredText(coloredText)
    elseif userInput == "exit" then
        print("Exiting program.")
        break
    else
        print("Unknown command. Please type 'send' or 'exit'.")
    end
    
    sleep(1)
end