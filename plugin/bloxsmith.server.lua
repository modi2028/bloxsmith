--!strict
-- Bloxsmith Studio plugin — auto-connects to the Bloxsmith web app (one-click
-- approval on the site, no pairing codes), polls the backend for tool calls,
-- executes them in the open place (each call is one undo step), and posts
-- structured results back.
--
-- Install: drop this file into your local plugins folder
-- (Studio -> Plugins tab -> "Plugins Folder"), then restart Studio.
--
-- Contract: docs/tool-contract.md (v1). Local plugins have unrestricted
-- HttpService access, so no game setting or permission prompt is needed.

if not plugin then
	return
end

local HttpService = game:GetService("HttpService")
local ChangeHistoryService = game:GetService("ChangeHistoryService")
local Selection = game:GetService("Selection")

-- The Bloxsmith website URL the plugin talks to.
--   • For the PUBLISHED plugin, set BASE_URL_DEFAULT to your live domain
--     (e.g. "https://bloxsmith.app") before saving/publishing.
--   • For local development, override it without editing this file by running
--     this once in the Studio Command Bar:
--       plugin:SetSetting("BloxsmithBaseUrl", "http://localhost:3000")
--     (set it back with plugin:SetSetting("BloxsmithBaseUrl", nil))
local BASE_URL_DEFAULT = "https://bloxsmith.online"
local BASE_URL = plugin:GetSetting("BloxsmithBaseUrl") or BASE_URL_DEFAULT
local POLL_INTERVAL = 1
local RETRY_INTERVAL = 3
local CONTRACT_VERSION = 1
local TOKEN_SETTING = "BloxsmithToken"

--------------------------------------------------------------------------
-- Ref registry: opaque handles <-> Instances
--------------------------------------------------------------------------

-- Refs are persisted as an attribute ON the instance itself, so they survive
-- Studio restarts, plugin reloads, undo/redo, and place saves. The in-memory
-- maps are just a cache; on a miss we re-discover by attribute scan.
local REF_ATTRIBUTE = "BSRef"

local refToInstance: { [string]: Instance } = {}
local instanceToRef: { [Instance]: string } = {}

local WELL_KNOWN: { [string]: Instance } = {
	["ref:workspace"] = workspace,
	["ref:replicated_storage"] = game:GetService("ReplicatedStorage"),
	["ref:server_script_service"] = game:GetService("ServerScriptService"),
	["ref:server_storage"] = game:GetService("ServerStorage"),
	["ref:starter_gui"] = game:GetService("StarterGui"),
	["ref:starter_player"] = game:GetService("StarterPlayer"),
	["ref:lighting"] = game:GetService("Lighting"),
}

local function mintRef(inst: Instance): string
	local existing = instanceToRef[inst]
	if existing then
		return existing
	end
	-- Reuse the persisted id if this instance was tagged in an earlier
	-- session; otherwise mint a globally unique one and tag it.
	local id = inst:GetAttribute(REF_ATTRIBUTE)
	if typeof(id) ~= "string" or #(id :: string) == 0 then
		id = string.lower(
			string.sub(string.gsub(HttpService:GenerateGUID(false), "-", ""), 1, 8)
		)
		pcall(function()
			inst:SetAttribute(REF_ATTRIBUTE, id)
		end)
	end
	local ref = "ref:i_" .. (id :: string)
	refToInstance[ref] = inst
	instanceToRef[inst] = ref
	return ref
end

local function toolError(code: string, message: string)
	error({ __toolError = true, code = code, message = message }, 0)
end

local function findByRefId(id: string): Instance?
	for _, root in WELL_KNOWN do
		for _, desc in root:GetDescendants() do
			if desc:GetAttribute(REF_ATTRIBUTE) == id then
				return desc
			end
		end
	end
	return nil
end

local function resolveRef(ref: unknown): Instance
	if typeof(ref) ~= "string" then
		toolError("invalid_args", "Expected an instance ref string")
	end
	local refStr = ref :: string
	local inst: Instance? = WELL_KNOWN[refStr] or refToInstance[refStr]

	-- Cache hit on a destroyed instance -> treat as a miss and rescan
	-- (undo/redo can bring back an equivalent instance carrying the same
	-- persisted attribute).
	if inst and not WELL_KNOWN[refStr] and not inst:IsDescendantOf(game) then
		refToInstance[refStr] = nil
		inst = nil
	end

	if not inst then
		-- Accept ref:i_<id> and also a bare ref:<id> in case the id prefix was
		-- dropped, then re-discover by the persisted BSRef attribute.
		local id = string.match(refStr, "^ref:i_(.+)$")
			or string.match(refStr, "^ref:(.+)$")
		if id then
			inst = findByRefId(id)
			if inst then
				refToInstance[refStr] = inst
				instanceToRef[inst] = refStr
			end
		end
	end

	if not inst then
		toolError(
			"not_found",
			refStr
				.. " does not exist (deleted, undone, or from an older session) — re-discover it with list_children from a root like ref:workspace"
		)
	end
	return inst :: Instance
end

--------------------------------------------------------------------------
-- Property value encoding (contract <-> Roblox types)
--------------------------------------------------------------------------

local function decodeValue(v: unknown): unknown
	if typeof(v) == "table" then
		local t = v :: { [string]: any }
		local kind = t["$type"]
		local val = t.value
		if kind == "Vector3" then
			return Vector3.new(val[1], val[2], val[3])
		elseif kind == "Vector2" then
			return Vector2.new(val[1], val[2])
		elseif kind == "Color3" then
			return Color3.new(val[1], val[2], val[3])
		elseif kind == "CFrame" then
			return CFrame.new(table.unpack(val))
		elseif kind == "UDim2" then
			return UDim2.new(val[1], val[2], val[3], val[4])
		elseif kind == "UDim" then
			return UDim.new(val[1], val[2])
		elseif kind == "Enum" then
			local okEnum, enumItem = pcall(function()
				return (Enum :: any)[t.enum][t.item]
			end)
			if not okEnum then
				toolError("invalid_args", "Unknown enum " .. tostring(t.enum) .. "." .. tostring(t.item))
			end
			return enumItem
		elseif kind == "NumberRange" then
			-- {value: n} constant, or {value: [min, max]}
			if typeof(val) == "number" then
				return NumberRange.new(val)
			elseif typeof(val) == "table" and (val :: any)[2] ~= nil then
				return NumberRange.new(val[1], val[2])
			end
			return NumberRange.new(val[1])
		elseif kind == "NumberSequence" then
			-- {value: n} constant, or {value: [[time, value, envelope?], ...]}
			-- (particle Transparency/Size etc.). Times run 0 -> 1.
			if typeof(val) == "number" then
				return NumberSequence.new(val)
			end
			local keypoints = {}
			for _, kp in ipairs(val :: { any }) do
				if (kp :: any)[3] ~= nil then
					table.insert(keypoints, NumberSequenceKeypoint.new(kp[1], kp[2], kp[3]))
				else
					table.insert(keypoints, NumberSequenceKeypoint.new(kp[1], kp[2]))
				end
			end
			return NumberSequence.new(keypoints)
		elseif kind == "ColorSequence" then
			-- {value: [r,g,b]} constant, or {value: [[time, [r,g,b]], ...]}
			-- (particle Color etc.). Times run 0 -> 1, rgb are 0-1 floats.
			if typeof((val :: any)[1]) == "number" then
				return ColorSequence.new(Color3.new(val[1], val[2], val[3]))
			end
			local keypoints = {}
			for _, kp in ipairs(val :: { any }) do
				local c = kp[2]
				table.insert(
					keypoints,
					ColorSequenceKeypoint.new(kp[1], Color3.new(c[1], c[2], c[3]))
				)
			end
			return ColorSequence.new(keypoints)
		elseif kind == "Rect" then
			return Rect.new(val[1], val[2], val[3], val[4])
		elseif kind == "BrickColor" then
			return BrickColor.new(tostring(val))
		end
		toolError("invalid_args", "Unsupported value wrapper: " .. tostring(kind))
	elseif typeof(v) == "string" and string.sub(v :: string, 1, 4) == "ref:" then
		return resolveRef(v)
	end
	return v
end

local function encodeValue(v: unknown): unknown
	local t = typeof(v)
	if t == "Vector3" then
		local vec = v :: Vector3
		return { ["$type"] = "Vector3", value = { vec.X, vec.Y, vec.Z } }
	elseif t == "Vector2" then
		local vec = v :: Vector2
		return { ["$type"] = "Vector2", value = { vec.X, vec.Y } }
	elseif t == "Color3" then
		local c = v :: Color3
		return { ["$type"] = "Color3", value = { c.R, c.G, c.B } }
	elseif t == "CFrame" then
		return { ["$type"] = "CFrame", value = { (v :: CFrame):GetComponents() } }
	elseif t == "UDim2" then
		local u = v :: UDim2
		return { ["$type"] = "UDim2", value = { u.X.Scale, u.X.Offset, u.Y.Scale, u.Y.Offset } }
	elseif t == "UDim" then
		local u = v :: UDim
		return { ["$type"] = "UDim", value = { u.Scale, u.Offset } }
	elseif t == "EnumItem" then
		local e = v :: EnumItem
		return { ["$type"] = "Enum", enum = tostring(e.EnumType), item = e.Name }
	elseif t == "NumberRange" then
		local r = v :: NumberRange
		return { ["$type"] = "NumberRange", value = { r.Min, r.Max } }
	elseif t == "NumberSequence" then
		local kps = {}
		for _, kp in ipairs((v :: NumberSequence).Keypoints) do
			table.insert(kps, { kp.Time, kp.Value, kp.Envelope })
		end
		return { ["$type"] = "NumberSequence", value = kps }
	elseif t == "ColorSequence" then
		local kps = {}
		for _, kp in ipairs((v :: ColorSequence).Keypoints) do
			local c = kp.Value
			table.insert(kps, { kp.Time, { c.R, c.G, c.B } })
		end
		return { ["$type"] = "ColorSequence", value = kps }
	elseif t == "Rect" then
		local r = v :: Rect
		return { ["$type"] = "Rect", value = { r.Min.X, r.Min.Y, r.Max.X, r.Max.Y } }
	elseif t == "BrickColor" then
		return { ["$type"] = "BrickColor", value = (v :: BrickColor).Name }
	elseif t == "Instance" then
		return mintRef(v :: Instance)
	elseif t == "number" or t == "string" or t == "boolean" or t == "nil" then
		return v
	end
	return tostring(v)
end

--------------------------------------------------------------------------
-- Tool executors
--------------------------------------------------------------------------

local DEFAULT_PROPS: { [string]: { string } } = {
	BasePart = { "Position", "Size", "Color", "Material", "Anchored", "CanCollide", "Transparency" },
	Model = { "PrimaryPart" },
	Light = { "Color", "Brightness", "Range", "Enabled" },
}

local function readProperty(inst: Instance, name: string): (boolean, unknown)
	return pcall(function()
		return (inst :: any)[name]
	end)
end

-- Models sometimes send "0, 90, 0" as a plain string instead of the $type
-- wrapper. Parse number-lists out of such strings so the assignment can be
-- retried as the right rich type.
local function numbersFromString(s: string): { number }?
	local nums = {}
	for token in string.gmatch(s, "%-?%d+%.?%d*") do
		local n = tonumber(token)
		if n == nil then
			return nil
		end
		table.insert(nums, n)
	end
	if #nums == 0 then
		return nil
	end
	return nums
end

local function setProperty(inst: Instance, name: string, rawValue: unknown)
	local value = decodeValue(rawValue)
	local ok, err = pcall(function()
		(inst :: any)[name] = value
	end)
	if ok then
		return
	end

	-- Coercion rescue for number-like strings: try the plausible rich types.
	if typeof(rawValue) == "string" then
		local nums = numbersFromString(rawValue :: string)
		if nums then
			local candidates: { unknown } = {}
			if #nums == 3 then
				table.insert(candidates, Vector3.new(nums[1], nums[2], nums[3]))
				table.insert(candidates, Color3.new(nums[1], nums[2], nums[3]))
			elseif #nums == 12 then
				table.insert(candidates, CFrame.new(table.unpack(nums)))
			elseif #nums == 4 then
				table.insert(candidates, UDim2.new(nums[1], nums[2], nums[3], nums[4]))
			elseif #nums == 2 then
				table.insert(candidates, Vector2.new(nums[1], nums[2]))
				table.insert(candidates, UDim.new(nums[1], nums[2]))
			end
			for _, candidate in candidates do
				local okRetry = pcall(function()
					(inst :: any)[name] = candidate
				end)
				if okRetry then
					return
				end
			end
		end
	end

	toolError(
		"invalid_args",
		"Could not set " .. name .. ": " .. tostring(err)
			.. '. Use the wrapper format, e.g. {"$type":"Vector3","value":[x,y,z]} or {"$type":"CFrame","value":[12 numbers]}.'
	)
end

local handlers: { [string]: (args: { [string]: any }) -> unknown } = {}

handlers.get_selection = function(_args)
	local items = {}
	for _, inst in Selection:Get() do
		table.insert(items, { ref = mintRef(inst), className = inst.ClassName, name = inst.Name })
	end
	return { items = items }
end

handlers.list_children = function(args)
	local parent = resolveRef(args.parent)
	local depth = tonumber(args.depth) or 1
	local items = {}
	local function walk(inst: Instance, level: number, parentRef: string?)
		for _, child in inst:GetChildren() do
			local entry: { [string]: any } = {
				ref = mintRef(child),
				className = child.ClassName,
				name = child.Name,
				childCount = #child:GetChildren(),
			}
			if parentRef then
				entry.parent = parentRef
			end
			table.insert(items, entry)
			if level < depth and #items < 200 then
				walk(child, level + 1, entry.ref)
			end
		end
	end
	walk(parent, 1, nil)
	return { items = items }
end

handlers.get_properties = function(args)
	local inst = resolveRef(args.target)
	local names: { string } = args.names
	if not names then
		names = {}
		if inst:IsA("BasePart") then
			for _, n in DEFAULT_PROPS.BasePart do
				table.insert(names, n)
			end
		elseif inst:IsA("Light") then
			for _, n in DEFAULT_PROPS.Light do
				table.insert(names, n)
			end
		elseif inst:IsA("LuaSourceContainer") then
			table.insert(names, "Source")
		end
	end
	local properties: { [string]: unknown } = {
		Name = inst.Name,
		ClassName = inst.ClassName,
	}
	for _, name in names do
		local ok, value = readProperty(inst, name)
		if ok then
			properties[name] = encodeValue(value)
		end
	end
	return { properties = properties }
end

handlers.create_instance = function(args)
	local okNew, inst = pcall(Instance.new, args.className)
	if not okNew then
		toolError("forbidden_class", "Cannot create instances of class " .. tostring(args.className))
	end
	local instance = inst :: Instance
	if args.name then
		instance.Name = args.name
	end
	if typeof(args.properties) == "table" then
		for name, rawValue in args.properties :: { [string]: unknown } do
			setProperty(instance, name, rawValue)
		end
	end
	instance.Parent = resolveRef(args.parent)
	return { ref = mintRef(instance) }
end

handlers.set_property = function(args)
	local inst = resolveRef(args.target)
	setProperty(inst, args.name, args.value)
	return {}
end

-- Writing to Script.Source requires the user to grant this plugin "Script
-- Injection" permission (marketplace plugins only). Surface a clear, actionable
-- error if it's denied instead of a raw Roblox message.
local function writeScriptSource(scriptInst: Instance, source: string)
	local ok, err = pcall(function()
		(scriptInst :: any).Source = source
	end)
	if not ok then
		toolError(
			"script_error",
			"Bloxsmith needs permission to edit scripts. In Roblox Studio, allow the "
				.. "'Script Injection' / 'edit scripts' prompt for Bloxsmith (a blue banner or "
				.. "notification), then try again. You can also enable it under Plugins → Manage "
				.. "Plugins → Bloxsmith. (" .. tostring(err) .. ")"
		)
	end
end

handlers.write_script = function(args)
	local source = args.source :: string
	local lineCount = 1
	for _ in string.gmatch(source, "\n") do
		lineCount += 1
	end

	if args.target then
		local inst = resolveRef(args.target)
		if not inst:IsA("LuaSourceContainer") then
			toolError("invalid_args", "Target is not a script")
		end
		writeScriptSource(inst, source)
		return { ref = mintRef(inst), lineCount = lineCount }
	end

	local okNew, created = pcall(Instance.new, args.scriptType)
	if not okNew then
		toolError("invalid_args", "Unknown script type " .. tostring(args.scriptType))
	end
	local script = created :: Instance
	script.Name = args.name
	script.Parent = resolveRef(args.parent)
	writeScriptSource(script, source)
	return { ref = mintRef(script), lineCount = lineCount }
end

handlers.delete_instance = function(args)
	local inst = resolveRef(args.target)
	if WELL_KNOWN[args.target] then
		toolError("invalid_args", "Refusing to delete a service root")
	end
	inst:Destroy()
	return {}
end

-- Insert a free Creator Store model (Pro feature — the backend only offers
-- this tool to Pro users). LoadAsset returns a wrapper Model; unwrap single
-- children so the inserted thing is addressed directly.
handlers.insert_asset = function(args)
	local assetId = tonumber(args.assetId)
	if not assetId then
		toolError("invalid_args", "assetId must be a number")
	end
	local parent = args.parent and resolveRef(args.parent) or workspace

	local okLoad, container = pcall(function()
		return game:GetService("InsertService"):LoadAsset(assetId :: number)
	end)
	if not okLoad then
		-- LoadAsset refuses some Creator Store models even when the listing
		-- says free (fiat/sandboxed assets). GetObjects loads by content id
		-- and often succeeds where LoadAsset is denied — try it before failing.
		local okObjs, objs = pcall(function()
			return game:GetObjects("rbxassetid://" .. tostring(assetId))
		end)
		if okObjs and typeof(objs) == "table" and #objs > 0 then
			local holder = Instance.new("Model")
			for _, obj in ipairs(objs) do
				(obj :: Instance).Parent = holder
			end
			container = holder
		else
			toolError(
				"invalid_args",
				"Could not insert asset " .. tostring(assetId) .. ": " .. tostring(container)
					.. " (only free or owned Creator Store models can be inserted)"
			)
		end
	end

	local wrapper = container :: Instance
	local children = wrapper:GetChildren()
	local inserted: Instance
	if #children == 1 then
		inserted = children[1]
		inserted.Parent = parent
		wrapper:Destroy()
	else
		wrapper.Name = args.name or ("Asset_" .. tostring(assetId))
		wrapper.Parent = parent
		inserted = wrapper
	end
	if typeof(args.name) == "string" and #args.name > 0 then
		inserted.Name = args.name
	end

	if args.position ~= nil then
		local pos = decodeValue(args.position)
		if typeof(pos) == "Vector3" then
			if inserted:IsA("Model") then
				inserted:PivotTo(CFrame.new(pos :: Vector3))
			elseif inserted:IsA("BasePart") then
				(inserted :: BasePart).Position = pos :: Vector3
			end
		end
	end

	return {
		ref = mintRef(inserted),
		className = inserted.ClassName,
		name = inserted.Name,
	}
end

-- NOTE: an arbitrary-Luau execution tool (loadstring) was intentionally
-- removed. Executing remotely-fetched code is a plugin-policy violation
-- ("Misusing Roblox Systems") and indistinguishable from a backdoor. All
-- building is done through the structured tools above.

local MUTATING: { [string]: boolean } = {
	create_instance = true,
	set_property = true,
	write_script = true,
	delete_instance = true,
	insert_asset = true,
}

local function executeCall(call: { [string]: any }): { [string]: any }
	local started = os.clock()
	local handler = handlers[call.tool]

	local function finish(ok: boolean, payload: any): { [string]: any }
		local durationMs = math.floor((os.clock() - started) * 1000)
		if ok then
			return { v = CONTRACT_VERSION, id = call.id, ok = true, value = payload, durationMs = durationMs }
		end
		local code, message = "internal", tostring(payload)
		if typeof(payload) == "table" and payload.__toolError then
			code = payload.code
			message = payload.message
		end
		return {
			v = CONTRACT_VERSION,
			id = call.id,
			ok = false,
			error = { code = code, message = message },
			durationMs = durationMs,
		}
	end

	if call.v ~= CONTRACT_VERSION then
		return finish(false, { __toolError = true, code = "unsupported_version", message = "Plugin update required" })
	end
	if not handler then
		return finish(false, { __toolError = true, code = "internal", message = "Unknown tool " .. tostring(call.tool) })
	end

	local recording: string? = nil
	if MUTATING[call.tool] then
		recording = ChangeHistoryService:TryBeginRecording("Bloxsmith: " .. call.tool)
	end

	local ok, payload = pcall(handler, call.args or {})

	if recording then
		ChangeHistoryService:FinishRecording(
			recording,
			ok and Enum.FinishRecordingOperation.Commit or Enum.FinishRecordingOperation.Cancel
		)
	end

	return finish(ok, payload)
end

--------------------------------------------------------------------------
-- HTTP
--------------------------------------------------------------------------

local function request(method: string, path: string, body: any, token: string?): (any, string?)
	local headers: { [string]: string } = { ["Content-Type"] = "application/json" }
	if token then
		headers.Authorization = "Bearer " .. token
	end
	local ok, res = pcall(function()
		return HttpService:RequestAsync({
			Url = BASE_URL .. path,
			Method = method,
			Headers = headers,
			Body = body and HttpService:JSONEncode(body) or nil,
		})
	end)
	if not ok then
		return nil, tostring(res)
	end
	local response = res :: { Success: boolean, StatusCode: number, Body: string }
	local okDecode, decoded = pcall(function()
		return HttpService:JSONDecode(response.Body)
	end)
	if not response.Success then
		local detail = okDecode and typeof(decoded) == "table" and decoded.error or nil
		return nil, "HTTP " .. response.StatusCode .. (detail and (": " .. tostring(detail)) or "")
	end
	return okDecode and decoded or {}, nil
end

--------------------------------------------------------------------------
-- Dock UI
--------------------------------------------------------------------------

local COLOR_BG = Color3.fromRGB(12, 10, 9)
local COLOR_MUTED = Color3.fromRGB(168, 162, 158)
local COLOR_EMBER = Color3.fromRGB(245, 158, 11)
local COLOR_GREEN = Color3.fromRGB(52, 211, 153)
local COLOR_RED = Color3.fromRGB(248, 113, 113)

local toolbar = plugin:CreateToolbar("Bloxsmith")
local toggleButton = toolbar:CreateButton("Bloxsmith", "Open the Bloxsmith panel", "rbxassetid://71727317891946")

local widget = plugin:CreateDockWidgetPluginGui(
	"BloxsmithDock",
	DockWidgetPluginGuiInfo.new(Enum.InitialDockState.Right, false, false, 300, 240, 260, 200)
)
widget.Title = "Bloxsmith"

local root = Instance.new("Frame")
root.Size = UDim2.new(1, 0, 1, 0)
root.BackgroundColor3 = COLOR_BG
root.BorderSizePixel = 0
root.Parent = widget

local layout = Instance.new("UIListLayout")
layout.Padding = UDim.new(0, 8)
layout.SortOrder = Enum.SortOrder.LayoutOrder
layout.Parent = root

local padding = Instance.new("UIPadding")
padding.PaddingTop = UDim.new(0, 12)
padding.PaddingBottom = UDim.new(0, 12)
padding.PaddingLeft = UDim.new(0, 12)
padding.PaddingRight = UDim.new(0, 12)
padding.Parent = root

local function makeLabel(text: string, order: number, color: Color3, size: number): TextLabel
	local label = Instance.new("TextLabel")
	label.Size = UDim2.new(1, 0, 0, size)
	label.BackgroundTransparency = 1
	label.Font = Enum.Font.Gotham
	label.TextSize = 13
	label.TextColor3 = color
	label.TextXAlignment = Enum.TextXAlignment.Left
	label.TextWrapped = true
	label.Text = text
	label.LayoutOrder = order
	label.Parent = root
	return label
end

local titleLabel = makeLabel("Bloxsmith", 1, COLOR_EMBER, 20)
titleLabel.Font = Enum.Font.GothamBold
titleLabel.TextSize = 16

local statusLabel = makeLabel("Not connected", 2, COLOR_MUTED, 18)

local actionButton = Instance.new("TextButton")
actionButton.Size = UDim2.new(1, 0, 0, 32)
actionButton.BackgroundColor3 = COLOR_EMBER
actionButton.BorderSizePixel = 0
actionButton.Font = Enum.Font.GothamBold
actionButton.TextSize = 14
actionButton.TextColor3 = COLOR_BG
actionButton.Text = "Connect"
actionButton.LayoutOrder = 4
actionButton.Parent = root

local hintLabel = makeLabel(
	"No codes needed — approve the connection popup at " .. BASE_URL,
	5,
	COLOR_MUTED,
	30
)
hintLabel.TextSize = 12

local lastActionLabel = makeLabel("", 6, COLOR_MUTED, 34)
lastActionLabel.TextSize = 12

toggleButton.Click:Connect(function()
	widget.Enabled = not widget.Enabled
end)

--------------------------------------------------------------------------
-- Connection state machine
--------------------------------------------------------------------------

local token: string? = nil
local storedToken = plugin:GetSetting(TOKEN_SETTING)
if typeof(storedToken) == "string" and #storedToken > 0 then
	token = storedToken
end

local generation = 0

local function setDisconnectedUi(message: string?)
	statusLabel.Text = message or "Not connected"
	statusLabel.TextColor3 = COLOR_MUTED
	hintLabel.Visible = true
	actionButton.Text = "Connect"
end

local function setWaitingUi()
	statusLabel.Text = "● Waiting for approval — open " .. BASE_URL
	statusLabel.TextColor3 = COLOR_EMBER
	hintLabel.Visible = true
	actionButton.Text = "Cancel"
end

local function setConnectedUi(username: string?)
	statusLabel.Text = "● Connected" .. (username and (" as @" .. username) or "")
	statusLabel.TextColor3 = COLOR_GREEN
	hintLabel.Visible = false
	actionButton.Text = "Disconnect"
end

local function startPolling(username: string?)
	generation += 1
	local myGeneration = generation
	setConnectedUi(username)

	task.spawn(function()
		while myGeneration == generation and token do
			local data, err = request("GET", "/api/plugin/poll", nil, token)
			if myGeneration ~= generation then
				return
			end

			if err then
				if string.find(err, "HTTP 401") then
					token = nil
					plugin:SetSetting(TOKEN_SETTING, "")
					setDisconnectedUi("Disconnected — press Connect")
					return
				end
				statusLabel.Text = "● Reconnecting… (" .. err .. ")"
				statusLabel.TextColor3 = COLOR_RED
				task.wait(RETRY_INTERVAL)
				continue
			end

			setConnectedUi(username)

			local calls = data and data.calls
			if typeof(calls) == "table" and #calls > 0 then
				local results = {}
				for _, call in calls :: { any } do
					local envelope = executeCall(call)
					table.insert(results, envelope)
					local okText = envelope.ok and "✓" or "✕"
					lastActionLabel.Text = "Last: " .. okText .. " " .. tostring(call.tool)
				end
				local _, postErr = request("POST", "/api/plugin/results", { results = results }, token)
				if postErr then
					lastActionLabel.Text = "Failed to post results: " .. postErr
				end
			end

			task.wait(POLL_INTERVAL)
		end
	end)
end

-- Auto-connect: identify the Roblox account logged into Studio, open a
-- connect request, and wait for the user's one-click approval on the website.
-- No pairing codes — the request secret stays in this Studio instance, so the
-- approval can only ever connect THIS Studio.
local function autoConnect()
	generation += 1
	local myGeneration = generation

	local okUid, uid = pcall(function()
		return game:GetService("StudioService"):GetUserId()
	end)
	if not okUid or typeof(uid) ~= "number" or (uid :: number) <= 0 then
		setDisconnectedUi("Couldn't identify your Studio account — sign into Studio, then press Connect")
		return
	end

	setWaitingUi()
	local placeName = game.Name
	local start, err = request("POST", "/api/plugin/connect", {
		robloxUserId = uid,
		placeName = placeName,
	})
	if myGeneration ~= generation then
		return
	end
	if err or not (start and start.requestId and start.secret) then
		if err and string.find(err, "no_account") then
			setDisconnectedUi("Sign in at " .. BASE_URL .. " with this Roblox account first, then press Connect")
		else
			setDisconnectedUi("Couldn't reach Bloxsmith (" .. (err or "unknown error") .. ") — press Connect to retry")
		end
		return
	end

	local interval = tonumber(start.pollIntervalSec) or 3
	task.spawn(function()
		while myGeneration == generation do
			task.wait(interval)
			if myGeneration ~= generation then
				return
			end
			local data, pollErr = request("POST", "/api/plugin/connect/poll", {
				requestId = start.requestId,
				secret = start.secret,
			})
			if myGeneration ~= generation then
				return
			end
			if pollErr then
				statusLabel.Text = "● Retrying… (" .. pollErr .. ")"
				statusLabel.TextColor3 = COLOR_RED
				continue
			end
			local status = data and data.status
			if status == "approved" and data.token then
				token = data.token
				plugin:SetSetting(TOKEN_SETTING, token)
				startPolling(data.username)
				return
			elseif status == "denied" then
				setDisconnectedUi("Connection declined on the website — press Connect to retry")
				return
			elseif status == "expired" or status == "consumed" then
				setDisconnectedUi("Request expired — press Connect to retry")
				return
			end
			setWaitingUi()
		end
	end)
end

actionButton.MouseButton1Click:Connect(function()
	if token then
		-- Disconnect
		generation += 1
		token = nil
		plugin:SetSetting(TOKEN_SETTING, "")
		lastActionLabel.Text = ""
		setDisconnectedUi()
	elseif actionButton.Text == "Cancel" then
		-- Abandon the pending connect request.
		generation += 1
		setDisconnectedUi()
	else
		autoConnect()
	end
end)

plugin.Unloading:Connect(function()
	generation += 1
end)

if token then
	startPolling(nil)
else
	-- First run: pop the panel open and start the handshake right away — the
	-- user only has to press Connect on the website.
	widget.Enabled = true
	autoConnect()
end
