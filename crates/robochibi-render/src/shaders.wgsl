// ============================================================================
// RoboChibiLand Unified WGSL Shaders (Vulkan + WebGPU + WebGL2 Compatible)
// ============================================================================

struct GlobalUniforms {
    view_proj: mat4x4<f32>,
    light_view_proj: mat4x4<f32>,
    cam_pos: vec4<f32>,            // xyz = camera world pos, w = sun intensity
    sun_dir: vec4<f32>,            // xyz = normalized direction toward sun, w = elapsed_time
    sun_color: vec4<f32>,          // rgb = sun light color, w = ambient multiplier
    ambient_sky: vec4<f32>,        // rgb = sky hemisphere ambient, w = hemisphere blend
    ambient_ground: vec4<f32>,     // rgb = ground bounce color, w = fog density
    fog_color: vec4<f32>,          // rgb = horizon/fog color, w = disco intensity (0..1)
    disco_pos_col: vec4<f32>,      // xyz = disco center, w = disco hue phase
    sky_zenith: vec4<f32>,         // rgb = sky zenith color, w = underwater tint (0..1)
};

@group(0) @binding(0)
var<uniform> u_global: GlobalUniforms;

@group(1) @binding(0)
var t_diffuse: texture_2d<f32>;
@group(1) @binding(1)
var s_diffuse: sampler;
@group(1) @binding(2)
var t_shadow: texture_depth_2d;
@group(1) @binding(3)
var s_shadow: sampler_comparison;

struct VertexIn {
    @location(0) pos: vec3<f32>,
    @location(1) normal: vec3<f32>,
    @location(2) uv: vec2<f32>,
    @location(3) color: vec4<f32>,
    @location(4) mat_params: vec4<f32>, // [roughness, metalness, emissive, clearcoat]
};

struct InstanceIn {
    @location(5) m0: vec4<f32>,
    @location(6) m1: vec4<f32>,
    @location(7) m2: vec4<f32>,
    @location(8) m3: vec4<f32>,
    @location(9) tint: vec4<f32>,
    @location(10) extra: vec4<f32>, // [emissive_boost, water_wave_flag, unlit_flag, specular_scale]
};

struct VsOut {
    @builtin(position) clip_pos: vec4<f32>,
    @location(0) world_pos: vec3<f32>,
    @location(1) world_normal: vec3<f32>,
    @location(2) uv: vec2<f32>,
    @location(3) color: vec4<f32>,
    @location(4) mat_params: vec4<f32>,
    @location(5) extra: vec4<f32>,
    @location(6) shadow_pos: vec4<f32>,
};

fn build_model(inst: InstanceIn) -> mat4x4<f32> {
    return mat4x4<f32>(inst.m0, inst.m1, inst.m2, inst.m3);
}

// ----------------------------------------------------------------------------
// Pass 1: Directional Shadow Map Vertex Shader
// ----------------------------------------------------------------------------
@vertex
fn vs_shadow(vert: VertexIn, inst: InstanceIn) -> @builtin(position) vec4<f32> {
    let model = build_model(inst);
    let world_pos = model * vec4<f32>(vert.pos, 1.0);
    return u_global.light_view_proj * world_pos;
}

// ----------------------------------------------------------------------------
// Pass 2: Main 3D PBR + Stylized Shader
// ----------------------------------------------------------------------------
@vertex
fn vs_main(vert: VertexIn, inst: InstanceIn) -> VsOut {
    var out: VsOut;
    let model = build_model(inst);
    var local_pos = vert.pos;
    var local_normal = vert.normal;

    // Gentle vertex ripple for Lake of Crystal water surface
    if (inst.extra.y > 0.5) {
        let t = u_global.sun_dir.w;
        let w1 = sin(local_pos.x * 0.25 + t * 2.1) * 0.08;
        let w2 = cos(local_pos.y * 0.28 + t * 1.7) * 0.07;
        local_pos.z += w1 + w2;
    }

    let wp = model * vec4<f32>(local_pos, 1.0);
    let n3 = mat3x3<f32>(
        inst.m0.xyz,
        inst.m1.xyz,
        inst.m2.xyz,
    ) * local_normal;

    out.clip_pos = u_global.view_proj * wp;
    out.world_pos = wp.xyz;
    out.world_normal = normalize(n3 + vec3<f32>(0.0, 1e-5, 0.0));
    out.uv = vert.uv;
    out.color = vert.color * inst.tint;
    out.mat_params = vert.mat_params;
    out.extra = inst.extra;
    out.shadow_pos = u_global.light_view_proj * wp;
    return out;
}

fn calc_shadow(shadow_pos: vec4<f32>, ndotl: f32) -> f32 {
    let proj = shadow_pos.xyz / max(shadow_pos.w, 1e-5);
    let uv = vec2<f32>(proj.x * 0.5 + 0.5, -proj.y * 0.5 + 0.5);
    let bias = max(0.0012 * (1.0 - ndotl), 0.0004);
    let clamped_uv = clamp(uv, vec2<f32>(0.002), vec2<f32>(0.998));
    let cmp_depth = clamp(proj.z - bias, 0.0, 1.0);

    // Unconditional textureSampleCompare in uniform control flow (WebGL2 strict requirement!)
    let s0 = textureSampleCompare(t_shadow, s_shadow, clamped_uv, cmp_depth);
    let texel = 1.0 / 1024.0;
    let s1 = textureSampleCompare(t_shadow, s_shadow, clamp(clamped_uv + vec2<f32>(texel, 0.0), vec2<f32>(0.001), vec2<f32>(0.999)), cmp_depth);
    let s2 = textureSampleCompare(t_shadow, s_shadow, clamp(clamped_uv + vec2<f32>(-texel, 0.0), vec2<f32>(0.001), vec2<f32>(0.999)), cmp_depth);
    let s3 = textureSampleCompare(t_shadow, s_shadow, clamp(clamped_uv + vec2<f32>(0.0, texel), vec2<f32>(0.001), vec2<f32>(0.999)), cmp_depth);
    let s4 = textureSampleCompare(t_shadow, s_shadow, clamp(clamped_uv + vec2<f32>(0.0, -texel), vec2<f32>(0.001), vec2<f32>(0.999)), cmp_depth);
    let pcf = (s0 + s1 + s2 + s3 + s4) * 0.2;

    let in_bounds = uv.x >= 0.002 && uv.x <= 0.998 && uv.y >= 0.002 && uv.y <= 0.998 && proj.z >= 0.0 && proj.z <= 1.0;
    return select(1.0, pcf, in_bounds);
}

fn hsv_to_rgb(h: f32, s: f32, v: f32) -> vec3<f32> {
    let k = fract(vec3<f32>(1.0, 2.0 / 3.0, 1.0 / 3.0) + h);
    let p = abs(k * 6.0 - 3.0);
    let rgb = clamp(p - 1.0, vec3<f32>(0.0), vec3<f32>(1.0));
    return v * mix(vec3<f32>(1.0), rgb, s);
}

@fragment
fn fs_main(in: VsOut) -> @location(0) vec4<f32> {
    var uv = in.uv;
    if (in.extra.y > 0.5) {
        let t = u_global.sun_dir.w;
        uv = in.uv * 4.0 + vec2<f32>(t * 0.03, -t * 0.022);
    }
    let tex_sample = textureSample(t_diffuse, s_diffuse, uv);

    let N = normalize(in.world_normal);
    let V = normalize(u_global.cam_pos.xyz - in.world_pos);
    let L = normalize(u_global.sun_dir.xyz);
    let ndotl = max(dot(N, L), 0.0);

    // Shadow evaluation unconditionally before any branch
    let shadow = calc_shadow(in.shadow_pos, ndotl);

    // Sky dome gradient or unlit elements bypass PBR shading
    if (in.extra.z > 0.5) {
        if (in.extra.z > 1.5) {
            // Sky dome atmospheric vertical gradient
            let h = clamp(normalize(in.world_pos - u_global.cam_pos.xyz).y, 0.0, 1.0);
            let sky_col = mix(u_global.fog_color.rgb, u_global.sky_zenith.rgb, pow(h, 0.62));
            return vec4<f32>(sky_col, 1.0);
        }
        return vec4<f32>(tex_sample.rgb * in.color.rgb * (1.0 + in.extra.x), tex_sample.a * in.color.a);
    }

    var albedo = tex_sample.rgb * in.color.rgb;
    var alpha = tex_sample.a * in.color.a;
    if (alpha < 0.02) {
        discard;
    }

    let roughness = clamp(in.mat_params.x, 0.06, 1.0);
    let metalness = clamp(in.mat_params.y, 0.0, 1.0);
    let emissive_val = in.mat_params.z + in.extra.x;
    let clearcoat = clamp(in.mat_params.w, 0.0, 1.0);

    // Water Fresnel + animated shimmer boost
    if (in.extra.y > 0.5) {
        let fresnel = pow(1.0 - max(dot(N, V), 0.0), 3.0);
        albedo = mix(albedo * vec3<f32>(0.15, 0.72, 0.96), u_global.sky_zenith.rgb * 0.9 + vec3<f32>(0.2, 0.65, 0.85), fresnel * 0.72);
        alpha = mix(0.76, 0.96, fresnel);
    }

    // Hemisphere ambient lighting
    let hemi = dot(N, vec3<f32>(0.0, 1.0, 0.0)) * 0.5 + 0.5;
    let ambient = mix(u_global.ambient_ground.rgb, u_global.ambient_sky.rgb, hemi) * u_global.sun_color.w;

    // Stylized Cook-Torrance specular highlight + clearcoat sheen
    let H = normalize(L + V);
    let ndoth = max(dot(N, H), 0.0);
    let shininess = mix(128.0, 6.0, roughness * roughness);
    let spec_pow = pow(ndoth, shininess);
    let fresnel_spec = mix(vec3<f32>(0.04), albedo, metalness);
    let spec = fresnel_spec * spec_pow * (1.0 - roughness * 0.65) * in.extra.w;
    let coat = vec3<f32>(0.35) * pow(ndoth, 96.0) * clearcoat;

    let sun_contrib = u_global.sun_color.rgb * u_global.cam_pos.w * (ndotl * albedo * (1.0 - metalness * 0.65) + spec + coat) * shadow;

    // Dynamic Cyber Disco Pad point light!
    var disco_contrib = vec3<f32>(0.0);
    let disco_i = u_global.fog_color.w;
    if (disco_i > 0.01) {
        let to_disco = u_global.disco_pos_col.xyz - in.world_pos;
        let d2 = dot(to_disco, to_disco);
        if (d2 < 650.0) {
            let d_dir = normalize(to_disco);
            let atten = clamp(1.0 - d2 / 650.0, 0.0, 1.0);
            let d_col = hsv_to_rgb(u_global.disco_pos_col.w, 0.92, 1.0);
            disco_contrib = d_col * albedo * max(dot(N, d_dir), 0.25) * atten * atten * 2.2 * disco_i;
        }
    }

    // Subtle cyber rim light for clear silhouette readability
    let rim = pow(1.0 - max(dot(N, V), 0.0), 3.4) * 0.14 * u_global.ambient_sky.rgb;

    var lit = ambient * albedo + sun_contrib + disco_contrib + rim + albedo * emissive_val;

    // Exponential distance atmospheric fog (matches original scene scale 260..340m)
    let dist = length(in.world_pos - u_global.cam_pos.xyz);
    let fog_density = u_global.ambient_ground.w;
    let fog_factor = 1.0 - exp(-pow(dist * fog_density, 2.0));
    lit = mix(lit, u_global.fog_color.rgb, clamp(fog_factor, 0.0, 0.95));

    return vec4<f32>(lit, alpha);
}

// ----------------------------------------------------------------------------
// Pass 3: Full-Screen Optical Post-FX & Tone Mapping
// ----------------------------------------------------------------------------
struct PostFxUniforms {
    params: vec4<f32>, // [mode (0=Normal,1=Crt,2=NV,3=Thermal,4=Cinema), time, aspect, needs_gamma]
    tint: vec4<f32>,   // [underwater, speed_fx, 0, 0]
};

@group(0) @binding(0)
var<uniform> u_post: PostFxUniforms;
@group(0) @binding(1)
var t_scene: texture_2d<f32>;
@group(0) @binding(2)
var s_scene: sampler;

struct PostOut {
    @builtin(position) clip_pos: vec4<f32>,
    @location(0) uv: vec2<f32>,
};

@vertex
fn vs_post(@builtin(vertex_index) vid: u32) -> PostOut {
    // Full-screen triangle
    let x = f32((vid << 1u) & 2u);
    let y = f32(vid & 2u);
    var out: PostOut;
    out.clip_pos = vec4<f32>(x * 2.0 - 1.0, y * 2.0 - 1.0, 0.0, 1.0);
    out.uv = vec2<f32>(x, 1.0 - y);
    return out;
}

fn aces_tonemap(x: vec3<f32>) -> vec3<f32> {
    let a = 2.51;
    let b = 0.03;
    let c = 2.43;
    let d = 0.59;
    let e = 0.14;
    return clamp((x * (a * x + b)) / (x * (c * x + d) + e), vec3<f32>(0.0), vec3<f32>(1.0));
}

fn thermal_palette(luma: f32) -> vec3<f32> {
    let t = clamp(luma * 1.15, 0.0, 1.0);
    let c0 = vec3<f32>(0.06, 0.02, 0.25);
    let c1 = vec3<f32>(0.65, 0.05, 0.55);
    let c2 = vec3<f32>(0.98, 0.42, 0.05);
    let c3 = vec3<f32>(1.0, 0.98, 0.58);
    if (t < 0.35) {
        return mix(c0, c1, t / 0.35);
    } else if (t < 0.7) {
        return mix(c1, c2, (t - 0.35) / 0.35);
    }
    return mix(c2, c3, (t - 0.7) / 0.3);
}

@fragment
fn fs_post(in: PostOut) -> @location(0) vec4<f32> {
    let mode = i32(u_post.params.x + 0.5);
    let time = u_post.params.y;
    var uv = in.uv;

    // Subtle CRT barrel distortion + chromatic split when mode == 1
    var col = textureSample(t_scene, s_scene, uv).rgb;
    if (mode == 1) {
        let centered = uv - 0.5;
        let r2 = dot(centered, centered);
        let crt_uv = centered * (1.0 + 0.14 * r2) + 0.5;
        let off = 0.0022;
        let r_c = textureSample(t_scene, s_scene, clamp(crt_uv + vec2<f32>(off, 0.0), vec2<f32>(0.0), vec2<f32>(1.0))).r;
        let g_c = textureSample(t_scene, s_scene, clamp(crt_uv, vec2<f32>(0.0), vec2<f32>(1.0))).g;
        let b_c = textureSample(t_scene, s_scene, clamp(crt_uv - vec2<f32>(off, 0.0), vec2<f32>(0.0), vec2<f32>(1.0))).b;
        col = vec3<f32>(r_c, g_c, b_c);
        let scan = 0.86 + 0.14 * sin(crt_uv.y * 540.0 + time * 10.0);
        col *= scan;
        if (crt_uv.x < 0.0 || crt_uv.x > 1.0 || crt_uv.y < 0.0 || crt_uv.y > 1.0) {
            col = vec3<f32>(0.01, 0.02, 0.03);
        }
    }

    col = aces_tonemap(col * 1.05);

    if (u_post.tint.x > 0.05) {
        // Underwater blue-cyan caustic veil
        let wave = sin(uv.x * 24.0 + time * 3.0) * sin(uv.y * 20.0 - time * 2.5) * 0.04;
        col = mix(col, vec3<f32>(0.04, 0.45, 0.68) + wave, clamp(u_post.tint.x * 0.42, 0.0, 0.48));
    }

    let luma = dot(col, vec3<f32>(0.2126, 0.7152, 0.0722));
    if (mode == 2) {
        // Night Vision Phosphor Green
        let noise = fract(sin(dot(uv + fract(time), vec2<f32>(12.9898, 78.233))) * 43758.5453);
        let nv = pow(clamp(luma * 1.65, 0.0, 1.0), 0.75) * (0.9 + 0.1 * noise);
        let scan = 0.92 + 0.08 * sin(uv.y * 420.0);
        col = vec3<f32>(0.08, 1.0, 0.34) * nv * scan;
        let vig = 1.0 - smoothstep(0.32, 0.78, length(uv - 0.5));
        col *= vig;
    } else if (mode == 3) {
        // Thermal Infrared
        col = thermal_palette(luma);
    } else if (mode == 4) {
        // Cinema Letterbox + subtle vignette
        col = pow(col, vec3<f32>(1.06)) * vec3<f32>(1.04, 1.0, 0.95);
        let vig = 1.0 - smoothstep(0.45, 0.92, length(uv - 0.5)) * 0.25;
        col *= vig;
        if (uv.y < 0.105 || uv.y > 0.895) {
            col = vec3<f32>(0.0, 0.0, 0.0);
        }
    }

    if (u_post.params.w > 0.5) {
        col = pow(clamp(col, vec3<f32>(0.0), vec3<f32>(1.0)), vec3<f32>(1.0 / 2.2));
    }
    return vec4<f32>(col, 1.0);
}
