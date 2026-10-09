# VND TikTok ad — 15s, 9:16, 1080x1920, 24fps
import math
import os

import bpy
from mathutils import Vector

ROOT = r"C:\Users\erion\Desktop\vnd.com\marketing\tiktok"
BLEND = os.path.join(ROOT, "vnd-tiktok-ad.blend")
GREEN = (0.0, 1.0, 0.4, 1.0)  # #00FF66
GREEN_LIN = (0.0, 1.0, 0.132, 1.0)
DARK = (0.006, 0.006, 0.006, 1.0)
FONT = r"C:\Windows\Fonts\segoeuib.ttf"

SHOTS = [
    ("CAM_HOOK", 1),
    ("CAM_STREET", 61),
    ("CAM_PHONE", 151),
    ("CAM_DOOR", 241),
    ("CAM_END", 313),
]


def srgb(c):
    def t(x):
        return x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4

    return (t(c[0]), t(c[1]), t(c[2]), 1.0 if len(c) < 4 else c[3])


def coll(name):
    c = bpy.data.collections.get(name) or bpy.data.collections.new(name)
    if c.name not in bpy.context.scene.collection.children:
        bpy.context.scene.collection.children.link(c)
    return c


def link_only(obj, c):
    for old in list(obj.users_collection):
        old.objects.unlink(obj)
    if obj.name not in c.objects:
        c.objects.link(obj)


def bsdf(mat):
    return next(n for n in mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED")


def principled_mat(name, **kw):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    p = bsdf(mat)
    mapping = {
        "color": "Base Color",
        "metallic": "Metallic",
        "roughness": "Roughness",
        "ior": "IOR",
        "alpha": "Alpha",
        "coat": "Coat Weight",
        "coat_rough": "Coat Roughness",
        "emission": "Emission Color",
        "emission_strength": "Emission Strength",
        "transmission": "Transmission Weight",
        "spec": "Specular IOR Level",
    }
    for k, v in kw.items():
        sock = mapping[k]
        p.inputs[sock].default_value = v
    if kw.get("alpha", 1.0) < 1:
        mat.blend_method = "BLEND"
    return mat


def emission_mat(name, color, strength):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    p = bsdf(mat)
    nt.nodes.remove(p)
    em = nt.nodes.new("ShaderNodeEmission")
    em.inputs["Color"].default_value = color
    em.inputs["Strength"].default_value = strength
    out = next(n for n in nt.nodes if n.type == "OUTPUT_MATERIAL")
    nt.links.new(em.outputs["Emission"], out.inputs["Surface"])
    return mat


def volume_mat(name, density=0.03):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    p = bsdf(mat)
    nt.nodes.remove(p)
    vol = nt.nodes.new("ShaderNodeVolumePrincipled")
    vol.inputs["Density"].default_value = density
    vol.inputs["Color"].default_value = (0.04, 0.07, 0.06, 1)
    vol.inputs["Anisotropy"].default_value = 0.35
    vol.inputs["Emission Strength"].default_value = 0.02
    vol.inputs["Emission Color"].default_value = GREEN_LIN
    out = next(n for n in nt.nodes if n.type == "OUTPUT_MATERIAL")
    nt.links.new(vol.outputs["Volume"], out.inputs["Volume"])
    return mat


def wet_asphalt():
    mat = bpy.data.materials.new("Asphalt")
    mat.use_nodes = True
    nt = mat.node_tree
    p = bsdf(mat)
    p.inputs["Base Color"].default_value = (0.012, 0.013, 0.014, 1)
    p.inputs["Metallic"].default_value = 0.0
    p.inputs["Specular IOR Level"].default_value = 0.7
    p.inputs["Coat Weight"].default_value = 0.85
    p.inputs["Coat Roughness"].default_value = 0.04
    noise = nt.nodes.new("ShaderNodeTexNoise")
    noise.inputs["Scale"].default_value = 18
    noise.inputs["Detail"].default_value = 8
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].position = 0.35
    ramp.color_ramp.elements[0].color = (0.04, 0.04, 0.04, 1)
    ramp.color_ramp.elements[1].position = 0.7
    ramp.color_ramp.elements[1].color = (0.55, 0.55, 0.55, 1)
    bump = nt.nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.15
    nt.links.new(noise.outputs["Fac"], ramp.inputs["Fac"])
    nt.links.new(ramp.outputs["Color"], p.inputs["Roughness"])
    nt.links.new(noise.outputs["Fac"], bump.inputs["Height"])
    nt.links.new(bump.outputs["Normal"], p.inputs["Normal"])
    return mat


def screen_mat(name, image, strength=14.0):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    p = bsdf(mat)
    nt.nodes.remove(p)
    em = nt.nodes.new("ShaderNodeEmission")
    em.inputs["Strength"].default_value = strength
    out = next(n for n in nt.nodes if n.type == "OUTPUT_MATERIAL")
    if image:
        tex = nt.nodes.new("ShaderNodeTexImage")
        tex.image = image
        tex.extension = "CLIP"
        nt.links.new(tex.outputs["Color"], em.inputs["Color"])
    else:
        em.inputs["Color"].default_value = GREEN_LIN
    nt.links.new(em.outputs["Emission"], out.inputs["Surface"])
    return mat


def assign(obj, mat):
    if obj.data.materials:
        obj.data.materials[0] = mat
    else:
        obj.data.materials.append(mat)


def add_cube(name, loc, scale, collection, rot=(0, 0, 0)):
    mesh = bpy.data.meshes.new(name)
    import bmesh

    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=2.0)
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(name, mesh)
    obj.location = loc
    obj.rotation_euler = rot
    obj.scale = scale
    collection.objects.link(obj)
    return obj


def add_cyl(name, loc, radius, depth, collection, rot=(0, 0, 0), segs=32):
    mesh = bpy.data.meshes.new(name)
    import bmesh

    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=segs, radius1=radius, radius2=radius, depth=depth)
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(name, mesh)
    obj.location = loc
    obj.rotation_euler = rot
    collection.objects.link(obj)
    return obj


def add_uv_sphere(name, loc, radius, collection):
    mesh = bpy.data.meshes.new(name)
    import bmesh

    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=24, v_segments=12, radius=radius)
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(name, mesh)
    obj.location = loc
    collection.objects.link(obj)
    return obj


def bevel(obj, width=0.004, segs=3):
    m = obj.modifiers.new("Bevel", "BEVEL")
    m.width = width
    m.segments = segs
    m.limit_method = "ANGLE"
    return m


def add_light(name, kind, loc, collection, energy, color=(1, 1, 1), rot=(0, 0, 0), size=0.4, spot=0.6):
    data = bpy.data.lights.new(name, kind)
    data.energy = energy
    data.color = color
    if kind == "AREA":
        data.size = size
    if kind == "SPOT":
        data.spot_size = spot
        data.spot_blend = 0.45
        data.shadow_soft_size = 0.08
    if hasattr(data, "use_shadow"):
        data.use_shadow = True
    obj = bpy.data.objects.new(name, data)
    obj.location = loc
    obj.rotation_euler = rot
    collection.objects.link(obj)
    return obj


def look_at(obj, target):
    direction = Vector(target) - obj.location
    obj.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()


def kf(obj, data_path, frame, value, interp="BEZIER"):
    if data_path == "location":
        obj.location = value
    elif data_path == "rotation_euler":
        obj.rotation_euler = value
    elif data_path == "scale":
        obj.scale = value
    elif data_path == "hide_render":
        obj.hide_render = value
        obj.hide_viewport = value
    obj.keyframe_insert(data_path, frame=frame)


def load_img(path):
    if os.path.isfile(path):
        img = bpy.data.images.load(path, check_existing=True)
        img.colorspace_settings.name = "sRGB"
        return img
    return None


def make_text(name, body, size, collection, loc=(0, 0, 0), color=GREEN_LIN, extrude=0.003):
    curve = bpy.data.curves.new(name, "FONT")
    curve.body = body
    curve.align_x = "CENTER"
    try:
        curve.align_y = "CENTER"
    except TypeError:
        pass
    curve.size = size
    curve.extrude = extrude
    if os.path.isfile(FONT):
        curve.font = bpy.data.fonts.load(FONT, check_existing=True)
    obj = bpy.data.objects.new(name, curve)
    obj.location = loc
    collection.objects.link(obj)
    assign(obj, emission_mat(name + "_mat", color, 6.0))
    return obj


def reset_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=True)
    for block in (bpy.data.meshes, bpy.data.lights, bpy.data.cameras, bpy.data.curves, bpy.data.materials, bpy.data.collections):
        for item in list(block):
            if item.name == "Scene Collection":
                continue
            try:
                block.remove(item)
            except Exception:
                pass
    scene = bpy.context.scene
    for name in ("ENVIRONMENT", "VEHICLE", "PHONE", "DELIVERY", "LIGHTING", "CAMERAS", "TEXT", "VND_BRANDING"):
        coll(name)
    return scene


def setup_render(scene):
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 1080
    scene.render.resolution_y = 1920
    scene.render.resolution_percentage = 100
    scene.render.fps = 24
    scene.render.fps_base = 1
    scene.frame_start = 1
    scene.frame_end = 360
    scene.frame_current = 1
    # This Blender build has no FFmpeg output; write a PNG sequence and mux later.
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGB"
    scene.render.image_settings.compression = 15
    scene.render.filepath = os.path.join(ROOT, "frames", "vnd_")
    scene.render.use_motion_blur = True
    scene.render.motion_blur_shutter = 0.45
    scene.render.film_transparent = False
    scene.view_settings.view_transform = "AgX"
    scene.view_settings.look = "None"
    scene.view_settings.exposure = -0.15
    scene.view_settings.gamma = 1.0
    ee = scene.eevee
    ee.taa_render_samples = 32
    ee.use_shadows = True
    ee.use_raytracing = True
    ee.use_fast_gi = True
    ee.fast_gi_method = "GLOBAL_ILLUMINATION"
    ee.volumetric_tile_size = "2"
    ee.volumetric_samples = 64
    ee.use_volumetric_shadows = False
    world = bpy.data.worlds.get("World") or bpy.data.worlds.new("World")
    scene.world = world
    world.use_nodes = True
    bg = next(n for n in world.node_tree.nodes if n.type == "BACKGROUND")
    bg.inputs["Color"].default_value = (0.002, 0.003, 0.005, 1)
    bg.inputs["Strength"].default_value = 0.15
    setup_compositor(scene)


def setup_compositor(scene):
    tree = bpy.data.node_groups.get("VND_Compositor") or bpy.data.node_groups.new("VND_Compositor", "CompositorNodeTree")
    tree.nodes.clear()
    try:
        tree.interface.new_socket(name="Image", in_out="OUTPUT", socket_type="NodeSocketColor")
    except Exception:
        pass
    scene.use_nodes = True
    scene.compositing_node_group = tree
    rl = tree.nodes.new("CompositorNodeRLayers")
    rl.location = (0, 0)
    bloom = tree.nodes.new("CompositorNodeGlare")
    bloom.location = (280, 40)
    bloom.inputs["Type"].default_value = "Bloom"
    bloom.inputs["Quality"].default_value = "High"
    bloom.inputs["Highlights Threshold"].default_value = 0.7
    bloom.inputs["Strength"].default_value = 0.85
    bloom.inputs["Size"].default_value = 8
    streaks = tree.nodes.new("CompositorNodeGlare")
    streaks.location = (520, 40)
    streaks.inputs["Type"].default_value = "Streaks"
    streaks.inputs["Quality"].default_value = "Medium"
    streaks.inputs["Highlights Threshold"].default_value = 1.2
    streaks.inputs["Strength"].default_value = 0.45
    streaks.inputs["Streaks"].default_value = 4
    vig = tree.nodes.new("CompositorNodeLensdist")
    vig.location = (760, 0)
    try:
        vig.inputs["Distortion"].default_value = 0.02
    except Exception:
        pass
    out = tree.nodes.new("NodeGroupOutput")
    out.location = (1000, 0)
    tree.links.new(rl.outputs["Image"], bloom.inputs["Image"])
    tree.links.new(bloom.outputs["Image"], streaks.inputs["Image"])
    tree.links.new(streaks.outputs["Image"], vig.inputs["Image"])
    dest = out.inputs[0] if out.inputs else None
    if dest:
        tree.links.new(vig.outputs["Image"], dest)


def build_phone_set(notify_img, shop_img):
    ph = coll("PHONE")
    lg = coll("LIGHTING")
    origin = Vector((0, 0, 0))
    table = add_cube("Table", (0, 0, 0.72), (0.55, 0.55, 0.04), ph)
    assign(table, principled_mat("TableMat", color=(0.02, 0.02, 0.022, 1), roughness=0.18, coat=0.4, coat_rough=0.08))
    bevel(table, 0.006, 4)
    body = add_cube("PhoneBody", (0, 0, 0.768), (0.036, 0.074, 0.0042), ph)
    assign(body, principled_mat("PhoneBodyMat", color=(0.02, 0.02, 0.02, 1), metallic=0.85, roughness=0.22, coat=0.3))
    bevel(body, 0.0022, 4)
    screen = add_cube("PhoneScreen", (0, 0.001, 0.773), (0.031, 0.067, 0.0004), ph)
    assign(screen, screen_mat("ScreenNotify", notify_img, 16))
    screen2 = add_cube("PhoneScreenShop", (0, 0.001, 0.7732), (0.031, 0.067, 0.0004), ph)
    assign(screen2, screen_mat("ScreenShop", shop_img, 16))
    island = add_cube("DynamicIsland", (0, 0.058, 0.774), (0.01, 0.004, 0.0005), ph)
    assign(island, principled_mat("IslandMat", color=(0, 0, 0, 1), roughness=0.4))
    cam_bump = add_cube("CamBump", (-0.012, 0.055, 0.762), (0.01, 0.01, 0.0015), ph)
    assign(cam_bump, principled_mat("BumpMat", color=(0.03, 0.03, 0.03, 1), metallic=0.9, roughness=0.15))
    add_light("PhoneFill", "AREA", (-0.25, -0.2, 1.15), lg, 25, (0.55, 0.62, 1.0), rot=(math.radians(50), 0, math.radians(-35)), size=0.5)
    add_light("PhoneRim", "AREA", (0.3, 0.25, 1.0), lg, 40, (0.05, 1.0, 0.4), rot=(math.radians(60), 0, math.radians(50)), size=0.25)
    add_light("PhoneWarm", "AREA", (0.1, -0.35, 0.95), lg, 12, (1.0, 0.72, 0.45), rot=(math.radians(40), 0, 0), size=0.3)
    kf(screen2, "hide_render", 1, True, "CONSTANT")
    kf(screen2, "hide_render", 150, True, "CONSTANT")
    kf(screen2, "hide_render", 151, False, "CONSTANT")
    kf(screen, "hide_render", 1, False, "CONSTANT")
    kf(screen, "hide_render", 150, False, "CONSTANT")
    kf(screen, "hide_render", 151, True, "CONSTANT")
    return origin


def build_street_set():
    env = coll("ENVIRONMENT")
    veh = coll("VEHICLE")
    lg = coll("LIGHTING")
    ox, oy = 18.0, 0.0
    road = add_cube("Road", (ox, oy, 0), (5.0, 28.0, 0.04), env)
    assign(road, wet_asphalt())
    for side, x in (("L", ox - 5.6), ("R", ox + 5.6)):
        walk = add_cube(f"Walk_{side}", (x, oy, 0.06), (0.7, 28.0, 0.06), env)
        assign(walk, principled_mat("WalkMat", color=(0.04, 0.04, 0.042, 1), roughness=0.6))
    for i, y in enumerate(range(-22, 24, 3)):
        dash = add_cube(f"Dash_{i}", (ox, y, 0.045), (0.06, 1.0, 0.005), env)
        assign(dash, emission_mat("DashMat", (0.9, 0.85, 0.4, 1), 2.0))
    bmat = principled_mat("BldgMat", color=(0.03, 0.032, 0.035, 1), roughness=0.55)
    win = emission_mat("WinMat", (1.0, 0.82, 0.45, 1), 8.0)
    neon = emission_mat("NeonMat", GREEN_LIN, 22.0)
    rng = [(-11, 7.5, 4.2), (-10.5, 2.0, 6.0), (-11.2, -6.0, 5.1), (-10.8, -14.0, 8.0), (11.2, 8.0, 5.5), (10.6, 1.0, 7.2), (11.0, -7.5, 4.8), (10.8, -16.0, 6.4)]
    for i, (dx, y, h) in enumerate(rng):
        b = add_cube(f"Bldg_{i}", (ox + dx, y, h), (1.6, 2.2, h), env)
        assign(b, bmat)
        w = add_cube(f"Win_{i}", (ox + dx + (1.62 if dx > 0 else -1.62), y, h * 0.7), (0.04, 1.6, h * 0.55), env)
        assign(w, win)
    sign = add_cube("NeonSign", (ox - 9.3, 2.0, 4.6), (0.08, 1.6, 0.45), env)
    assign(sign, neon)
    fog = add_cube("FogVolume", (ox, 0, 4.0), (14, 30, 5.0), env)
    assign(fog, volume_mat("FogMat", 0.018))
    fog.display_type = "WIRE"
    moon = add_light("Moon", "SUN", (ox - 8, -20, 18), lg, 4.5, (0.55, 0.7, 1.0), rot=(math.radians(55), math.radians(-20), 0))
    if hasattr(moon.data, "angle"):
        moon.data.angle = math.radians(1.2)
    for i, y in enumerate((-18, -9, 0, 9, 18)):
        pole = add_cyl(f"LampPole_{i}", (ox + 4.6, y, 1.6), 0.05, 3.2, env)
        assign(pole, principled_mat("PoleMat", color=(0.08, 0.08, 0.08, 1), metallic=0.7, roughness=0.35))
        head = add_cube(f"LampHead_{i}", (ox + 4.2, y, 3.15), (0.35, 0.08, 0.04), env)
        assign(head, principled_mat("LampHeadMat", color=(0.1, 0.1, 0.1, 1), roughness=0.4))
        add_light(f"StreetLamp_{i}", "POINT", (ox + 3.9, y, 3.0), lg, 250, (1.0, 0.78, 0.48))
        add_light(f"StreetSpot_{i}", "SPOT", (ox + 3.9, y, 3.05), lg, 400, (1.0, 0.8, 0.5), rot=(math.radians(70), 0, math.radians(-20)), spot=math.radians(55))
    black = principled_mat("ScooterBlack", color=(0.01, 0.01, 0.012, 1), metallic=0.6, roughness=0.28)
    tire = principled_mat("Tire", color=(0.01, 0.01, 0.01, 1), roughness=0.7)
    deck = add_cube("ScooterDeck", (ox, -16, 0.28), (0.18, 0.7, 0.04), veh)
    assign(deck, black)
    bevel(deck, 0.01, 3)
    stem = add_cube("ScooterStem", (ox, -15.45, 0.7), (0.03, 0.03, 0.45), veh, rot=(math.radians(-12), 0, 0))
    assign(stem, black)
    bar = add_cyl("Handle", (ox, -15.32, 1.12), 0.018, 0.42, veh, rot=(0, math.radians(90), 0), segs=16)
    assign(bar, black)
    for name, y in (("WheelF", -15.42), ("WheelR", -16.55)):
        w = add_cyl(name, (ox, y, 0.18), 0.16, 0.07, veh, rot=(0, math.radians(90), 0), segs=24)
        assign(w, tire)
    box = add_cube("DropBox", (ox, -16.55, 0.62), (0.22, 0.22, 0.22), veh)
    assign(box, principled_mat("BoxMat", color=(0.04, 0.04, 0.04, 1), roughness=0.45))
    stripe = add_cube("BoxStripe", (ox, -16.55, 0.62), (0.232, 0.04, 0.232), veh)
    assign(stripe, emission_mat("BoxStripeMat", GREEN_LIN, 18))
    lamp = add_uv_sphere("Headlamp", (ox, -15.28, 1.05), 0.04, veh)
    assign(lamp, emission_mat("HeadlampMat", (1, 0.95, 0.85, 1), 60))
    hl = add_light("Headlight", "SPOT", (ox, -15.1, 1.05), lg, 900, (1, 0.95, 0.8), rot=(math.radians(90), 0, 0), spot=math.radians(38))
    accent = add_light("ScooterAccent", "POINT", (ox, -16.55, 0.7), lg, 80, (0.05, 1, 0.4))
    scooter = [deck, stem, bar, box, stripe, lamp, hl, accent] + [veh.objects[n] for n in ("WheelF", "WheelR")]
    empty = bpy.data.objects.new("ScooterRoot", None)
    veh.objects.link(empty)
    empty.location = (ox, -16, 0)
    for o in scooter:
        if o.parent is None:
            o.parent = empty
            o.matrix_parent_inverse = empty.matrix_world.inverted() @ o.matrix_world
    kf(empty, "location", 61, (ox, -18, 0))
    kf(empty, "location", 150, (ox, 16, 0))
    return (ox, 0, 0)


def build_door_set():
    de = coll("DELIVERY")
    lg = coll("LIGHTING")
    ox = 40.0
    wall = add_cube("DoorWall", (ox, 1.4, 1.6), (2.4, 0.12, 1.6), de)
    assign(wall, principled_mat("WallMat", color=(0.09, 0.08, 0.07, 1), roughness=0.7))
    door = add_cube("Door", (ox, 1.26, 1.15), (0.55, 0.05, 1.15), de)
    assign(door, principled_mat("DoorMat", color=(0.04, 0.03, 0.025, 1), roughness=0.35, coat=0.2))
    handle = add_cube("Handle", (ox + 0.38, 1.20, 1.05), (0.02, 0.04, 0.08), de)
    assign(handle, principled_mat("HandleMat", color=(0.7, 0.65, 0.4, 1), metallic=1, roughness=0.15))
    step = add_cube("Step", (ox, 0.7, 0.08), (1.2, 0.45, 0.08), de)
    assign(step, principled_mat("StepMat", color=(0.08, 0.08, 0.08, 1), roughness=0.5))
    pkg = add_cube("Package", (ox - 0.15, 0.55, 0.28), (0.16, 0.22, 0.12), de)
    assign(pkg, principled_mat("PkgMat", color=(0.12, 0.09, 0.05, 1), roughness=0.55))
    bevel(pkg, 0.008, 3)
    tape = add_cube("Tape", (ox - 0.15, 0.55, 0.405), (0.17, 0.04, 0.008), de)
    assign(tape, emission_mat("TapeMat", GREEN_LIN, 10))
    cash = add_cube("Cash", (ox + 0.22, 0.48, 0.175), (0.12, 0.06, 0.004), de)
    assign(cash, principled_mat("CashMat", color=(0.15, 0.45, 0.18, 1), roughness=0.6))
    add_light("Porch", "POINT", (ox, 0.9, 2.15), lg, 180, (1.0, 0.78, 0.5))
    add_light("DoorGreen", "AREA", (ox - 0.8, -0.4, 1.4), lg, 55, (0.05, 1, 0.4), rot=(math.radians(50), 0, math.radians(-30)), size=0.5)
    kf(pkg, "location", 241, (ox - 0.15, 1.05, 0.9))
    kf(pkg, "location", 280, (ox - 0.15, 0.55, 0.28))
    kf(tape, "location", 241, (ox - 0.15, 1.05, 1.025))
    kf(tape, "location", 280, (ox - 0.15, 0.55, 0.405))
    return (ox, 0, 0)


def build_logo():
    br = coll("VND_BRANDING")
    lg = coll("LIGHTING")
    ox = 62.0
    imported = []
    svg = os.path.join(ROOT, "logo-mark.svg")
    if os.path.isfile(svg):
        before = set(bpy.data.objects.keys())
        try:
            bpy.ops.wm.ot_svg_import(filepath=svg) if hasattr(bpy.ops.wm, "ot_svg_import") else None
        except Exception:
            pass
        try:
            bpy.ops.import_curve.svg(filepath=svg)
        except Exception:
            try:
                bpy.ops.wm.svg_import(filepath=svg)
            except Exception:
                pass
        imported = [bpy.data.objects[n] for n in bpy.data.objects.keys() if n not in before]
    root = bpy.data.objects.new("LogoRoot", None)
    br.objects.link(root)
    root.location = (ox, 0, 1.4)
    if imported:
        for o in imported:
            link_only(o, br)
            o.parent = root
            if o.data and hasattr(o.data, "extrude"):
                o.data.extrude = 0.04
                o.data.bevel_depth = 0.004
            assign(o, emission_mat("Logo3D", GREEN_LIN, 12))
        root.scale = (18, 18, 18)
    else:
        letters = make_text("LogoFallback", "VND", 1.4, br, (0, 0, 0), GREEN_LIN, 0.06)
        letters.parent = root
    kf(root, "rotation_euler", 313, (math.radians(90), 0, math.radians(-8)))
    kf(root, "rotation_euler", 360, (math.radians(90), 0, math.radians(8)))
    add_light("LogoKey", "AREA", (ox, -2.2, 2.2), lg, 120, (0.05, 1, 0.4), rot=(math.radians(70), 0, 0), size=1.4)
    add_light("LogoFill", "AREA", (ox + 1.5, -1.4, 1.6), lg, 40, (0.4, 0.5, 1), rot=(math.radians(50), 0, math.radians(20)), size=1.0)
    add_light("LogoBack", "POINT", (ox, 1.2, 1.8), lg, 90, (0.05, 1, 0.4))
    return (ox, 0, 1.4)


def add_camera(name, loc, target, lens, fstop=None):
    cam = bpy.data.cameras.new(name)
    cam.lens = lens
    cam.sensor_width = 36
    cam.sensor_fit = "VERTICAL"
    cam.clip_start = 0.02
    cam.clip_end = 200
    cam.dof.use_dof = bool(fstop)
    if fstop:
        cam.dof.aperture_fstop = fstop
        cam.dof.focus_distance = (Vector(target) - Vector(loc)).length
    obj = bpy.data.objects.new(name, cam)
    obj.location = loc
    look_at(obj, target)
    coll("CAMERAS").objects.link(obj)
    return obj


def setup_cameras():
    hook = add_camera("CAM_HOOK", (-0.07, -0.16, 0.86), (0, 0.01, 0.773), 35, 1.6)
    kf(hook, "location", 1, (-0.09, -0.18, 0.88))
    look_at(hook, (0, 0.01, 0.773))
    hook.keyframe_insert("rotation_euler", frame=1)
    kf(hook, "location", 60, (-0.03, -0.11, 0.84))
    look_at(hook, (0, 0.02, 0.773))
    hook.keyframe_insert("rotation_euler", frame=60)

    street = add_camera("CAM_STREET", (18.0, -14.0, 0.38), (18.0, -8.0, 0.6), 24, 2.4)
    kf(street, "location", 61, (16.6, -14.5, 0.32))
    street.rotation_euler = (math.radians(82), math.radians(6), math.radians(8))
    street.keyframe_insert("rotation_euler", frame=61)
    kf(street, "location", 150, (16.8, 8.0, 0.42))
    street.rotation_euler = (math.radians(78), math.radians(4), math.radians(-4))
    street.keyframe_insert("rotation_euler", frame=150)

    phone = add_camera("CAM_PHONE", (0.12, -0.18, 0.92), (0, 0, 0.77), 50, 2.0)
    kf(phone, "location", 151, (0.14, -0.20, 0.90))
    look_at(phone, (0, 0, 0.77))
    phone.keyframe_insert("rotation_euler", frame=151)
    kf(phone, "location", 240, (-0.10, -0.16, 0.95))
    look_at(phone, (0, 0.01, 0.77))
    phone.keyframe_insert("rotation_euler", frame=240)

    door = add_camera("CAM_DOOR", (40.0, -1.35, 1.15), (40.0, 0.7, 0.55), 35, 2.2)
    kf(door, "location", 241, (39.6, -1.5, 1.25))
    look_at(door, (40.0, 0.7, 0.5))
    door.keyframe_insert("rotation_euler", frame=241)
    kf(door, "location", 312, (40.15, -0.95, 0.95))
    look_at(door, (40.0, 0.55, 0.35))
    door.keyframe_insert("rotation_euler", frame=312)

    end = add_camera("CAM_END", (62.0, -3.4, 1.55), (62.0, 0, 1.45), 45)
    kf(end, "location", 313, (62.0, -3.6, 1.5))
    look_at(end, (62.0, 0, 1.4))
    end.keyframe_insert("rotation_euler", frame=313)
    kf(end, "location", 360, (62.0, -2.5, 1.48))
    look_at(end, (62.0, 0, 1.42))
    end.keyframe_insert("rotation_euler", frame=360)

    scene = bpy.context.scene
    scene.camera = hook
    scene.timeline_markers.clear()
    cams = {o.name: o for o in coll("CAMERAS").objects}
    for name, frame in SHOTS:
        m = scene.timeline_markers.new(name, frame=frame)
        m.camera = cams[name]
    return cams


def caption(cam, name, body, y=-0.28, z=-0.92, size=0.05, start=1, end=60):
    txt = make_text(name, body, size, coll("TEXT"), (0, y, z), GREEN_LIN, 0.0015)
    txt.parent = cam
    kf(txt, "hide_render", 1, True, "CONSTANT")
    kf(txt, "hide_render", start, False, "CONSTANT")
    kf(txt, "hide_render", end, True, "CONSTANT")
    return txt


def setup_captions(cams):
    caption(cams["CAM_HOOK"], "TX_HOOK", "MOS DIL NATËN", y=-0.32, z=-0.95, size=0.055, start=8, end=60)
    caption(cams["CAM_STREET"], "TX_STREET", "Operatori ta sjell tani", y=-0.34, z=-0.95, size=0.042, start=70, end=150)
    caption(cams["CAM_PHONE"], "TX_PHONE", "te dera", y=-0.33, z=-0.95, size=0.06, start=160, end=240)
    caption(cams["CAM_DOOR"], "TX_DOOR", "Pagesa në dorëzim", y=-0.34, z=-0.95, size=0.04, start=250, end=312)
    caption(cams["CAM_END"], "TX_URL", "vndviti.com", y=-0.22, z=-0.95, size=0.048, start=318, end=360)
    caption(cams["CAM_END"], "TX_HOURS", "14:00–23:00  ·  Viti", y=-0.34, z=-0.95, size=0.028, start=326, end=360)


def main():
    scene = reset_scene()
    setup_render(scene)
    notify = load_img(os.path.join(ROOT, "phone-notify.png"))
    shop = load_img(os.path.join(ROOT, "phone-shop.png"))
    build_phone_set(notify, shop)
    build_street_set()
    build_door_set()
    build_logo()
    cams = setup_cameras()
    setup_captions(cams)
    bpy.ops.wm.save_as_mainfile(filepath=BLEND)
    print("BUILT", BLEND)
    print("objects", len(bpy.data.objects), "cameras", list(cams))


main()
