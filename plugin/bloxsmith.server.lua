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
local AssetService = game:GetService("AssetService")
local Selection = game:GetService("Selection")
local UserInputService = game:GetService("UserInputService")
local CoreGui = game:GetService("CoreGui")

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

	-- The advice has to match the failure. Telling a model to "use the wrapper
	-- format" when the property does not exist on the class sends it round the
	-- loop trying different wrappers forever — which is exactly what happened
	-- when it put ParticleEmitter properties (Rate, LightEmission, Texture) on
	-- a PointLight and retried each one.
	local message = tostring(err)
	if string.find(message, "not a valid member", 1, true) then
		toolError(
			"invalid_args",
			"Could not set "
				.. name
				.. ": "
				.. message
				.. ". Do NOT retry this — "
				.. name
				.. " does not exist on a "
				.. inst.ClassName
				.. ", so no value will work. You are on the wrong instance: create the class that actually has this property "
				.. "(Rate/Lifetime/Texture/LightEmission belong to ParticleEmitter, not PointLight) and set it there."
		)
	end

	toolError(
		"invalid_args",
		"Could not set " .. name .. ": " .. message
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

-- Build a whole model in one call.
--
-- This exists because building a model through repeated create_instance calls
-- costs one network round-trip per part, and a model that reads as a real
-- object is 30-80 parts. The agent ran out of budget long before the shape was
-- finished, which is why builds came out blocky. Here the whole hierarchy
-- arrives at once, and because executeCall wraps a mutating tool in a single
-- ChangeHistoryService recording, the user's undo removes the model as one
-- thing rather than eighty.
--
-- Part positions are model-relative and rotations are degrees; the CFrame is
-- assembled here rather than by the model, which is the other half of why
-- hand-built geometry used to drift out of alignment.

local MATERIAL_FALLBACK = Enum.Material.Plastic

local function applyModelPart(spec: { [string]: any }, origin: Vector3, model: Model): BasePart
	local className = spec.className or "Part"
	local okNew, made = pcall(Instance.new, className)
	if not okNew or not (made :: any):IsA("BasePart") then
		toolError("invalid_args", "Part '" .. tostring(spec.name) .. "' has an unusable className: " .. tostring(className))
	end
	local part = made :: BasePart
	part.Name = tostring(spec.name)

	local sz = spec.size
	part.Size = Vector3.new(sz[1], sz[2], sz[3])

	local pos = spec.position
	local cf = CFrame.new(origin + Vector3.new(pos[1], pos[2], pos[3]))
	local rot = spec.rotation
	if typeof(rot) == "table" then
		cf = cf * CFrame.fromOrientation(math.rad(rot[1]), math.rad(rot[2]), math.rad(rot[3]))
	end
	part.CFrame = cf

	-- Anchored by default: an un-anchored build collapses the instant the user
	-- presses play, which reads as the AI having made something broken.
	part.Anchored = if spec.anchored == nil then true else spec.anchored == true

	if typeof(spec.color) == "table" then
		local c = spec.color
		part.Color = Color3.new(c[1], c[2], c[3])
	end
	if typeof(spec.transparency) == "number" then
		part.Transparency = spec.transparency
	end
	if typeof(spec.material) == "string" then
		-- An unknown material name is not worth failing a whole model over.
		local okMat, mat = pcall(function()
			return (Enum.Material :: any)[spec.material]
		end)
		part.Material = if okMat and mat then mat else MATERIAL_FALLBACK
	end
	if typeof(spec.shape) == "string" and part:IsA("Part") then
		local okShape, shape = pcall(function()
			return (Enum.PartType :: any)[spec.shape]
		end)
		if okShape and shape then
			(part :: Part).Shape = shape
		end
	end

	if typeof(spec.properties) == "table" then
		for name, rawValue in spec.properties :: { [string]: unknown } do
			setProperty(part, name, rawValue)
		end
	end

	part.Parent = model
	return part
end

handlers.build_model = function(args)
	local parent = resolveRef(args.parent)
	local specs = args.parts
	if typeof(specs) ~= "table" or #specs == 0 then
		toolError("invalid_args", "build_model needs at least one part")
	end

	local o = args.origin
	local origin = if typeof(o) == "table" then Vector3.new(o[1], o[2], o[3]) else Vector3.zero

	local model = Instance.new("Model")
	model.Name = tostring(args.name)

	-- Built by name so csg can address parts the model has not seen a ref for.
	local byName: { [string]: BasePart } = {}
	for _, spec in specs :: { { [string]: any } } do
		local part = applyModelPart(spec, origin, model)
		byName[part.Name] = part
	end

	-- Parent before CSG: UnionAsync and SubtractAsync need the parts to be in
	-- the DataModel, and they yield.
	model.Parent = parent

	local unions = 0
	local csgFailures: { string } = {}
	if typeof(args.csg) == "table" then
		for _, step in args.csg :: { { [string]: any } } do
			local names = step.parts
			if typeof(names) ~= "table" or #names == 0 then
				continue
			end

			local others: { BasePart } = {}
			for _, n in names :: { string } do
				local p = byName[tostring(n)]
				-- Silently skipping a missing name would produce a model that
				-- is subtly wrong; say which name did not resolve.
				if not p or not p.Parent then
					table.insert(csgFailures, "unknown part '" .. tostring(n) .. "'")
					others = {}
					break
				end
				table.insert(others, p)
			end
			if #others == 0 then
				continue
			end

			local base: BasePart? = nil
			if step.action == "subtract" then
				base = byName[tostring(step.base)]
				if not base or not (base :: BasePart).Parent then
					table.insert(csgFailures, "subtract needs a valid base, got '" .. tostring(step.base) .. "'")
					continue
				end
			else
				-- union: the first named part is the one the rest merge into.
				base = table.remove(others, 1)
				if #others == 0 then
					continue
				end
			end

			local okCsg, result = pcall(function()
				if step.action == "subtract" then
					return (base :: any):SubtractAsync(others)
				end
				return (base :: any):UnionAsync(others)
			end)

			if not okCsg or not result then
				-- CSG is genuinely refusable (too many faces, degenerate
				-- geometry). Leave the loose parts in place — a slightly
				-- blockier model beats a destroyed one — and report it.
				table.insert(csgFailures, tostring(step.action) .. " failed: " .. tostring(result))
				continue
			end

			local union = result :: BasePart
			union.Name = if typeof(step.name) == "string" then step.name else (base :: BasePart).Name
			union.Parent = model;
			(base :: BasePart):Destroy()
			for _, p in others do
				p:Destroy()
			end
			byName[union.Name] = union
			unions += 1
		end
	end

	-- A model with no PrimaryPart cannot be moved or pivoted as a unit, which
	-- is the first thing anyone tries to do with it.
	if not model.PrimaryPart then
		for _, d in model:GetChildren() do
			if d:IsA("BasePart") then
				model.PrimaryPart = d :: BasePart
				break
			end
		end
	end

	local parts = 0
	for _, d in model:GetDescendants() do
		if d:IsA("BasePart") then
			parts += 1
		end
	end

	return {
		ref = mintRef(model),
		parts = parts,
		unions = unions,
		warnings = if #csgFailures > 0 then csgFailures else nil,
	}
end

-- Roblox's own text-to-3D (Cube 3D), through the engine rather than Open Cloud.
--
-- This is the one path that produces a real textured mesh and drops it
-- straight into the place: no API key, no manual upload, no moderation queue,
-- because the generation happens inside Studio and the result is already an
-- Instance. GenerateModelAsync yields for several seconds and Roblox rate
-- limits it to a handful per minute, so it is for the ONE hero object in a
-- build, not for scenery.
--
-- The documented return is a (success, model, metadata) tuple, but Roblox's
-- own example unpacks it as though the model comes first. Rather than bet on
-- one reading, both are accepted below — this cannot be tested from outside
-- Studio, and guessing wrong would break the feature silently.
handlers.generate_model = function(args)
	local service = game:FindService("GenerationService") or game:GetService("GenerationService")
	if not service then
		toolError(
			"internal",
			"This Studio version has no GenerationService — 3D generation needs a recent Roblox Studio."
		)
	end

	local prompt = tostring(args.prompt)
	local schemaName = if args.schema == "Car5" then "Car5" else "Body1"

	local ok, a, b = pcall(function()
		return (service :: any):GenerateModelAsync({ TextPrompt = prompt }, { PredefinedSchema = schemaName })
	end)

	if not ok then
		local msg = tostring(a)
		-- The common failures are all setup, not code: the beta is gated on an
		-- age-verified account and on the Editable Mesh/Image APIs being
		-- switched on for the place. Say that, because the raw error does not.
		toolError(
			"internal",
			"3D generation failed: "
				.. msg
				.. " — check that your Roblox account is age-verified and that Editable Mesh / Editable Image APIs "
				.. "are enabled in File -> Game Settings -> Security. Roblox also limits generations to a few per minute."
		)
	end

	-- Tolerate both documented shapes.
	local result: any = a
	if typeof(a) == "boolean" then
		if not a then
			toolError("internal", "3D generation was refused: " .. tostring(b))
		end
		result = b
	end

	if typeof(result) ~= "Instance" then
		toolError("internal", "3D generation returned nothing usable for '" .. prompt .. "'")
	end

	local model = result :: Instance
	if args.name then
		model.Name = tostring(args.name)
	end
	model.Parent = if args.parent then resolveRef(args.parent) else workspace

	-- Position it, and anchor it: a generated model arrives unanchored and
	-- falls through the world the moment the user presses play.
	local meshes = 0
	for _, d in model:GetDescendants() do
		if d:IsA("BasePart") then
			(d :: BasePart).Anchored = true
			meshes += 1
		end
	end
	if model:IsA("BasePart") then
		(model :: BasePart).Anchored = true
		meshes += 1
	end

	local pos = args.position
	if typeof(pos) == "table" then
		local target = CFrame.new(pos[1], pos[2], pos[3])
		if model:IsA("Model") then
			local m = model :: Model
			if not m.PrimaryPart then
				for _, d in m:GetDescendants() do
					if d:IsA("BasePart") then
						m.PrimaryPart = d :: BasePart
						break
					end
				end
			end
			m:PivotTo(target)
		elseif model:IsA("BasePart") then
			(model :: BasePart).CFrame = target
		end
	end

	return { ref = mintRef(model), className = model.ClassName, parts = meshes }
end

-- Build a generated mesh from raw geometry.
--
-- Meshy hands back an OBJ on its own CDN, and a plugin cannot make a MeshPart
-- from an external URL — so the backend parses the OBJ and sends vertex and
-- triangle lists, and the geometry is rebuilt here as an EditableMesh. No
-- Open Cloud, no upload, no moderation queue. Same Editable Mesh permission
-- the user already enables for generate_model.
--
-- Meshy works in arbitrary units, so the mesh is normalised to a sensible
-- stud size on arrival: a model that lands 0.02 studs wide or 4000 studs wide
-- reads as a broken build, not as a scale setting.
local DEFAULT_LONGEST_AXIS = 8

handlers.build_ugc = function(args)
	local verts = args.vertices
	local tris = args.triangles
	if typeof(verts) ~= "table" or #verts < 3 then
		toolError("invalid_args", "build_ugc needs at least 3 vertices")
	end
	if typeof(tris) ~= "table" or #tris < 1 then
		toolError("invalid_args", "build_ugc needs at least 1 triangle")
	end

	local okCreate, editable = pcall(function()
		return AssetService:CreateEditableMesh()
	end)
	if not okCreate or not editable then
		toolError(
			"internal",
			"Could not create an EditableMesh: "
				.. tostring(editable)
				.. " — enable Editable Mesh / Editable Image APIs in File -> Game Settings -> Security, "
				.. "and make sure your Roblox account is age-verified."
		)
	end
	local mesh = editable :: any

	-- Normalise while adding: one pass over the vertices instead of two.
	local minX, minY, minZ = math.huge, math.huge, math.huge
	local maxX, maxY, maxZ = -math.huge, -math.huge, -math.huge
	for _, v in verts :: { { number } } do
		minX = math.min(minX, v[1]); maxX = math.max(maxX, v[1])
		minY = math.min(minY, v[2]); maxY = math.max(maxY, v[2])
		minZ = math.min(minZ, v[3]); maxZ = math.max(maxZ, v[3])
	end
	local spanX, spanY, spanZ = maxX - minX, maxY - minY, maxZ - minZ
	local longest = math.max(spanX, math.max(spanY, spanZ))
	local target = tonumber(args.scale) or DEFAULT_LONGEST_AXIS
	-- A degenerate span would divide by zero; leave those at 1:1.
	local k = if longest > 1e-6 then target / longest else 1
	local cx, cy, cz = (minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2

	-- EditableMesh hands back its OWN vertex ids; the OBJ's indices are only
	-- meaningful as positions in this list, so the two have to be mapped.
	local ids: { number } = {}
	for i, v in verts :: { { number } } do
		ids[i] = mesh:AddVertex(
			Vector3.new((v[1] - cx) * k, (v[2] - cy) * k, (v[3] - cz) * k)
		)
	end

	local added, skipped = 0, 0
	for _, t in tris :: { { number } } do
		-- Contract indices are 0-based; Lua tables are 1-based.
		local a, b, c = ids[t[1] + 1], ids[t[2] + 1], ids[t[3] + 1]
		if a and b and c then
			-- A single malformed triangle must not lose the whole mesh.
			if pcall(function() mesh:AddTriangle(a, b, c) end) then
				added += 1
			else
				skipped += 1
			end
		else
			skipped += 1
		end
	end

	if added == 0 then
		toolError("internal", "None of the triangles could be built — the mesh is unusable.")
	end

	local okPart, made = pcall(function()
		return AssetService:CreateMeshPartAsync(Content.fromObject(mesh))
	end)
	if not okPart or not made then
		toolError("internal", "Could not turn the geometry into a MeshPart: " .. tostring(made))
	end

	local part = made :: MeshPart
	part.Name = tostring(args.name)

	-- An LOD change replaces the mesh rather than adding a second one beside
	-- it, and inherits its pose so the object does not appear to jump.
	local replacing: BasePart? = nil
	if args.replaceRef then
		local okOld, old = pcall(resolveRef, args.replaceRef)
		if okOld and typeof(old) == "Instance" and old:IsA("BasePart") then
			replacing = old :: BasePart
		end
	end
	if replacing then
		part.CFrame = (replacing :: BasePart).CFrame
		part.Parent = (replacing :: BasePart).Parent
	end
	-- Anchored, like everything else we create: an un-anchored generated mesh
	-- falls through the world the moment the user presses play.
	part.Anchored = true
	if not part.Parent then
		part.Parent = if args.parent then resolveRef(args.parent) else workspace
	end
	if replacing then
		(replacing :: BasePart):Destroy()
	end

	-- An explicit position wins; inheriting the old pose is only the default.
	local pos = args.position
	if typeof(pos) == "table" and not replacing then
		part.CFrame = CFrame.new(pos[1], pos[2], pos[3])
	end

	-- Stamped on the part so the LOD wheel can re-run the SAME subject at a
	-- different polycount without asking the user to describe it again. The
	-- geometry is disposable; the description is the thing worth keeping.
	part:SetAttribute("BSSubject", tostring(args.subject or args.name))
	part:SetAttribute("BSPolycount", tonumber(args.polycount) or 0)

	return {
		ref = mintRef(part),
		triangles = added,
		skipped = skipped,
		size = { part.Size.X, part.Size.Y, part.Size.Z },
	}
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
			-- Report BOTH failures so the backend/chat can see which path ran
			-- (also distinguishes updated plugins from stale installs).
			toolError(
				"invalid_args",
				"Could not insert asset " .. tostring(assetId)
					.. " — LoadAsset: " .. tostring(container)
					.. "; GetObjects: " .. tostring(objs)
					.. " (Roblox blocks inserting this model programmatically; owning it via its Get button on create.roblox.com would allow it)"
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

-- Revert a whole build: every mutating tool above commits exactly one undo
-- waypoint, so undoing N of them rolls the session back in one click. This is
-- never offered to the model — only the user's "Revert this build" button
-- enqueues it. Undo is Studio's own history, so anything it cannot undo it
-- simply skips.
handlers.revert_build = function(args)
	local want = tonumber(args.steps) or 0
	if want <= 0 then
		toolError("invalid_args", "steps must be a positive number")
	end
	-- Hard ceiling: never chew through more history than one big session.
	want = math.min(want, 200)

	local undone = 0
	for _ = 1, want do
		if not ChangeHistoryService:IsUndoDisabled() then
			local ok = pcall(function()
				ChangeHistoryService:Undo()
			end)
			if not ok then
				break
			end
			undone += 1
		else
			break
		end
	end
	return { undone = undone, requested = want }
end

-- NOTE: an arbitrary-Luau execution tool (loadstring) was intentionally
-- removed. Executing remotely-fetched code is a plugin-policy violation
-- ("Misusing Roblox Systems") and indistinguishable from a backdoor. All
-- building is done through the structured tools above.

local MUTATING: { [string]: boolean } = {
	create_instance = true,
	build_model = true,
	generate_model = true,
	build_ugc = true,
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
		-- Almost always an old plugin against a newer backend: the server has
		-- learned a tool this build does not implement. Say so, rather than
		-- reporting it as an internal fault.
		return finish(false, {
			__toolError = true,
			code = "internal",
			message = "This Bloxsmith plugin is out of date — it does not support '"
				.. tostring(call.tool)
				.. "'. Update the plugin in Studio (Plugins -> Manage Plugins -> Bloxsmith) and try again.",
		})
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

--------------------------------------------------------------------------
-- The wheel
--------------------------------------------------------------------------
--
-- A radial menu over the viewport for whatever generated mesh is selected.
-- The actions you want on a generated mesh — change its detail, re-roll it,
-- delete it — are per-object, and hunting for them in a docked panel while
-- looking at the object is the wrong shape of interaction.
--
-- Segments are data rather than seven hand-placed frames, because the first
-- design change would have rewritten all of them. They are rounded buttons
-- pushed out along the ring rather than true pie slices: Roblox does not
-- hit-test rotated frames, and this keeps every label upright and readable.

local WHEEL_RADIUS = 148
local WHEEL_INNER = 60
local MIN_POLY, MAX_POLY = 500, 200000

local SEGMENTS = {
	{ id = "lod", label = "LOD", accent = true },
	{ id = "reroll", label = "Re-roll" },
	{ id = "duplicate", label = "Duplicate" },
	{ id = "focus", label = "Focus" },
	{ id = "export", label = "Export" },
	{ id = "delete", label = "Delete" },
}

local ACCENT = Color3.fromRGB(120, 230, 130)
local PANEL = Color3.fromRGB(24, 24, 28)
local PANEL_HOVER = Color3.fromRGB(36, 36, 42)
local ACCENT_BG = Color3.fromRGB(28, 44, 30)
local ACCENT_HOVER = Color3.fromRGB(38, 60, 42)

local wheelGui: ScreenGui? = nil
local wheelTarget: BasePart? = nil

local function round(frame: Instance, r: number)
	local c = Instance.new("UICorner")
	c.CornerRadius = UDim.new(0, r)
	c.Parent = frame
end

--- The selected part, but only if WE made it — the wheel's actions all
--- depend on the stamped description, so anything else is not a target.
local function selectedMesh(): BasePart?
	for _, inst in Selection:Get() do
		if inst:IsA("BasePart") and inst:GetAttribute("BSSubject") then
			return inst :: BasePart
		end
	end
	return nil
end

local function closeWheel()
	if wheelGui then
		wheelGui:Destroy()
		wheelGui = nil
	end
	wheelTarget = nil
end

local function toast(message: string)
	warn("[Bloxsmith] " .. message)
end

--- Ask the backend for the same subject at a new detail.
---
--- The plugin polls for work and cannot push a tool call, so this goes to
--- /api/plugin/remesh and the geometry comes back through the ordinary queue
--- as a build_ugc. The subject is read off the part, which is what makes this
--- a detail dial rather than a fresh prompt.
local function requestRemesh(part: BasePart, polycount: number)
	local subject = part:GetAttribute("BSSubject")
	if typeof(subject) ~= "string" or subject == "" then
		toast("This mesh has no stored description — regenerate it from chat.")
		return
	end
	if not token then
		toast("Connect the plugin to Bloxsmith first.")
		return
	end

	toast(string.format("Rebuilding at %d triangles — this takes a minute.", polycount))
	task.spawn(function()
		local body, err = request("POST", "/api/plugin/remesh", {
			subject = subject,
			polycount = polycount,
			replaceRef = instanceToRef[part],
			position = { part.Position.X, part.Position.Y, part.Position.Z },
			name = part.Name,
		}, token)
		if err then
			toast("Re-mesh failed: " .. tostring(err))
		elseif typeof(body) == "table" and body.error then
			toast("Re-mesh failed: " .. tostring(body.error))
		end
	end)
end

local function openLodPanel(parent: Instance, part: BasePart)
	local current = math.clamp(
		tonumber(part:GetAttribute("BSPolycount")) or 8000,
		MIN_POLY,
		MAX_POLY
	)

	local panel = Instance.new("Frame")
	panel.Size = UDim2.fromOffset(280, 108)
	panel.Position = UDim2.new(0.5, -140, 0.5, WHEEL_RADIUS + 20)
	panel.BackgroundColor3 = Color3.fromRGB(18, 18, 22)
	panel.BorderSizePixel = 0
	panel.Parent = parent
	round(panel, 14)

	local stroke = Instance.new("UIStroke")
	stroke.Color = Color3.fromRGB(52, 52, 60)
	stroke.Parent = panel

	local title = Instance.new("TextLabel")
	title.Size = UDim2.new(1, -28, 0, 20)
	title.Position = UDim2.fromOffset(14, 12)
	title.BackgroundTransparency = 1
	title.Font = Enum.Font.GothamMedium
	title.TextSize = 13
	title.TextXAlignment = Enum.TextXAlignment.Left
	title.TextColor3 = Color3.fromRGB(235, 235, 240)
	title.Text = string.format("Detail — %d triangles", current)
	title.Parent = panel

	local track = Instance.new("Frame")
	track.Size = UDim2.new(1, -28, 0, 6)
	track.Position = UDim2.fromOffset(14, 48)
	track.BackgroundColor3 = Color3.fromRGB(58, 58, 66)
	track.BorderSizePixel = 0
	track.Parent = panel
	round(track, 3)

	local fill = Instance.new("Frame")
	fill.BackgroundColor3 = ACCENT
	fill.BorderSizePixel = 0
	fill.Parent = track
	round(fill, 3)

	-- Log scale. 500 and 5,000 triangles are a world apart; 195,000 and
	-- 200,000 are indistinguishable, and a linear slider spends most of its
	-- travel on the half nobody wants.
	local logMin, logMax = math.log(MIN_POLY), math.log(MAX_POLY)
	local function toFraction(p: number): number
		return (math.log(p) - logMin) / (logMax - logMin)
	end
	local function fromFraction(f: number): number
		local v = math.exp(logMin + f * (logMax - logMin))
		return math.clamp(math.floor(v / 100 + 0.5) * 100, MIN_POLY, MAX_POLY)
	end

	local chosen = current
	fill.Size = UDim2.fromScale(toFraction(chosen), 1)

	local apply = Instance.new("TextButton")
	apply.Size = UDim2.new(1, -28, 0, 28)
	apply.Position = UDim2.fromOffset(14, 68)
	apply.BackgroundColor3 = ACCENT
	apply.BorderSizePixel = 0
	apply.Font = Enum.Font.GothamBold
	apply.TextSize = 12
	apply.TextColor3 = Color3.fromRGB(12, 12, 14)
	apply.Text = "Rebuild at this detail"
	apply.AutoButtonColor = false
	apply.Parent = panel
	round(apply, 8)

	local dragging = false
	local function setFromX(x: number)
		local left = track.AbsolutePosition.X
		local width = math.max(1, track.AbsoluteSize.X)
		local f = math.clamp((x - left) / width, 0, 1)
		chosen = fromFraction(f)
		fill.Size = UDim2.fromScale(f, 1)
		title.Text = string.format("Detail — %d triangles", chosen)
	end

	track.InputBegan:Connect(function(input)
		if input.UserInputType == Enum.UserInputType.MouseButton1 then
			dragging = true
			setFromX(input.Position.X)
		end
	end)
	-- Released anywhere, not just over the track: letting go outside it must
	-- not leave the slider stuck to the pointer.
	UserInputService.InputEnded:Connect(function(input)
		if input.UserInputType == Enum.UserInputType.MouseButton1 then
			dragging = false
		end
	end)
	UserInputService.InputChanged:Connect(function(input)
		if dragging and input.UserInputType == Enum.UserInputType.MouseMovement then
			setFromX(input.Position.X)
		end
	end)

	apply.MouseButton1Click:Connect(function()
		requestRemesh(part, chosen)
		closeWheel()
	end)
end

local function runSegment(id: string, gui: ScreenGui, part: BasePart)
	if id == "lod" then
		openLodPanel(gui, part)
		return
	end

	if id == "reroll" then
		requestRemesh(part, tonumber(part:GetAttribute("BSPolycount")) or 8000)
	elseif id == "duplicate" then
		local recording = ChangeHistoryService:TryBeginRecording("Bloxsmith: duplicate mesh")
		local copy = part:Clone()
		copy.Position = part.Position + Vector3.new(part.Size.X + 2, 0, 0)
		copy.Parent = part.Parent
		Selection:Set({ copy })
		if recording then
			ChangeHistoryService:FinishRecording(recording, Enum.FinishRecordingOperation.Commit)
		end
	elseif id == "focus" then
		local camera = workspace.CurrentCamera
		if camera then
			-- Frame it from a three-quarter angle at a distance that scales
			-- with the object, so a 2-stud prop and a 40-stud statue both fill
			-- roughly the same amount of the viewport.
			local dist = math.max(6, part.Size.Magnitude * 2)
			local dir = Vector3.new(1, 0.55, 1).Unit
			camera.CFrame = CFrame.lookAt(part.Position + dir * dist, part.Position)
		end
	elseif id == "export" then
		Selection:Set({ part })
		toast("Selected — use File > Export Selection to save it.")
	elseif id == "delete" then
		local recording = ChangeHistoryService:TryBeginRecording("Bloxsmith: delete mesh")
		part:Destroy()
		if recording then
			ChangeHistoryService:FinishRecording(recording, Enum.FinishRecordingOperation.Commit)
		end
	end
	closeWheel()
end

local function openWheel()
	closeWheel()
	local part = selectedMesh()
	if not part then
		toast("Select a Bloxsmith-generated mesh first.")
		return
	end
	wheelTarget = part

	local gui = Instance.new("ScreenGui")
	gui.Name = "BloxsmithWheel"
	gui.ResetOnSpawn = false
	gui.ZIndexBehavior = Enum.ZIndexBehavior.Sibling
	gui.DisplayOrder = 100
	gui.Parent = CoreGui
	wheelGui = gui

	-- Click-away closes. A radial menu you cannot dismiss is a trap.
	local scrim = Instance.new("TextButton")
	scrim.Size = UDim2.fromScale(1, 1)
	scrim.BackgroundColor3 = Color3.new(0, 0, 0)
	scrim.BackgroundTransparency = 0.5
	scrim.Text = ""
	scrim.AutoButtonColor = false
	scrim.Parent = gui
	scrim.MouseButton1Click:Connect(closeWheel)

	local ring = Instance.new("Frame")
	ring.Size = UDim2.fromOffset(WHEEL_RADIUS * 2, WHEEL_RADIUS * 2)
	ring.Position = UDim2.new(0.5, -WHEEL_RADIUS, 0.5, -WHEEL_RADIUS)
	ring.BackgroundTransparency = 1
	ring.Parent = gui

	local step = 360 / #SEGMENTS
	local mid = (WHEEL_INNER + WHEEL_RADIUS) / 2

	for i, seg in SEGMENTS do
		local angle = math.rad((i - 1) * step - 90)
		local btn = Instance.new("TextButton")
		btn.Size = UDim2.fromOffset(100, 62)
		btn.Position = UDim2.new(
			0.5,
			math.cos(angle) * mid - 50,
			0.5,
			math.sin(angle) * mid - 31
		)
		btn.BackgroundColor3 = if seg.accent then ACCENT_BG else PANEL
		btn.BorderSizePixel = 0
		btn.Font = Enum.Font.GothamMedium
		btn.TextSize = 13
		btn.TextColor3 = if seg.accent then ACCENT else Color3.fromRGB(228, 228, 234)
		btn.Text = seg.label
		btn.AutoButtonColor = false
		btn.Parent = ring
		round(btn, 14)

		local s = Instance.new("UIStroke")
		s.Color = if seg.accent then ACCENT else Color3.fromRGB(52, 52, 60)
		s.Parent = btn

		btn.MouseEnter:Connect(function()
			btn.BackgroundColor3 = if seg.accent then ACCENT_HOVER else PANEL_HOVER
		end)
		btn.MouseLeave:Connect(function()
			btn.BackgroundColor3 = if seg.accent then ACCENT_BG else PANEL
		end)
		btn.MouseButton1Click:Connect(function()
			runSegment(seg.id, gui, part)
		end)
	end

	local hub = Instance.new("TextLabel")
	hub.Size = UDim2.fromOffset(WHEEL_INNER * 2 - 16, WHEEL_INNER * 2 - 16)
	hub.Position = UDim2.new(0.5, -(WHEEL_INNER - 8), 0.5, -(WHEEL_INNER - 8))
	hub.BackgroundColor3 = Color3.fromRGB(14, 14, 18)
	hub.BorderSizePixel = 0
	hub.Font = Enum.Font.GothamBold
	hub.TextSize = 12
	hub.TextWrapped = true
	hub.TextColor3 = Color3.fromRGB(185, 185, 195)
	hub.Text = part.Name
	hub.Parent = ring
	round(hub, WHEEL_INNER)

	local hubStroke = Instance.new("UIStroke")
	hubStroke.Color = Color3.fromRGB(52, 52, 60)
	hubStroke.Parent = hub
end

local function toggleWheel()
	if wheelGui then
		closeWheel()
	else
		openWheel()
	end
end

local wheelButton = toolbar:CreateButton(
	"Mesh wheel",
	"Open the wheel for the selected generated mesh",
	"rbxassetid://71727317891946"
)
wheelButton.ClickableWhenViewportHidden = true
wheelButton.Click:Connect(toggleWheel)

-- A rebindable action rather than a hardcoded chord: Studio already owns most
-- modifier combinations, and the user can set this under
-- File > Advanced > Customize Shortcuts.
local wheelAction = plugin:CreatePluginAction(
	"BloxsmithWheel",
	"Bloxsmith: mesh wheel",
	"Open the radial menu for the selected generated mesh",
	"rbxassetid://71727317891946",
	true
)
wheelAction.Triggered:Connect(toggleWheel)

UserInputService.InputBegan:Connect(function(input, processed)
	if not processed and input.KeyCode == Enum.KeyCode.Escape and wheelGui then
		closeWheel()
	end
end)

-- The wheel must not outlive the thing it is acting on.
Selection.SelectionChanged:Connect(function()
	if wheelGui and wheelTarget and not wheelTarget:IsDescendantOf(game) then
		closeWheel()
	end
end)
