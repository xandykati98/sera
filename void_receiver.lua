-- Open the wireless modem
modem = peripheral.find("modem") or error("No modem attached", 0)
modem.open(100)  -- Open the same channel (e.g., 100)

-- Wait for a message
while true do
    event, side, channel, replyChannel, message, distance = os.pullEvent("modem_message")

    if message == "activate" then
        print("Redstone signal received, activating...")
        redstone.setOutput("back", true)  -- Send a redstone signal on the back
        sleep(5)  -- Keep it active for 5 seconds
        redstone.setOutput("back", false)  -- Turn off the signal
    end
end