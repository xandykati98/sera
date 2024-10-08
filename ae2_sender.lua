local me = peripheral.find("meBridge")

local function getItemsTable()
    local items_table, err = me.listItems()
    if err then
        print("Error fetching items:", err)
        return nil
    end
    return items_table
end

local function serializeItemsToJson(items_table)
    local to_json = {
        items = items_table
    }
    return textutils.serializeJSON(to_json, { allow_repetitions = true })
end

local function saveJsonToFile(json_data, filename)
    local file = fs.open(filename, "w")
    file.write(json_data)
    file.close()
end

-- New functions for HTTP communication
local base_url = "https://vc93t86v-7000.brs.devtunnels.ms/"

local function callServer(route, method, payload)
    local url = base_url .. route
    local response
    
    if method == "POST" then
        response = http.post(url, textutils.serializeJSON(payload), {
            ["Content-Type"] = "application/json",
        })
    elseif method == "GET" then
        response = http.get(url, {
            ["Content-Type"] = "application/json",
        })
    else
        error("Unsupported method: " .. method)
    end

    if not response then
        error("No response from server")
    end

    if response.getResponseCode() ~= 200 then
        error("Error calling server: " .. response.getResponseCode())
    end

    return textutils.unserializeJSON(response.readAll())
end

local function sendItemsToServer()
    local items_table = getItemsTable()
    if not items_table then
        return
    end

    local json_data = serializeItemsToJson(items_table)
    saveJsonToFile(json_data, "items.json")

    local response = callServer("receive", "POST", {
        jsonPayload = {
            items = json_data
        }
    })

    print("Server response:", textutils.serializeJSON(response))
end

-- Main execution
local items_table = getItemsTable()
if items_table then
    local json_data = serializeItemsToJson(items_table)
    saveJsonToFile(json_data, "items.json")
    sendItemsToServer()
else
    print("Failed to get items table")
end
