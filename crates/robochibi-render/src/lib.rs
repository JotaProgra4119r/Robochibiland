use bytemuck::{Pod, Zeroable};
use glam::camera::rh::{
    proj::directx::{orthographic, perspective},
    view::look_at_mat4,
};
use glam::{EulerRot, Mat4, Vec3};
use robochibi_core::mesh::{box_mesh, hex_to_rgba, plane_mesh, sphere_mesh, torus_mesh, MatStyle};
use robochibi_core::textures::TextureRgba;
use robochibi_core::world::TreasureKind;
use robochibi_core::{
    ChibiRobotDog, MeshData, OpticalFilter, ProceduralTextures, RobotId, RobotMeshSet,
    SimulationEngine, TimeOfDay, Vertex, WeatherMode, FACE_H, FACE_W, LAKE_CENTER_X,
    LAKE_CENTER_Z,
};
use std::collections::HashMap;
use std::num::NonZeroU64;

pub const SHADOW_MAP_SIZE: u32 = 1024;
pub const PIP_WIDTH: u32 = 256;
pub const PIP_HEIGHT: u32 = 144;

#[repr(C)]
#[derive(Copy, Clone, Debug, Pod, Zeroable)]
pub struct GpuInstance {
    pub m0: [f32; 4],
    pub m1: [f32; 4],
    pub m2: [f32; 4],
    pub m3: [f32; 4],
    pub tint: [f32; 4],
    /// [emissive_boost, water_wave_flag, unlit_flag (1=unlit, 2=sky_dome), specular_scale]
    pub extra: [f32; 4],
}

impl GpuInstance {
    pub fn from_mat(model: Mat4, tint: [f32; 4], extra: [f32; 4]) -> Self {
        let cols = model.to_cols_array_2d();
        Self {
            m0: cols[0],
            m1: cols[1],
            m2: cols[2],
            m3: cols[3],
            tint,
            extra,
        }
    }

    pub const LAYOUT: wgpu::VertexBufferLayout<'static> = wgpu::VertexBufferLayout {
        array_stride: std::mem::size_of::<Self>() as wgpu::BufferAddress,
        step_mode: wgpu::VertexStepMode::Instance,
        attributes: &wgpu::vertex_attr_array![
            5 => Float32x4,
            6 => Float32x4,
            7 => Float32x4,
            8 => Float32x4,
            9 => Float32x4,
            10 => Float32x4,
        ],
    };
}

const VERTEX_LAYOUT: wgpu::VertexBufferLayout<'static> = wgpu::VertexBufferLayout {
    array_stride: std::mem::size_of::<Vertex>() as wgpu::BufferAddress,
    step_mode: wgpu::VertexStepMode::Vertex,
    attributes: &wgpu::vertex_attr_array![
        0 => Float32x3,
        1 => Float32x3,
        2 => Float32x2,
        3 => Float32x4,
        4 => Float32x4,
    ],
};

#[repr(C)]
#[derive(Copy, Clone, Debug, Pod, Zeroable)]
struct GlobalUniforms {
    view_proj: [[f32; 4]; 4],
    light_view_proj: [[f32; 4]; 4],
    cam_pos: [f32; 4],
    sun_dir: [f32; 4],
    sun_color: [f32; 4],
    ambient_sky: [f32; 4],
    ambient_ground: [f32; 4],
    fog_color: [f32; 4],
    disco_pos_col: [f32; 4],
    sky_zenith: [f32; 4],
}

#[repr(C)]
#[derive(Copy, Clone, Debug, Pod, Zeroable)]
struct PostFxUniforms {
    /// [mode, time, aspect, needs_gamma]
    params: [f32; 4],
    /// [underwater, speed_fx, 0, 0]
    tint: [f32; 4],
}

struct GpuMesh {
    vertex_buf: wgpu::Buffer,
    index_buf: wgpu::Buffer,
    index_count: u32,
}

#[derive(Copy, Clone, Debug, Eq, PartialEq, Hash)]
enum TexKey {
    White,
    Grass,
    Soccer,
    Wood,
    Tartan,
    Cobblestone,
    Water,
    Face(usize),
}

#[derive(Copy, Clone, Debug, Eq, PartialEq, Hash)]
enum MeshKey {
    Terrain,
    PlazaAndPaths,
    WoodStructures,
    TartanFloor,
    StaticProps,
    WireframeNet,
    WaterDisc,
    FountainWater,
    ToyBoat,
    BoatPropeller,
    CarouselRotor,
    SeesawPlank,
    TrampolineMat,
    DiscoBall,
    DiscoTile,
    TargetRotor,
    PinataBody,
    FountainJet,
    SoccerBall,
    ColorBall,
    BoneToy,
    Snack,
    TreasureMound,
    TreasureSparkle,
    TreasureBone,
    TreasureGear,
    TreasureGem,
    TreeTrunk,
    TreeFoliage,
    TreeCyberRing,
    Flower,
    Butterfly,
    Cloud,
    SparkleQuad,
    SkyDome,
    SunOrb,
    MoonOrb,
    WaypointHalo,
    UnitBox,
    UnitSphere,
    RobotTorso(usize),
    RobotTurbine(usize),
    RobotHead(usize),
    RobotFace(usize),
    RobotEar(usize),
    RobotTail(usize),
    RobotUpperLegL(usize),
    RobotUpperLegR(usize),
    RobotLowerLeg(usize),
    RobotPaw(usize),
    RobotHalo(usize),
    RobotSparkyNeedle(usize),
    RobotBoltFlame(usize),
    RobotPixelDish(usize),
    RobotLunaWingL(usize),
    RobotLunaWingR(usize),
    RobotRustyProp(usize),
}

struct DrawBatch {
    mesh: MeshKey,
    tex: TexKey,
    transparent: bool,
    shadow_caster: bool,
    no_depth_write: bool,
    skip_in_pip: bool,
    start: u32,
    count: u32,
}

fn create_buffer_with_bytes(
    device: &wgpu::Device,
    label: &str,
    data: &[u8],
    usage: wgpu::BufferUsages,
) -> wgpu::Buffer {
    let padded_len = ((data.len().max(4) + 3) & !3) as u64;
    let buf = device.create_buffer(&wgpu::BufferDescriptor {
        label: Some(label),
        size: padded_len,
        usage,
        mapped_at_creation: true,
    });
    if !data.is_empty() {
        let mut view = buf
            .slice(..data.len() as u64)
            .get_mapped_range_mut()
            .expect("mapped buffer");
        view.copy_from_slice(data);
    }
    buf.unmap();
    buf
}

fn upload_mesh(device: &wgpu::Device, label: &str, mesh: &MeshData) -> Option<GpuMesh> {
    if mesh.indices.is_empty() || mesh.vertices.is_empty() {
        return None;
    }
    let vertex_buf = create_buffer_with_bytes(
        device,
        label,
        bytemuck::cast_slice(&mesh.vertices),
        wgpu::BufferUsages::VERTEX,
    );
    let index_buf = create_buffer_with_bytes(
        device,
        label,
        bytemuck::cast_slice(&mesh.indices),
        wgpu::BufferUsages::INDEX,
    );
    Some(GpuMesh {
        vertex_buf,
        index_buf,
        index_count: mesh.indices.len() as u32,
    })
}

fn upload_texture(
    device: &wgpu::Device,
    queue: &wgpu::Queue,
    label: &str,
    tex: &TextureRgba,
) -> (wgpu::Texture, wgpu::TextureView) {
    let texture = device.create_texture(&wgpu::TextureDescriptor {
        label: Some(label),
        size: wgpu::Extent3d {
            width: tex.width,
            height: tex.height,
            depth_or_array_layers: 1,
        },
        mip_level_count: 1,
        sample_count: 1,
        dimension: wgpu::TextureDimension::D2,
        format: wgpu::TextureFormat::Rgba8Unorm,
        usage: wgpu::TextureUsages::TEXTURE_BINDING | wgpu::TextureUsages::COPY_DST,
        view_formats: &[],
    });
    queue.write_texture(
        wgpu::TexelCopyTextureInfo {
            texture: &texture,
            mip_level: 0,
            origin: wgpu::Origin3d::ZERO,
            aspect: wgpu::TextureAspect::All,
        },
        &tex.data,
        wgpu::TexelCopyBufferLayout {
            offset: 0,
            bytes_per_row: Some(4 * tex.width),
            rows_per_image: Some(tex.height),
        },
        wgpu::Extent3d {
            width: tex.width,
            height: tex.height,
            depth_or_array_layers: 1,
        },
    );
    let view = texture.create_view(&wgpu::TextureViewDescriptor::default());
    (texture, view)
}

fn create_material_bind_group(
    device: &wgpu::Device,
    layout: &wgpu::BindGroupLayout,
    tex_view: &wgpu::TextureView,
    sampler: &wgpu::Sampler,
    shadow_view: &wgpu::TextureView,
    shadow_sampler: &wgpu::Sampler,
    label: &str,
) -> wgpu::BindGroup {
    device.create_bind_group(&wgpu::BindGroupDescriptor {
        label: Some(label),
        layout,
        entries: &[
            wgpu::BindGroupEntry {
                binding: 0,
                resource: wgpu::BindingResource::TextureView(tex_view),
            },
            wgpu::BindGroupEntry {
                binding: 1,
                resource: wgpu::BindingResource::Sampler(sampler),
            },
            wgpu::BindGroupEntry {
                binding: 2,
                resource: wgpu::BindingResource::TextureView(shadow_view),
            },
            wgpu::BindGroupEntry {
                binding: 3,
                resource: wgpu::BindingResource::Sampler(shadow_sampler),
            },
        ],
    })
}

pub struct RoboRenderer {
    surface_format: wgpu::TextureFormat,
    width: u32,
    height: u32,

    // Pipelines
    shadow_pipeline: wgpu::RenderPipeline,
    opaque_pipeline: wgpu::RenderPipeline,
    sky_pipeline: wgpu::RenderPipeline,
    transparent_pipeline: wgpu::RenderPipeline,
    post_pipeline: wgpu::RenderPipeline,
    pip_post_pipeline: wgpu::RenderPipeline,

    // Uniform buffers & bind groups
    global_uniform_buf: wgpu::Buffer,
    global_bind_group: wgpu::BindGroup,
    pip_global_uniform_buf: wgpu::Buffer,
    pip_global_bind_group: wgpu::BindGroup,

    post_layout: wgpu::BindGroupLayout,
    post_uniform_buf: wgpu::Buffer,
    post_bind_group: wgpu::BindGroup,
    pip_post_uniform_buf: wgpu::Buffer,
    pip_post_bind_group: wgpu::BindGroup,
    linear_clamp_sampler: wgpu::Sampler,

    // Textures & framebuffers
    scene_color_tex: wgpu::Texture,
    scene_color_view: wgpu::TextureView,
    scene_depth_tex: wgpu::Texture,
    scene_depth_view: wgpu::TextureView,

    _shadow_tex: wgpu::Texture,
    shadow_view: wgpu::TextureView,

    _pip_scene_tex: wgpu::Texture,
    pip_scene_view: wgpu::TextureView,
    _pip_depth_tex: wgpu::Texture,
    pip_depth_view: wgpu::TextureView,
    pip_final_tex: wgpu::Texture,
    pub pip_final_view: wgpu::TextureView,

    // Textures + bind groups
    face_textures: [wgpu::Texture; 5],
    material_bgs: HashMap<TexKey, wgpu::BindGroup>,

    // Meshes
    meshes: HashMap<MeshKey, GpuMesh>,

    // Dynamic Instance buffer & CPU scratch staging
    instance_buf: wgpu::Buffer,
    instance_capacity: usize,
    instances_scratch: Vec<GpuInstance>,
    batches_scratch: Vec<DrawBatch>,
}

impl RoboRenderer {
    pub fn new(
        device: &wgpu::Device,
        queue: &wgpu::Queue,
        surface_format: wgpu::TextureFormat,
        width: u32,
        height: u32,
        engine: &SimulationEngine,
    ) -> Self {
        let width = width.max(1);
        let height = height.max(1);

        let shader = device.create_shader_module(wgpu::ShaderModuleDescriptor {
            label: Some("robochibi_main_shader"),
            source: wgpu::ShaderSource::Wgsl(include_str!("shaders.wgsl").into()),
        });

        let global_layout = device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
            label: Some("global_uniform_layout"),
            entries: &[wgpu::BindGroupLayoutEntry {
                binding: 0,
                visibility: wgpu::ShaderStages::VERTEX_FRAGMENT,
                ty: wgpu::BindingType::Buffer {
                    ty: wgpu::BufferBindingType::Uniform,
                    has_dynamic_offset: false,
                    min_binding_size: NonZeroU64::new(std::mem::size_of::<GlobalUniforms>() as u64),
                },
                count: None,
            }],
        });

        let material_layout = device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
            label: Some("material_layout"),
            entries: &[
                wgpu::BindGroupLayoutEntry {
                    binding: 0,
                    visibility: wgpu::ShaderStages::FRAGMENT,
                    ty: wgpu::BindingType::Texture {
                        sample_type: wgpu::TextureSampleType::Float { filterable: true },
                        view_dimension: wgpu::TextureViewDimension::D2,
                        multisampled: false,
                    },
                    count: None,
                },
                wgpu::BindGroupLayoutEntry {
                    binding: 1,
                    visibility: wgpu::ShaderStages::FRAGMENT,
                    ty: wgpu::BindingType::Sampler(wgpu::SamplerBindingType::Filtering),
                    count: None,
                },
                wgpu::BindGroupLayoutEntry {
                    binding: 2,
                    visibility: wgpu::ShaderStages::FRAGMENT,
                    ty: wgpu::BindingType::Texture {
                        sample_type: wgpu::TextureSampleType::Depth,
                        view_dimension: wgpu::TextureViewDimension::D2,
                        multisampled: false,
                    },
                    count: None,
                },
                wgpu::BindGroupLayoutEntry {
                    binding: 3,
                    visibility: wgpu::ShaderStages::FRAGMENT,
                    ty: wgpu::BindingType::Sampler(wgpu::SamplerBindingType::Comparison),
                    count: None,
                },
            ],
        });

        let post_layout = device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
            label: Some("post_fx_layout"),
            entries: &[
                wgpu::BindGroupLayoutEntry {
                    binding: 0,
                    visibility: wgpu::ShaderStages::FRAGMENT,
                    ty: wgpu::BindingType::Buffer {
                        ty: wgpu::BufferBindingType::Uniform,
                        has_dynamic_offset: false,
                        min_binding_size: NonZeroU64::new(std::mem::size_of::<PostFxUniforms>() as u64),
                    },
                    count: None,
                },
                wgpu::BindGroupLayoutEntry {
                    binding: 1,
                    visibility: wgpu::ShaderStages::FRAGMENT,
                    ty: wgpu::BindingType::Texture {
                        sample_type: wgpu::TextureSampleType::Float { filterable: true },
                        view_dimension: wgpu::TextureViewDimension::D2,
                        multisampled: false,
                    },
                    count: None,
                },
                wgpu::BindGroupLayoutEntry {
                    binding: 2,
                    visibility: wgpu::ShaderStages::FRAGMENT,
                    ty: wgpu::BindingType::Sampler(wgpu::SamplerBindingType::Filtering),
                    count: None,
                },
            ],
        });

        let shadow_pipeline_layout = device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
            label: Some("shadow_pipeline_layout"),
            bind_group_layouts: &[Some(&global_layout)],
            immediate_size: 0,
        });

        let scene_pipeline_layout = device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
            label: Some("scene_pipeline_layout"),
            bind_group_layouts: &[Some(&global_layout), Some(&material_layout)],
            immediate_size: 0,
        });

        let post_pipeline_layout = device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
            label: Some("post_pipeline_layout"),
            bind_group_layouts: &[Some(&post_layout)],
            immediate_size: 0,
        });

        let shadow_pipeline = device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
            label: Some("shadow_pipeline"),
            layout: Some(&shadow_pipeline_layout),
            vertex: wgpu::VertexState {
                module: &shader,
                entry_point: Some("vs_shadow"),
                compilation_options: Default::default(),
                buffers: &[Some(VERTEX_LAYOUT), Some(GpuInstance::LAYOUT)],
            },
            primitive: wgpu::PrimitiveState {
                topology: wgpu::PrimitiveTopology::TriangleList,
                strip_index_format: None,
                front_face: wgpu::FrontFace::Ccw,
                cull_mode: Some(wgpu::Face::Back),
                unclipped_depth: false,
                polygon_mode: wgpu::PolygonMode::Fill,
                conservative: false,
            },
            depth_stencil: Some(wgpu::DepthStencilState {
                format: wgpu::TextureFormat::Depth32Float,
                depth_write_enabled: Some(true),
                depth_compare: Some(wgpu::CompareFunction::LessEqual),
                stencil: wgpu::StencilState::default(),
                bias: wgpu::DepthBiasState {
                    constant: 2,
                    slope_scale: 2.0,
                    clamp: 0.0,
                },
            }),
            multisample: wgpu::MultisampleState::default(),
            fragment: None,
            multiview_mask: None,
            cache: None,
        });

        let make_scene_pipeline = |label: &str,
                                   cull: Option<wgpu::Face>,
                                   depth_write: bool,
                                   blend: Option<wgpu::BlendState>| {
            device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
                label: Some(label),
                layout: Some(&scene_pipeline_layout),
                vertex: wgpu::VertexState {
                    module: &shader,
                    entry_point: Some("vs_main"),
                    compilation_options: Default::default(),
                    buffers: &[Some(VERTEX_LAYOUT), Some(GpuInstance::LAYOUT)],
                },
                primitive: wgpu::PrimitiveState {
                    topology: wgpu::PrimitiveTopology::TriangleList,
                    strip_index_format: None,
                    front_face: wgpu::FrontFace::Ccw,
                    cull_mode: cull,
                    unclipped_depth: false,
                    polygon_mode: wgpu::PolygonMode::Fill,
                    conservative: false,
                },
                depth_stencil: Some(wgpu::DepthStencilState {
                    format: wgpu::TextureFormat::Depth24Plus,
                    depth_write_enabled: Some(depth_write),
                    depth_compare: Some(wgpu::CompareFunction::LessEqual),
                    stencil: wgpu::StencilState::default(),
                    bias: wgpu::DepthBiasState::default(),
                }),
                multisample: wgpu::MultisampleState::default(),
                fragment: Some(wgpu::FragmentState {
                    module: &shader,
                    entry_point: Some("fs_main"),
                    compilation_options: Default::default(),
                    targets: &[Some(wgpu::ColorTargetState {
                        format: wgpu::TextureFormat::Rgba8Unorm,
                        blend,
                        write_mask: wgpu::ColorWrites::ALL,
                    })],
                }),
                multiview_mask: None,
                cache: None,
            })
        };

        let opaque_pipeline = make_scene_pipeline("opaque_pipeline", None, true, None);
        let sky_pipeline = make_scene_pipeline("sky_pipeline", None, false, None);
        let transparent_pipeline = make_scene_pipeline(
            "transparent_pipeline",
            None,
            false,
            Some(wgpu::BlendState::ALPHA_BLENDING),
        );

        let post_pipeline = device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
            label: Some("post_fx_pipeline"),
            layout: Some(&post_pipeline_layout),
            vertex: wgpu::VertexState {
                module: &shader,
                entry_point: Some("vs_post"),
                compilation_options: Default::default(),
                buffers: &[],
            },
            primitive: wgpu::PrimitiveState {
                topology: wgpu::PrimitiveTopology::TriangleList,
                ..Default::default()
            },
            depth_stencil: None,
            multisample: wgpu::MultisampleState::default(),
            fragment: Some(wgpu::FragmentState {
                module: &shader,
                entry_point: Some("fs_post"),
                compilation_options: Default::default(),
                targets: &[Some(wgpu::ColorTargetState {
                    format: surface_format,
                    blend: None,
                    write_mask: wgpu::ColorWrites::ALL,
                })],
            }),
            multiview_mask: None,
            cache: None,
        });

        let pip_post_pipeline = device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
            label: Some("pip_post_fx_pipeline"),
            layout: Some(&post_pipeline_layout),
            vertex: wgpu::VertexState {
                module: &shader,
                entry_point: Some("vs_post"),
                compilation_options: Default::default(),
                buffers: &[],
            },
            primitive: wgpu::PrimitiveState {
                topology: wgpu::PrimitiveTopology::TriangleList,
                ..Default::default()
            },
            depth_stencil: None,
            multisample: wgpu::MultisampleState::default(),
            fragment: Some(wgpu::FragmentState {
                module: &shader,
                entry_point: Some("fs_post"),
                compilation_options: Default::default(),
                targets: &[Some(wgpu::ColorTargetState {
                    format: wgpu::TextureFormat::Rgba8Unorm,
                    blend: None,
                    write_mask: wgpu::ColorWrites::ALL,
                })],
            }),
            multiview_mask: None,
            cache: None,
        });

        let zero_globals = GlobalUniforms {
            view_proj: Mat4::IDENTITY.to_cols_array_2d(),
            light_view_proj: Mat4::IDENTITY.to_cols_array_2d(),
            cam_pos: [0.0; 4],
            sun_dir: [0.5, 0.8, 0.3, 0.0],
            sun_color: [1.0; 4],
            ambient_sky: [0.5; 4],
            ambient_ground: [0.2; 4],
            fog_color: [0.7, 0.85, 0.95, 0.0],
            disco_pos_col: [0.0; 4],
            sky_zenith: [0.2, 0.6, 0.95, 0.0],
        };
        let global_uniform_buf = create_buffer_with_bytes(
            device,
            "global_uniforms",
            bytemuck::bytes_of(&zero_globals),
            wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST,
        );
        let pip_global_uniform_buf = create_buffer_with_bytes(
            device,
            "pip_global_uniforms",
            bytemuck::bytes_of(&zero_globals),
            wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST,
        );

        let global_bind_group = device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some("global_bg"),
            layout: &global_layout,
            entries: &[wgpu::BindGroupEntry {
                binding: 0,
                resource: global_uniform_buf.as_entire_binding(),
            }],
        });
        let pip_global_bind_group = device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some("pip_global_bg"),
            layout: &global_layout,
            entries: &[wgpu::BindGroupEntry {
                binding: 0,
                resource: pip_global_uniform_buf.as_entire_binding(),
            }],
        });

        // Samplers
        let repeat_sampler = device.create_sampler(&wgpu::SamplerDescriptor {
            label: Some("repeat_linear_sampler"),
            address_mode_u: wgpu::AddressMode::Repeat,
            address_mode_v: wgpu::AddressMode::Repeat,
            address_mode_w: wgpu::AddressMode::Repeat,
            mag_filter: wgpu::FilterMode::Linear,
            min_filter: wgpu::FilterMode::Linear,
            mipmap_filter: wgpu::MipmapFilterMode::Linear,
            ..Default::default()
        });
        let linear_clamp_sampler = device.create_sampler(&wgpu::SamplerDescriptor {
            label: Some("clamp_linear_sampler"),
            address_mode_u: wgpu::AddressMode::ClampToEdge,
            address_mode_v: wgpu::AddressMode::ClampToEdge,
            address_mode_w: wgpu::AddressMode::ClampToEdge,
            mag_filter: wgpu::FilterMode::Linear,
            min_filter: wgpu::FilterMode::Linear,
            ..Default::default()
        });
        let shadow_sampler = device.create_sampler(&wgpu::SamplerDescriptor {
            label: Some("shadow_cmp_sampler"),
            address_mode_u: wgpu::AddressMode::ClampToEdge,
            address_mode_v: wgpu::AddressMode::ClampToEdge,
            mag_filter: wgpu::FilterMode::Linear,
            min_filter: wgpu::FilterMode::Linear,
            compare: Some(wgpu::CompareFunction::LessEqual),
            ..Default::default()
        });

        // Shadow texture
        let shadow_tex = device.create_texture(&wgpu::TextureDescriptor {
            label: Some("shadow_map"),
            size: wgpu::Extent3d {
                width: SHADOW_MAP_SIZE,
                height: SHADOW_MAP_SIZE,
                depth_or_array_layers: 1,
            },
            mip_level_count: 1,
            sample_count: 1,
            dimension: wgpu::TextureDimension::D2,
            format: wgpu::TextureFormat::Depth32Float,
            usage: wgpu::TextureUsages::RENDER_ATTACHMENT | wgpu::TextureUsages::TEXTURE_BINDING,
            view_formats: &[],
        });
        let shadow_view = shadow_tex.create_view(&wgpu::TextureViewDescriptor::default());

        // Offscreen scene targets
        let (scene_color_tex, scene_color_view, scene_depth_tex, scene_depth_view) =
            Self::create_scene_targets(device, width, height);

        // Eye PIP targets
        let (pip_scene_tex, pip_scene_view, pip_depth_tex, pip_depth_view) =
            Self::create_scene_targets(device, PIP_WIDTH, PIP_HEIGHT);
        let pip_final_tex = device.create_texture(&wgpu::TextureDescriptor {
            label: Some("pip_final_tex"),
            size: wgpu::Extent3d {
                width: PIP_WIDTH,
                height: PIP_HEIGHT,
                depth_or_array_layers: 1,
            },
            mip_level_count: 1,
            sample_count: 1,
            dimension: wgpu::TextureDimension::D2,
            format: wgpu::TextureFormat::Rgba8Unorm,
            usage: wgpu::TextureUsages::RENDER_ATTACHMENT
                | wgpu::TextureUsages::TEXTURE_BINDING
                | wgpu::TextureUsages::COPY_SRC,
            view_formats: &[],
        });
        let pip_final_view = pip_final_tex.create_view(&wgpu::TextureViewDescriptor::default());

        let post_init = PostFxUniforms {
            params: [0.0, 0.0, width as f32 / height as f32, 0.0],
            tint: [0.0; 4],
        };
        let post_uniform_buf = create_buffer_with_bytes(
            device,
            "post_fx_uniforms",
            bytemuck::bytes_of(&post_init),
            wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST,
        );
        let pip_post_uniform_buf = create_buffer_with_bytes(
            device,
            "pip_post_fx_uniforms",
            bytemuck::bytes_of(&post_init),
            wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST,
        );
        let post_bind_group = Self::create_post_bg(
            device,
            &post_layout,
            &post_uniform_buf,
            &scene_color_view,
            &linear_clamp_sampler,
        );
        let pip_post_bind_group = Self::create_post_bg(
            device,
            &post_layout,
            &pip_post_uniform_buf,
            &pip_scene_view,
            &linear_clamp_sampler,
        );

        // Procedural & Face Textures
        let proc_tex = ProceduralTextures::generate_all();
        let mut material_bgs = HashMap::new();
        for (key, tex_data, name) in [
            (TexKey::White, &proc_tex.white, "tex_white"),
            (TexKey::Grass, &proc_tex.grass, "tex_grass"),
            (TexKey::Soccer, &proc_tex.soccer, "tex_soccer"),
            (TexKey::Wood, &proc_tex.wood, "tex_wood"),
            (TexKey::Tartan, &proc_tex.tartan, "tex_tartan"),
            (TexKey::Cobblestone, &proc_tex.cobblestone, "tex_cobble"),
            (TexKey::Water, &proc_tex.water, "tex_water"),
        ] {
            let (_tex, view) = upload_texture(device, queue, name, tex_data);
            material_bgs.insert(
                key,
                create_material_bind_group(
                    device,
                    &material_layout,
                    &view,
                    &repeat_sampler,
                    &shadow_view,
                    &shadow_sampler,
                    name,
                ),
            );
        }

        let face_textures: [wgpu::Texture; 5] = std::array::from_fn(|i| {
            let face_tex_data = TextureRgba {
                width: FACE_W as u32,
                height: FACE_H as u32,
                data: engine.pack.dogs[i].face.pixels.clone(),
            };
            let (tex, view) = upload_texture(device, queue, "dog_face", &face_tex_data);
            material_bgs.insert(
                TexKey::Face(i),
                create_material_bind_group(
                    device,
                    &material_layout,
                    &view,
                    &linear_clamp_sampler,
                    &shadow_view,
                    &shadow_sampler,
                    "bg_dog_face",
                ),
            );
            tex
        });

        // Build and upload all static World + Robot Meshes
        let mut meshes = HashMap::new();
        let static_world = engine.world.build_static_meshes();
        let mut insert_mesh = |key: MeshKey, label: &str, m: &MeshData| {
            if let Some(gm) = upload_mesh(device, label, m) {
                meshes.insert(key, gm);
            }
        };
        insert_mesh(MeshKey::Terrain, "terrain", &static_world.terrain);
        insert_mesh(MeshKey::PlazaAndPaths, "plaza", &static_world.plaza_and_paths);
        insert_mesh(MeshKey::WoodStructures, "wood", &static_world.wood_structures);
        insert_mesh(MeshKey::TartanFloor, "tartan", &static_world.tartan_floor);
        insert_mesh(MeshKey::StaticProps, "static_props", &static_world.static_props);
        insert_mesh(MeshKey::WireframeNet, "wire_net", &static_world.wireframe_net);
        insert_mesh(MeshKey::WaterDisc, "water_disc", &static_world.water_disc);
        insert_mesh(MeshKey::FountainWater, "fountain_water", &static_world.fountain_water);
        insert_mesh(MeshKey::ToyBoat, "toy_boat", &static_world.toy_boat);
        insert_mesh(MeshKey::BoatPropeller, "boat_prop", &static_world.boat_propeller);
        insert_mesh(MeshKey::CarouselRotor, "carousel_rotor", &static_world.carousel_rotor);
        insert_mesh(MeshKey::SeesawPlank, "seesaw_plank", &static_world.seesaw_plank);
        insert_mesh(MeshKey::TrampolineMat, "tramp_mat", &static_world.trampoline_mat);
        insert_mesh(MeshKey::DiscoBall, "disco_ball", &static_world.disco_ball);
        insert_mesh(MeshKey::DiscoTile, "disco_tile", &static_world.disco_tile);
        insert_mesh(MeshKey::TargetRotor, "target_rotor", &static_world.target_rotor);
        insert_mesh(MeshKey::PinataBody, "pinata_body", &static_world.pinata_body);
        insert_mesh(MeshKey::FountainJet, "fountain_jet", &static_world.fountain_jet);
        insert_mesh(MeshKey::SoccerBall, "soccer_ball", &static_world.soccer_ball);
        insert_mesh(MeshKey::ColorBall, "color_ball", &static_world.color_ball);
        insert_mesh(MeshKey::BoneToy, "bone_toy", &static_world.bone_toy);
        insert_mesh(MeshKey::Snack, "snack", &static_world.snack);
        insert_mesh(MeshKey::TreasureMound, "t_mound", &static_world.treasure_mound);
        insert_mesh(MeshKey::TreasureSparkle, "t_sparkle", &static_world.treasure_sparkle);
        insert_mesh(MeshKey::TreasureBone, "t_bone", &static_world.treasure_bone);
        insert_mesh(MeshKey::TreasureGear, "t_gear", &static_world.treasure_gear);
        insert_mesh(MeshKey::TreasureGem, "t_gem", &static_world.treasure_gem);
        insert_mesh(MeshKey::TreeTrunk, "tree_trunk", &static_world.tree_trunk);
        insert_mesh(MeshKey::TreeFoliage, "tree_foliage", &static_world.tree_foliage);
        insert_mesh(MeshKey::TreeCyberRing, "tree_ring", &static_world.tree_cyber_ring);
        insert_mesh(MeshKey::Flower, "flower", &static_world.flower);
        insert_mesh(MeshKey::Butterfly, "butterfly", &static_world.butterfly);
        insert_mesh(MeshKey::Cloud, "cloud", &static_world.cloud);
        insert_mesh(MeshKey::SparkleQuad, "sparkle", &static_world.sparkle_quad);

        let sky_dome = sphere_mesh(450.0, 24, 16, MatStyle::from_hex(0xffffff, 1.0, 0.0, 0.0, 0.0));
        let sun_orb = sphere_mesh(16.0, 18, 12, MatStyle::from_hex(0xfff59d, 0.2, 0.0, 1.8, 0.0));
        let moon_orb = sphere_mesh(12.0, 18, 12, MatStyle::from_hex(0xe2e8f0, 0.3, 0.0, 1.2, 0.0));
        let waypoint_halo = {
            let mut m = torus_mesh(1.15, 0.09, 10, 28, std::f32::consts::TAU, MatStyle::from_hex(0x00f2fe, 0.15, 0.1, 1.2, 0.2));
            m.transform(Mat4::from_rotation_x(std::f32::consts::FRAC_PI_2));
            m
        };
        let unit_box = box_mesh(1.0, 1.0, 1.0, MatStyle::from_hex(0xffffff, 0.3, 0.0, 0.9, 0.0));
        let unit_sphere = sphere_mesh(0.5, 10, 8, MatStyle::from_hex(0xffffff, 0.3, 0.0, 1.0, 0.0));

        insert_mesh(MeshKey::SkyDome, "sky_dome", &sky_dome);
        insert_mesh(MeshKey::SunOrb, "sun_orb", &sun_orb);
        insert_mesh(MeshKey::MoonOrb, "moon_orb", &moon_orb);
        insert_mesh(MeshKey::WaypointHalo, "waypoint_halo", &waypoint_halo);
        insert_mesh(MeshKey::UnitBox, "unit_box", &unit_box);
        insert_mesh(MeshKey::UnitSphere, "unit_sphere", &unit_sphere);

        for (i, dog) in engine.pack.dogs.iter().enumerate() {
            let set: RobotMeshSet = robochibi_core::build_robot_mesh_set(dog.id, dog.current_emotion);
            insert_mesh(MeshKey::RobotTorso(i), "r_torso", &set.torso);
            insert_mesh(MeshKey::RobotTurbine(i), "r_turb", &set.power_turbine);
            insert_mesh(MeshKey::RobotHead(i), "r_head", &set.neck_and_head);
            insert_mesh(MeshKey::RobotFace(i), "r_face", &set.face_quad);
            insert_mesh(MeshKey::RobotEar(i), "r_ear", &set.ear);
            insert_mesh(MeshKey::RobotTail(i), "r_tail", &set.tail);
            insert_mesh(MeshKey::RobotUpperLegL(i), "r_ulegl", &set.upper_leg_l);
            insert_mesh(MeshKey::RobotUpperLegR(i), "r_ulegr", &set.upper_leg_r);
            insert_mesh(MeshKey::RobotLowerLeg(i), "r_lleg", &set.lower_leg);
            insert_mesh(MeshKey::RobotPaw(i), "r_paw", &set.paw);
            insert_mesh(MeshKey::RobotHalo(i), "r_halo", &set.halo_ring);
            if let Some(m) = &set.sparky_compass_needle {
                insert_mesh(MeshKey::RobotSparkyNeedle(i), "r_needle", m);
            }
            if let Some(m) = &set.bolt_turbo_flame {
                insert_mesh(MeshKey::RobotBoltFlame(i), "r_flame", m);
            }
            if let Some(m) = &set.pixel_sat_dish {
                insert_mesh(MeshKey::RobotPixelDish(i), "r_dish", m);
            }
            if let Some(m) = &set.luna_wing_l {
                insert_mesh(MeshKey::RobotLunaWingL(i), "r_wingl", m);
            }
            if let Some(m) = &set.luna_wing_r {
                insert_mesh(MeshKey::RobotLunaWingR(i), "r_wingr", m);
            }
            if let Some(m) = &set.rusty_tail_propeller {
                insert_mesh(MeshKey::RobotRustyProp(i), "r_prop", m);
            }
        }

        // Extra plane quad just in case
        let _ = plane_mesh(1.0, 1.0, 1, 1, MatStyle::from_hex(0xffffff, 1.0, 0.0, 0.0, 0.0));

        let instance_capacity = 2048usize;
        let instance_buf = device.create_buffer(&wgpu::BufferDescriptor {
            label: Some("dynamic_instances"),
            size: (instance_capacity * std::mem::size_of::<GpuInstance>()) as u64,
            usage: wgpu::BufferUsages::VERTEX | wgpu::BufferUsages::COPY_DST,
            mapped_at_creation: false,
        });

        Self {
            surface_format,
            width,
            height,
            shadow_pipeline,
            opaque_pipeline,
            sky_pipeline,
            transparent_pipeline,
            post_pipeline,
            pip_post_pipeline,
            global_uniform_buf,
            global_bind_group,
            pip_global_uniform_buf,
            pip_global_bind_group,
            post_layout,
            post_uniform_buf,
            post_bind_group,
            pip_post_uniform_buf,
            pip_post_bind_group,
            linear_clamp_sampler,
            scene_color_tex,
            scene_color_view,
            scene_depth_tex,
            scene_depth_view,
            _shadow_tex: shadow_tex,
            shadow_view,
            _pip_scene_tex: pip_scene_tex,
            pip_scene_view,
            _pip_depth_tex: pip_depth_tex,
            pip_depth_view,
            pip_final_tex,
            pip_final_view,
            face_textures,
            material_bgs,
            meshes,
            instance_buf,
            instance_capacity,
            instances_scratch: Vec::with_capacity(2048),
            batches_scratch: Vec::with_capacity(128),
        }
    }

    fn create_scene_targets(
        device: &wgpu::Device,
        width: u32,
        height: u32,
    ) -> (wgpu::Texture, wgpu::TextureView, wgpu::Texture, wgpu::TextureView) {
        let color_tex = device.create_texture(&wgpu::TextureDescriptor {
            label: Some("scene_color"),
            size: wgpu::Extent3d {
                width: width.max(1),
                height: height.max(1),
                depth_or_array_layers: 1,
            },
            mip_level_count: 1,
            sample_count: 1,
            dimension: wgpu::TextureDimension::D2,
            format: wgpu::TextureFormat::Rgba8Unorm,
            usage: wgpu::TextureUsages::RENDER_ATTACHMENT | wgpu::TextureUsages::TEXTURE_BINDING,
            view_formats: &[],
        });
        let color_view = color_tex.create_view(&wgpu::TextureViewDescriptor::default());

        let depth_tex = device.create_texture(&wgpu::TextureDescriptor {
            label: Some("scene_depth"),
            size: wgpu::Extent3d {
                width: width.max(1),
                height: height.max(1),
                depth_or_array_layers: 1,
            },
            mip_level_count: 1,
            sample_count: 1,
            dimension: wgpu::TextureDimension::D2,
            format: wgpu::TextureFormat::Depth24Plus,
            usage: wgpu::TextureUsages::RENDER_ATTACHMENT,
            view_formats: &[],
        });
        let depth_view = depth_tex.create_view(&wgpu::TextureViewDescriptor::default());

        (color_tex, color_view, depth_tex, depth_view)
    }

    fn create_post_bg(
        device: &wgpu::Device,
        layout: &wgpu::BindGroupLayout,
        uniform_buf: &wgpu::Buffer,
        scene_view: &wgpu::TextureView,
        sampler: &wgpu::Sampler,
    ) -> wgpu::BindGroup {
        device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some("post_fx_bg"),
            layout,
            entries: &[
                wgpu::BindGroupEntry {
                    binding: 0,
                    resource: uniform_buf.as_entire_binding(),
                },
                wgpu::BindGroupEntry {
                    binding: 1,
                    resource: wgpu::BindingResource::TextureView(scene_view),
                },
                wgpu::BindGroupEntry {
                    binding: 2,
                    resource: wgpu::BindingResource::Sampler(sampler),
                },
            ],
        })
    }

    pub fn resize(&mut self, device: &wgpu::Device, width: u32, height: u32) {
        let width = width.max(1);
        let height = height.max(1);
        if width == self.width && height == self.height {
            return;
        }
        self.width = width;
        self.height = height;
        let (ct, cv, dt, dv) = Self::create_scene_targets(device, width, height);
        self.scene_color_tex = ct;
        self.scene_color_view = cv;
        self.scene_depth_tex = dt;
        self.scene_depth_view = dv;
        self.post_bind_group = Self::create_post_bg(
            device,
            &self.post_layout,
            &self.post_uniform_buf,
            &self.scene_color_view,
            &self.linear_clamp_sampler,
        );
    }

    fn push_batch(
        &mut self,
        mesh: MeshKey,
        tex: TexKey,
        transparent: bool,
        shadow_caster: bool,
        no_depth_write: bool,
        inst: GpuInstance,
    ) {
        let start = self.instances_scratch.len() as u32;
        self.instances_scratch.push(inst);
        self.batches_scratch.push(DrawBatch {
            mesh,
            tex,
            transparent,
            shadow_caster,
            no_depth_write,
            skip_in_pip: false,
            start,
            count: 1,
        });
    }

    fn begin_multi_batch(
        &self,
        mesh: MeshKey,
        tex: TexKey,
        transparent: bool,
        shadow_caster: bool,
    ) -> DrawBatch {
        DrawBatch {
            mesh,
            tex,
            transparent,
            shadow_caster,
            no_depth_write: transparent,
            skip_in_pip: false,
            start: self.instances_scratch.len() as u32,
            count: 0,
        }
    }

    fn finish_multi_batch(&mut self, mut batch: DrawBatch) {
        batch.count = (self.instances_scratch.len() as u32).saturating_sub(batch.start);
        if batch.count > 0 {
            self.batches_scratch.push(batch);
        }
    }

    fn build_lighting(&self, engine: &SimulationEngine, cam_pos: Vec3, view_proj: Mat4) -> GlobalUniforms {
        let (sun_dir_vec, sun_color, sun_int, amb_sky, amb_gnd, amb_int, fog_col, fog_d, sky_zen) =
            match engine.time_of_day {
                TimeOfDay::Day => (
                    Vec3::new(0.55, 0.85, 0.35).normalize(),
                    [1.0, 0.96, 0.88],
                    2.0,
                    [0.62, 0.85, 1.0],
                    [0.24, 0.36, 0.22],
                    0.95,
                    [0.62, 0.85, 0.98],
                    0.0028,
                    [0.18, 0.56, 0.92],
                ),
                TimeOfDay::Sunset => (
                    Vec3::new(-0.78, 0.26, -0.52).normalize(),
                    [1.0, 0.55, 0.26],
                    2.2,
                    [0.92, 0.50, 0.36],
                    [0.25, 0.16, 0.26],
                    0.82,
                    [0.88, 0.45, 0.32],
                    0.0036,
                    [0.32, 0.18, 0.48],
                ),
                TimeOfDay::Night => (
                    Vec3::new(-0.35, 0.72, 0.48).normalize(),
                    [0.52, 0.70, 1.0],
                    1.05,
                    [0.14, 0.24, 0.46],
                    [0.08, 0.10, 0.18],
                    0.65,
                    [0.05, 0.09, 0.18],
                    0.0042,
                    [0.02, 0.04, 0.11],
                ),
            };

        let weather_dim = match engine.weather {
            WeatherMode::CyberRain => 0.72,
            WeatherMode::Fireflies => 0.88,
            WeatherMode::Stardust => 0.90,
            WeatherMode::Clear => 1.0,
        };

        let focus = engine.pack.player().position;
        let light_eye = focus + sun_dir_vec * 95.0;
        let light_view = look_at_mat4(light_eye, focus, Vec3::Y);
        let light_proj = orthographic(-90.0, 90.0, -90.0, 90.0, 5.0, 220.0);
        let light_view_proj = light_proj * light_view;

        let disco_hue = (engine.elapsed_time * 1.4).fract();
        let disco_i = if engine.world.disco_party_active { 1.0 } else { 0.0 };

        let player_pos = engine.pack.player().position;
        let is_underwater = engine.cam_pos.y < -0.15
            && (engine.cam_pos.x - LAKE_CENTER_X).hypot(engine.cam_pos.z - LAKE_CENTER_Z) < 62.0
            || player_pos.y < -0.45;
        let underwater_tint = if is_underwater && engine.cam_pos.y < 0.0 {
            1.0
        } else {
            0.0
        };

        GlobalUniforms {
            view_proj: view_proj.to_cols_array_2d(),
            light_view_proj: light_view_proj.to_cols_array_2d(),
            cam_pos: [cam_pos.x, cam_pos.y, cam_pos.z, sun_int * weather_dim],
            sun_dir: [sun_dir_vec.x, sun_dir_vec.y, sun_dir_vec.z, engine.elapsed_time],
            sun_color: [sun_color[0], sun_color[1], sun_color[2], amb_int * weather_dim],
            ambient_sky: [amb_sky[0], amb_sky[1], amb_sky[2], 1.0],
            ambient_ground: [amb_gnd[0], amb_gnd[1], amb_gnd[2], fog_d],
            fog_color: [fog_col[0] * weather_dim, fog_col[1] * weather_dim, fog_col[2] * weather_dim, disco_i],
            disco_pos_col: [
                engine.world.disco_pad_pos.x,
                engine.world.disco_pad_pos.y + 3.8,
                engine.world.disco_pad_pos.z,
                disco_hue,
            ],
            sky_zenith: [sky_zen[0], sky_zen[1], sky_zen[2], underwater_tint],
        }
    }

    fn upload_dirty_faces(&self, queue: &wgpu::Queue, engine: &SimulationEngine) {
        for (i, dog) in engine.pack.dogs.iter().enumerate() {
            if dog.face.dirty {
                queue.write_texture(
                    wgpu::TexelCopyTextureInfo {
                        texture: &self.face_textures[i],
                        mip_level: 0,
                        origin: wgpu::Origin3d::ZERO,
                        aspect: wgpu::TextureAspect::All,
                    },
                    &dog.face.pixels,
                    wgpu::TexelCopyBufferLayout {
                        offset: 0,
                        bytes_per_row: Some(4 * FACE_W as u32),
                        rows_per_image: Some(FACE_H as u32),
                    },
                    wgpu::Extent3d {
                        width: FACE_W as u32,
                        height: FACE_H as u32,
                        depth_or_array_layers: 1,
                    },
                );
            }
        }
    }

    fn gather_scene_instances(&mut self, engine: &SimulationEngine, render_active_dog: bool) {
        self.instances_scratch.clear();
        self.batches_scratch.clear();

        let id_xf = Mat4::IDENTITY;
        let white_tint = [1.0; 4];

        // 0. Sky Dome & Celestials
        self.push_batch(
            MeshKey::SkyDome,
            TexKey::White,
            false,
            false,
            true,
            GpuInstance::from_mat(
                Mat4::from_translation(engine.cam_pos),
                white_tint,
                [0.0, 0.0, 2.0, 0.0],
            ),
        );

        let sun_world = match engine.time_of_day {
            TimeOfDay::Day => engine.cam_pos + Vec3::new(140.0, 220.0, 90.0),
            TimeOfDay::Sunset => engine.cam_pos + Vec3::new(-230.0, 75.0, -150.0),
            TimeOfDay::Night => engine.cam_pos + Vec3::new(0.0, -200.0, 0.0),
        };
        if engine.time_of_day != TimeOfDay::Night {
            self.push_batch(
                MeshKey::SunOrb,
                TexKey::White,
                false,
                false,
                true,
                GpuInstance::from_mat(
                    Mat4::from_translation(sun_world),
                    [1.0, 0.95, 0.72, 1.0],
                    [2.0, 0.0, 1.0, 0.0],
                ),
            );
        } else {
            let moon_world = engine.cam_pos + Vec3::new(-110.0, 200.0, 140.0);
            self.push_batch(
                MeshKey::MoonOrb,
                TexKey::White,
                false,
                false,
                true,
                GpuInstance::from_mat(
                    Mat4::from_translation(moon_world),
                    [0.88, 0.94, 1.0, 1.0],
                    [1.3, 0.0, 1.0, 0.0],
                ),
            );
            // Night sky stars (64 deterministic stars rotating gently)
            let b = self.begin_multi_batch(MeshKey::UnitSphere, TexKey::White, false, false);
            for s in 0..64 {
                let a = (s as f32 * 2.39996) + engine.star_rot_y;
                let elev = 0.18 + ((s * 37) % 100) as f32 * 0.008;
                let dir = Vec3::new(a.cos() * (1.0 - elev * 0.5), elev, a.sin() * (1.0 - elev * 0.5)).normalize();
                let pos = engine.cam_pos + dir * 390.0;
                let pulse = 0.8 + ((engine.elapsed_time * 3.0 + s as f32).sin() * 0.4);
                self.instances_scratch.push(GpuInstance::from_mat(
                    Mat4::from_translation(pos) * Mat4::from_scale(Vec3::splat(1.2 * pulse)),
                    [0.9, 0.95, 1.0, 1.0],
                    [1.4, 0.0, 1.0, 0.0],
                ));
            }
            self.finish_multi_batch(b);
        }

        // 1. Static terrain & architecture
        self.push_batch(
            MeshKey::Terrain,
            TexKey::Grass,
            false,
            false,
            false,
            GpuInstance::from_mat(id_xf, white_tint, [0.0, 0.0, 0.0, 1.0]),
        );
        self.push_batch(
            MeshKey::PlazaAndPaths,
            TexKey::Cobblestone,
            false,
            false,
            false,
            GpuInstance::from_mat(id_xf, white_tint, [0.0, 0.0, 0.0, 1.0]),
        );
        self.push_batch(
            MeshKey::WoodStructures,
            TexKey::Wood,
            false,
            true,
            false,
            GpuInstance::from_mat(id_xf, white_tint, [0.0, 0.0, 0.0, 1.0]),
        );
        self.push_batch(
            MeshKey::TartanFloor,
            TexKey::Tartan,
            false,
            false,
            false,
            GpuInstance::from_mat(id_xf, white_tint, [0.0, 0.0, 0.0, 1.0]),
        );
        self.push_batch(
            MeshKey::StaticProps,
            TexKey::White,
            false,
            true,
            false,
            GpuInstance::from_mat(id_xf, white_tint, [0.0, 0.0, 0.0, 1.0]),
        );

        // 2. Dynamic Attractions (exact world positions)
        let boat_xf = Mat4::from_translation(engine.world.boat_pos)
            * Mat4::from_euler(
                EulerRot::YXZ,
                engine.world.boat_rot.y,
                engine.world.boat_rot.x,
                engine.world.boat_rot.z,
            );
        self.push_batch(
            MeshKey::ToyBoat,
            TexKey::White,
            false,
            true,
            false,
            GpuInstance::from_mat(boat_xf, white_tint, [0.0, 0.0, 0.0, 1.0]),
        );
        self.push_batch(
            MeshKey::BoatPropeller,
            TexKey::White,
            false,
            false,
            false,
            GpuInstance::from_mat(
                boat_xf * Mat4::from_translation(Vec3::new(0.0, 0.15, -2.1))
                    * Mat4::from_rotation_z(engine.world.boat_prop_rot),
                white_tint,
                [0.4, 0.0, 0.0, 1.0],
            ),
        );

        self.push_batch(
            MeshKey::CarouselRotor,
            TexKey::White,
            false,
            true,
            false,
            GpuInstance::from_mat(
                Mat4::from_translation(engine.world.carousel_pos + Vec3::new(0.0, 0.14, 0.0))
                    * Mat4::from_rotation_y(engine.world.carousel_angle),
                white_tint,
                [0.0, 0.0, 0.0, 1.0],
            ),
        );

        self.push_batch(
            MeshKey::SeesawPlank,
            TexKey::White,
            false,
            true,
            false,
            GpuInstance::from_mat(
                Mat4::from_translation(engine.world.seesaw_pos + Vec3::new(0.0, 1.56, 0.0))
                    * Mat4::from_rotation_z(engine.world.seesaw_tilt),
                white_tint,
                [0.0, 0.0, 0.0, 1.0],
            ),
        );

        self.push_batch(
            MeshKey::TrampolineMat,
            TexKey::White,
            false,
            true,
            false,
            GpuInstance::from_mat(
                Mat4::from_translation(
                    engine.world.trampoline_pos + Vec3::new(0.0, 1.0 - engine.world.trampoline_depress, 0.0),
                ),
                white_tint,
                [0.2, 0.0, 0.0, 1.0],
            ),
        );

        self.push_batch(
            MeshKey::DiscoBall,
            TexKey::White,
            false,
            true,
            false,
            GpuInstance::from_mat(
                Mat4::from_translation(engine.world.disco_pad_pos + Vec3::new(0.0, 4.1, 0.0))
                    * Mat4::from_rotation_y(engine.world.disco_ball_rot_y),
                white_tint,
                [if engine.world.disco_party_active { 1.1 } else { 0.25 }, 0.0, 0.0, 1.5],
            ),
        );

        // Disco tiles batched
        let b_tiles = self.begin_multi_batch(MeshKey::DiscoTile, TexKey::White, false, false);
        for tile in &engine.world.disco_tiles {
            let pos = engine.world.disco_pad_pos + tile.local_pos;
            self.instances_scratch.push(GpuInstance::from_mat(
                Mat4::from_translation(pos),
                hex_to_rgba(tile.color_hex, 1.0),
                [tile.emissive, 0.0, 0.0, 1.0],
            ));
        }
        self.finish_multi_batch(b_tiles);

        self.push_batch(
            MeshKey::TargetRotor,
            TexKey::White,
            false,
            true,
            false,
            GpuInstance::from_mat(
                Mat4::from_translation(engine.world.target_pos + Vec3::new(0.0, 3.2, 0.0))
                    * Mat4::from_rotation_z(engine.world.target_rot_z),
                white_tint,
                [0.2, 0.0, 0.0, 1.0],
            ),
        );

        self.push_batch(
            MeshKey::PinataBody,
            TexKey::White,
            false,
            true,
            false,
            GpuInstance::from_mat(
                Mat4::from_translation(engine.world.pinata_pos + Vec3::new(0.0, 4.2, 0.0))
                    * Mat4::from_rotation_z(engine.world.pinata_swing_angle),
                white_tint,
                [0.2, 0.0, 0.0, 1.0],
            ),
        );

        // 3. Instanced Forest Trees (280 trees -> 3 batched draw calls!)
        let tree_colors = [
            0x2e7d32u32, 0x388e3c, 0x43a047, 0x1b5e20, 0x558b2f, 0x00796b, 0x26a69a,
        ];
        let b_trunk = self.begin_multi_batch(MeshKey::TreeTrunk, TexKey::White, false, true);
        for t in &engine.world.trees {
            self.instances_scratch.push(GpuInstance::from_mat(
                Mat4::from_translation(t.pos) * Mat4::from_scale(Vec3::splat(t.scale)),
                white_tint,
                [0.0, 0.0, 0.0, 1.0],
            ));
        }
        self.finish_multi_batch(b_trunk);

        let b_fol = self.begin_multi_batch(MeshKey::TreeFoliage, TexKey::White, false, true);
        for t in &engine.world.trees {
            let col = hex_to_rgba(tree_colors[t.color_idx % tree_colors.len()], 1.0);
            self.instances_scratch.push(GpuInstance::from_mat(
                Mat4::from_translation(t.pos) * Mat4::from_scale(Vec3::splat(t.scale)),
                col,
                [0.0, 0.0, 0.0, 1.0],
            ));
        }
        self.finish_multi_batch(b_fol);

        let b_ring = self.begin_multi_batch(MeshKey::TreeCyberRing, TexKey::White, false, false);
        for t in &engine.world.trees {
            if t.has_cyber_ring {
                self.instances_scratch.push(GpuInstance::from_mat(
                    Mat4::from_translation(t.pos) * Mat4::from_scale(Vec3::splat(t.scale)),
                    white_tint,
                    [0.35, 0.0, 0.0, 1.0],
                ));
            }
        }
        self.finish_multi_batch(b_ring);

        // 4. Flowers (240 instances -> 1 draw call!)
        let b_flw = self.begin_multi_batch(MeshKey::Flower, TexKey::White, false, false);
        for f in &engine.world.flowers {
            self.instances_scratch.push(GpuInstance::from_mat(
                Mat4::from_translation(f.pos) * Mat4::from_scale(Vec3::splat(f.scale)),
                f.color,
                [0.2, 0.0, 0.0, 1.0],
            ));
        }
        self.finish_multi_batch(b_flw);

        // 5. Ball Pit Balls (45 instances -> 1 draw call!)
        let b_pit = self.begin_multi_batch(MeshKey::ColorBall, TexKey::White, false, false);
        for bp in &engine.world.ballpit_balls {
            self.instances_scratch.push(GpuInstance::from_mat(
                Mat4::from_translation(bp.pos) * Mat4::from_scale(Vec3::splat(0.38)),
                hex_to_rgba(bp.color_hex, 1.0),
                [0.15, 0.0, 0.0, 1.2],
            ));
        }
        self.finish_multi_batch(b_pit);

        // 6. Interactive Balls (Soccer + Neon Color balls)
        for ball in &engine.world.balls {
            let xf = Mat4::from_translation(ball.pos)
                * Mat4::from_euler(EulerRot::XYZ, ball.rot.x, ball.rot.y, ball.rot.z)
                * Mat4::from_scale(Vec3::splat(if ball.is_soccer {
                    ball.radius / 1.2
                } else {
                    ball.radius
                }));
            if ball.is_soccer {
                self.push_batch(
                    MeshKey::SoccerBall,
                    TexKey::Soccer,
                    false,
                    true,
                    false,
                    GpuInstance::from_mat(xf, white_tint, [0.0, 0.0, 0.0, 1.0]),
                );
            } else {
                self.push_batch(
                    MeshKey::ColorBall,
                    TexKey::White,
                    false,
                    true,
                    false,
                    GpuInstance::from_mat(
                        xf,
                        hex_to_rgba(ball.color_hex, 1.0),
                        [if ball.is_neon { 0.4 } else { 0.0 }, 0.0, 0.0, 1.2],
                    ),
                );
            }
        }

        // 7. Bone toys, snacks, treasure spots, butterflies
        let b_bone = self.begin_multi_batch(MeshKey::BoneToy, TexKey::White, false, true);
        for bone in &engine.world.bone_toys {
            self.instances_scratch.push(GpuInstance::from_mat(
                Mat4::from_translation(bone.pos) * Mat4::from_rotation_y(bone.rot_y),
                white_tint,
                [0.25, 0.0, 0.0, 1.0],
            ));
        }
        self.finish_multi_batch(b_bone);

        let b_snack = self.begin_multi_batch(MeshKey::Snack, TexKey::White, false, false);
        for sn in &engine.world.snacks {
            self.instances_scratch.push(GpuInstance::from_mat(
                Mat4::from_translation(sn.pos) * Mat4::from_rotation_y(sn.age * 2.2),
                white_tint,
                [0.45, 0.0, 0.0, 1.0],
            ));
        }
        self.finish_multi_batch(b_snack);

        for tr in &engine.world.treasure_spots {
            self.push_batch(
                MeshKey::TreasureMound,
                TexKey::White,
                false,
                false,
                false,
                GpuInstance::from_mat(
                    Mat4::from_translation(Vec3::new(tr.x, tr.y, tr.z)),
                    white_tint,
                    [0.0, 0.0, 0.0, 1.0],
                ),
            );
            if !tr.dug {
                let sy = tr.y + 0.55 + (engine.elapsed_time * 3.5 + tr.x).sin() * 0.2;
                self.push_batch(
                    MeshKey::TreasureSparkle,
                    TexKey::White,
                    false,
                    false,
                    false,
                    GpuInstance::from_mat(
                        Mat4::from_translation(Vec3::new(tr.x, sy, tr.z))
                            * Mat4::from_rotation_y(engine.elapsed_time * 2.0),
                        white_tint,
                        [0.8, 0.0, 0.0, 1.0],
                    ),
                );
            } else {
                let prize_mesh = match tr.kind {
                    TreasureKind::Bone => MeshKey::TreasureBone,
                    TreasureKind::Gear => MeshKey::TreasureGear,
                    TreasureKind::Gem => MeshKey::TreasureGem,
                    TreasureKind::Ball => MeshKey::ColorBall,
                };
                self.push_batch(
                    prize_mesh,
                    TexKey::White,
                    false,
                    false,
                    false,
                    GpuInstance::from_mat(
                        Mat4::from_translation(Vec3::new(tr.x, tr.y + 0.75, tr.z))
                            * Mat4::from_rotation_y(engine.elapsed_time * 1.8)
                            * Mat4::from_scale(Vec3::splat(if tr.kind == TreasureKind::Ball {
                                0.35
                            } else {
                                1.0
                            })),
                        white_tint,
                        [0.4, 0.0, 0.0, 1.2],
                    ),
                );
            }
        }

        let b_but = self.begin_multi_batch(MeshKey::Butterfly, TexKey::White, false, false);
        for bf in &engine.world.butterflies {
            let flap = 0.65 + (engine.elapsed_time * 14.0 + bf.phase).sin().abs() * 0.5;
            self.instances_scratch.push(GpuInstance::from_mat(
                Mat4::from_translation(bf.pos)
                    * Mat4::from_rotation_y(bf.rot_y)
                    * Mat4::from_scale(Vec3::new(flap, 1.0, 1.0)),
                white_tint,
                [0.5, 0.0, 0.0, 1.0],
            ));
        }
        self.finish_multi_batch(b_but);

        // 8. Waypoint Halo
        if let Some(wp) = engine.target_waypoint {
            let pulse = 0.88 + (engine.elapsed_time * 6.0).sin() * 0.14;
            self.push_batch(
                MeshKey::WaypointHalo,
                TexKey::White,
                false,
                false,
                false,
                GpuInstance::from_mat(
                    Mat4::from_translation(wp + Vec3::new(0.0, 0.12, 0.0))
                        * Mat4::from_scale(Vec3::splat(pulse)),
                    [0.0, 0.95, 1.0, 1.0],
                    [0.9, 0.0, 0.0, 1.0],
                ),
            );
        }

        // 9. ALL 5 ARTICULATED CHIBI ROBOT DOGS!
        for (i, dog) in engine.pack.dogs.iter().enumerate() {
            if !render_active_dog && i == engine.pack.active_idx {
                continue;
            }
            let batch_start = self.batches_scratch.len();
            self.push_dog_parts(i, dog);
            if i == engine.pack.active_idx {
                for b in &mut self.batches_scratch[batch_start..] {
                    b.skip_in_pip = true;
                }
            }
        }

        // 10. Transparent Water, Nets, Clouds, Sparks, Weather & Emotion Particles
        self.push_batch(
            MeshKey::WaterDisc,
            TexKey::Water,
            true,
            false,
            true,
            GpuInstance::from_mat(id_xf, white_tint, [0.1, 1.0, 0.0, 1.5]),
        );
        self.push_batch(
            MeshKey::FountainWater,
            TexKey::White,
            true,
            false,
            true,
            GpuInstance::from_mat(
                Mat4::from_translation(engine.world.fountain_pos + Vec3::new(0.0, 0.78, 0.0)),
                white_tint,
                [0.25, 1.0, 0.0, 1.4],
            ),
        );
        self.push_batch(
            MeshKey::FountainJet,
            TexKey::White,
            true,
            false,
            true,
            GpuInstance::from_mat(
                Mat4::from_translation(
                    engine.world.fountain_pos
                        + Vec3::new(0.0, 0.95 + 0.6 * engine.world.fountain_jet_scale_y, 0.0),
                ) * Mat4::from_scale(Vec3::new(1.0, engine.world.fountain_jet_scale_y, 1.0)),
                white_tint,
                [0.45, 0.0, 0.0, 1.0],
            ),
        );
        self.push_batch(
            MeshKey::WireframeNet,
            TexKey::White,
            true,
            false,
            false,
            GpuInstance::from_mat(id_xf, white_tint, [0.2, 0.0, 0.0, 1.0]),
        );

        let b_clouds = self.begin_multi_batch(MeshKey::Cloud, TexKey::White, true, false);
        for cl in &engine.world.clouds {
            self.instances_scratch.push(GpuInstance::from_mat(
                Mat4::from_translation(cl.pos)
                    * Mat4::from_rotation_y(cl.rot_y)
                    * Mat4::from_scale(cl.scale),
                [1.0, 1.0, 1.0, 0.85],
                [0.08, 0.0, 0.0, 0.0],
            ));
        }
        self.finish_multi_batch(b_clouds);

        // Ambient sparkles (120)
        let b_sp = self.begin_multi_batch(MeshKey::SparkleQuad, TexKey::White, true, false);
        for (idx, sp) in engine.world.ambient_particles.iter().enumerate() {
            let phase = idx as f32 * 0.7;
            let s = 0.55 + (engine.elapsed_time * 3.5 + phase).sin() * 0.35;
            let col = if engine.time_of_day == TimeOfDay::Night {
                [0.4, 1.0, 0.75, 0.85]
            } else {
                [1.0, 0.98, 0.75, 0.65]
            };
            self.instances_scratch.push(GpuInstance::from_mat(
                Mat4::from_translation(*sp) * Mat4::from_scale(Vec3::splat(s.max(0.2))),
                col,
                [1.1, 0.0, 1.0, 0.0],
            ));
        }
        self.finish_multi_batch(b_sp);

        // Emotion burst particles
        let b_emo = self.begin_multi_batch(MeshKey::UnitSphere, TexKey::White, true, false);
        for ep in &engine.particles.particles {
            let life_ratio = (1.0 - ep.age / ep.lifetime.max(0.01)).clamp(0.0, 1.0);
            self.instances_scratch.push(GpuInstance::from_mat(
                Mat4::from_translation(ep.position) * Mat4::from_scale(Vec3::splat(ep.current_scale)),
                [ep.color[0], ep.color[1], ep.color[2], life_ratio],
                [1.3, 0.0, 1.0, 0.0],
            ));
        }
        self.finish_multi_batch(b_emo);

        // Weather particles
        if !engine.weather_particles.is_empty() {
            let b_w = self.begin_multi_batch(MeshKey::UnitBox, TexKey::White, true, false);
            for wp in &engine.weather_particles {
                let sy = if engine.weather == WeatherMode::CyberRain {
                    wp.scale * 4.5
                } else {
                    wp.scale
                };
                self.instances_scratch.push(GpuInstance::from_mat(
                    Mat4::from_translation(wp.pos) * Mat4::from_scale(Vec3::new(wp.scale * 0.55, sy, wp.scale * 0.55)),
                    wp.color,
                    [1.25, 0.0, 1.0, 0.0],
                ));
            }
            self.finish_multi_batch(b_w);
        }
    }

    fn push_dog_parts(&mut self, i: usize, dog: &ChibiRobotDog) {
        let white = [1.0; 4];
        let body = dog.body_matrix();
        let head = dog.head_matrix();
        let tail = dog.tail_matrix();
        let neon_boost = (dog.neon_pulse - 1.0).max(0.0) * 0.35;

        self.push_batch(
            MeshKey::RobotTorso(i),
            TexKey::White,
            false,
            true,
            false,
            GpuInstance::from_mat(body, white, [neon_boost, 0.0, 0.0, 1.2]),
        );
        self.push_batch(
            MeshKey::RobotTurbine(i),
            TexKey::White,
            false,
            false,
            false,
            GpuInstance::from_mat(
                body * Mat4::from_translation(Vec3::new(0.0, 0.05, 0.75))
                    * Mat4::from_rotation_z(dog.power_core_spin),
                white,
                [0.2, 0.0, 0.0, 1.4],
            ),
        );
        self.push_batch(
            MeshKey::RobotHead(i),
            TexKey::White,
            false,
            true,
            false,
            GpuInstance::from_mat(head, white, [neon_boost, 0.0, 0.0, 1.2]),
        );
        self.push_batch(
            MeshKey::RobotFace(i),
            TexKey::Face(i),
            false,
            false,
            false,
            GpuInstance::from_mat(head, white, [0.4, 0.0, 1.0, 1.0]),
        );
        self.push_batch(
            MeshKey::RobotEar(i),
            TexKey::White,
            false,
            true,
            false,
            GpuInstance::from_mat(dog.ear_matrix(true), white, [neon_boost, 0.0, 0.0, 1.0]),
        );
        self.push_batch(
            MeshKey::RobotEar(i),
            TexKey::White,
            false,
            true,
            false,
            GpuInstance::from_mat(dog.ear_matrix(false), white, [neon_boost, 0.0, 0.0, 1.0]),
        );
        self.push_batch(
            MeshKey::RobotTail(i),
            TexKey::White,
            false,
            true,
            false,
            GpuInstance::from_mat(tail, white, [neon_boost, 0.0, 0.0, 1.0]),
        );

        for leg_idx in 0..4 {
            let is_left = leg_idx % 2 == 0;
            let upper_key = if is_left {
                MeshKey::RobotUpperLegL(i)
            } else {
                MeshKey::RobotUpperLegR(i)
            };
            self.push_batch(
                upper_key,
                TexKey::White,
                false,
                true,
                false,
                GpuInstance::from_mat(dog.hip_matrix(leg_idx), white, [neon_boost, 0.0, 0.0, 1.0]),
            );
            self.push_batch(
                MeshKey::RobotLowerLeg(i),
                TexKey::White,
                false,
                true,
                false,
                GpuInstance::from_mat(dog.knee_matrix(leg_idx), white, [0.0, 0.0, 0.0, 1.0]),
            );
            self.push_batch(
                MeshKey::RobotPaw(i),
                TexKey::White,
                false,
                true,
                false,
                GpuInstance::from_mat(dog.paw_matrix(leg_idx), white, [neon_boost, 0.0, 0.0, 1.0]),
            );
        }

        if dog.is_player {
            self.push_batch(
                MeshKey::RobotHalo(i),
                TexKey::White,
                false,
                false,
                false,
                GpuInstance::from_mat(
                    dog.root_matrix()
                        * Mat4::from_translation(Vec3::new(0.0, dog.halo_bob_y, 0.0))
                        * Mat4::from_rotation_y(dog.halo_spin),
                    white,
                    [0.9, 0.0, 0.0, 1.0],
                ),
            );
        }

        match dog.id {
            RobotId::Sparky => {
                if self.meshes.contains_key(&MeshKey::RobotSparkyNeedle(i)) {
                    self.push_batch(
                        MeshKey::RobotSparkyNeedle(i),
                        TexKey::White,
                        false,
                        false,
                        false,
                        GpuInstance::from_mat(
                            body * Mat4::from_translation(Vec3::new(0.0, 0.20, 0.75))
                                * Mat4::from_rotation_z(dog.compass_needle_rot),
                            white,
                            [0.8, 0.0, 0.0, 1.0],
                        ),
                    );
                }
            }
            RobotId::Bolt => {
                if dog.turbo_flame_visible && self.meshes.contains_key(&MeshKey::RobotBoltFlame(i)) {
                    self.push_batch(
                        MeshKey::RobotBoltFlame(i),
                        TexKey::White,
                        true,
                        false,
                        true,
                        GpuInstance::from_mat(
                            body * Mat4::from_translation(Vec3::new(0.0, 0.44, -0.84))
                                * Mat4::from_scale(Vec3::new(1.0, 1.0, dog.turbo_flame_scale)),
                            [1.0, 0.92, 0.2, 0.92],
                            [1.6, 0.0, 1.0, 0.0],
                        ),
                    );
                }
            }
            RobotId::Pixel => {
                if self.meshes.contains_key(&MeshKey::RobotPixelDish(i)) {
                    self.push_batch(
                        MeshKey::RobotPixelDish(i),
                        TexKey::White,
                        false,
                        false,
                        false,
                        GpuInstance::from_mat(
                            head * Mat4::from_translation(Vec3::new(0.32, 1.02, 0.18))
                                * Mat4::from_rotation_y(dog.sat_dish_spin),
                            white,
                            [0.2, 0.0, 0.0, 1.4],
                        ),
                    );
                }
            }
            RobotId::Luna => {
                if self.meshes.contains_key(&MeshKey::RobotLunaWingL(i)) {
                    self.push_batch(
                        MeshKey::RobotLunaWingL(i),
                        TexKey::White,
                        true,
                        false,
                        false,
                        GpuInstance::from_mat(
                            body * Mat4::from_translation(Vec3::new(-0.44, 0.38, -0.10))
                                * Mat4::from_rotation_y(dog.wing_l_rot_y),
                            [1.0, 0.75, 0.9, 0.88],
                            [0.4, 0.0, 0.0, 1.2],
                        ),
                    );
                }
                if self.meshes.contains_key(&MeshKey::RobotLunaWingR(i)) {
                    self.push_batch(
                        MeshKey::RobotLunaWingR(i),
                        TexKey::White,
                        true,
                        false,
                        false,
                        GpuInstance::from_mat(
                            body * Mat4::from_translation(Vec3::new(0.44, 0.38, -0.10))
                                * Mat4::from_rotation_y(dog.wing_r_rot_y),
                            [1.0, 0.75, 0.9, 0.88],
                            [0.4, 0.0, 0.0, 1.2],
                        ),
                    );
                }
            }
            RobotId::Rusty => {
                if self.meshes.contains_key(&MeshKey::RobotRustyProp(i)) {
                    self.push_batch(
                        MeshKey::RobotRustyProp(i),
                        TexKey::White,
                        false,
                        false,
                        false,
                        GpuInstance::from_mat(
                            tail * Mat4::from_translation(Vec3::new(0.0, 0.50, 0.0))
                                * Mat4::from_rotation_z(dog.tail_propeller_rot),
                            white,
                            [0.5, 0.0, 0.0, 1.2],
                        ),
                    );
                }
            }
        }
    }

    fn upload_instances(&mut self, device: &wgpu::Device, queue: &wgpu::Queue) {
        if self.instances_scratch.len() > self.instance_capacity {
            self.instance_capacity = (self.instances_scratch.len() * 2).max(2048);
            self.instance_buf = device.create_buffer(&wgpu::BufferDescriptor {
                label: Some("dynamic_instances"),
                size: (self.instance_capacity * std::mem::size_of::<GpuInstance>()) as u64,
                usage: wgpu::BufferUsages::VERTEX | wgpu::BufferUsages::COPY_DST,
                mapped_at_creation: false,
            });
        }
        if !self.instances_scratch.is_empty() {
            queue.write_buffer(
                &self.instance_buf,
                0,
                bytemuck::cast_slice(&self.instances_scratch),
            );
        }
    }

    fn encode_world_pass<'a>(&'a self, pass: &mut wgpu::RenderPass<'a>, global_bg: &'a wgpu::BindGroup, is_pip: bool) {
        // First draw Sky Dome + sky stars (no depth write)
        pass.set_pipeline(&self.sky_pipeline);
        pass.set_bind_group(0, global_bg, &[]);
        for batch in &self.batches_scratch {
            if (is_pip && batch.skip_in_pip) || !batch.no_depth_write || batch.transparent {
                continue;
            }
            if let (Some(mesh), Some(mat_bg)) = (self.meshes.get(&batch.mesh), self.material_bgs.get(&batch.tex)) {
                pass.set_bind_group(1, mat_bg, &[]);
                pass.set_vertex_buffer(0, mesh.vertex_buf.slice(..));
                pass.set_vertex_buffer(1, self.instance_buf.slice(..));
                pass.set_index_buffer(mesh.index_buf.slice(..), wgpu::IndexFormat::Uint32);
                pass.draw_indexed(0..mesh.index_count, 0, batch.start..(batch.start + batch.count));
            }
        }

        // Opaque world + dogs + terrain
        pass.set_pipeline(&self.opaque_pipeline);
        pass.set_bind_group(0, global_bg, &[]);
        for batch in &self.batches_scratch {
            if (is_pip && batch.skip_in_pip) || batch.transparent || batch.no_depth_write {
                continue;
            }
            if let (Some(mesh), Some(mat_bg)) = (self.meshes.get(&batch.mesh), self.material_bgs.get(&batch.tex)) {
                pass.set_bind_group(1, mat_bg, &[]);
                pass.set_vertex_buffer(0, mesh.vertex_buf.slice(..));
                pass.set_vertex_buffer(1, self.instance_buf.slice(..));
                pass.set_index_buffer(mesh.index_buf.slice(..), wgpu::IndexFormat::Uint32);
                pass.draw_indexed(0..mesh.index_count, 0, batch.start..(batch.start + batch.count));
            }
        }

        // Transparent water, nets, clouds, particles
        pass.set_pipeline(&self.transparent_pipeline);
        pass.set_bind_group(0, global_bg, &[]);
        for batch in &self.batches_scratch {
            if (is_pip && batch.skip_in_pip) || !batch.transparent {
                continue;
            }
            if let (Some(mesh), Some(mat_bg)) = (self.meshes.get(&batch.mesh), self.material_bgs.get(&batch.tex)) {
                pass.set_bind_group(1, mat_bg, &[]);
                pass.set_vertex_buffer(0, mesh.vertex_buf.slice(..));
                pass.set_vertex_buffer(1, self.instance_buf.slice(..));
                pass.set_index_buffer(mesh.index_buf.slice(..), wgpu::IndexFormat::Uint32);
                pass.draw_indexed(0..mesh.index_count, 0, batch.start..(batch.start + batch.count));
            }
        }
    }

    /// Encodes Shadow Pass + Offscreen 3D Pass + Optional Eye PIP Pass + Post-FX Pass into `target_view`.
    /// When using `egui` on native desktop, pass an intermediate view or render `target_view` directly then overlay `egui`!
    pub fn render(
        &mut self,
        device: &wgpu::Device,
        queue: &wgpu::Queue,
        encoder: &mut wgpu::CommandEncoder,
        target_view: &wgpu::TextureView,
        engine: &SimulationEngine,
        render_pip: bool,
    ) {
        self.upload_dirty_faces(queue, engine);

        let aspect = (self.width as f32 / self.height.max(1) as f32).max(0.1);
        let proj = perspective(50.0f32.to_radians(), aspect, 0.25, 1000.0);
        let cam_tgt = if (engine.cam_target - engine.cam_pos).length_squared() > 1e-4 {
            engine.cam_target
        } else {
            engine.cam_pos + Vec3::NEG_Z
        };
        let view = look_at_mat4(engine.cam_pos, cam_tgt, Vec3::Y);
        let view_proj = proj * view;

        let main_globals = self.build_lighting(engine, engine.cam_pos, view_proj);
        queue.write_buffer(&self.global_uniform_buf, 0, bytemuck::bytes_of(&main_globals));

        let filter_id = match engine.optical_filter {
            OpticalFilter::Normal => 0.0,
            OpticalFilter::Crt => 1.0,
            OpticalFilter::NightVision => 2.0,
            OpticalFilter::Thermal => 3.0,
            OpticalFilter::Cinema => 4.0,
        };
        let needs_gamma = if self.surface_format.is_srgb() { 0.0 } else { 1.0 };
        let post_u = PostFxUniforms {
            params: [filter_id, engine.elapsed_time, aspect, needs_gamma],
            tint: [main_globals.sky_zenith[3], 0.0, 0.0, 0.0],
        };
        queue.write_buffer(&self.post_uniform_buf, 0, bytemuck::bytes_of(&post_u));

        // Build scene instances
        let render_active_dog = engine.camera_mode != robochibi_core::CameraMode::Eye;
        self.gather_scene_instances(engine, render_active_dog);
        self.upload_instances(device, queue);

        // Pass 1: Directional Shadow Map
        {
            let mut spass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
                label: Some("shadow_pass"),
                color_attachments: &[],
                depth_stencil_attachment: Some(wgpu::RenderPassDepthStencilAttachment {
                    view: &self.shadow_view,
                    depth_ops: Some(wgpu::Operations {
                        load: wgpu::LoadOp::Clear(1.0),
                        store: wgpu::StoreOp::Store,
                    }),
                    stencil_ops: None,
                }),
                timestamp_writes: None,
                occlusion_query_set: None,
                multiview_mask: None,
            });
            spass.set_pipeline(&self.shadow_pipeline);
            spass.set_bind_group(0, &self.global_bind_group, &[]);
            for batch in &self.batches_scratch {
                if !batch.shadow_caster {
                    continue;
                }
                if let Some(mesh) = self.meshes.get(&batch.mesh) {
                    spass.set_vertex_buffer(0, mesh.vertex_buf.slice(..));
                    spass.set_vertex_buffer(1, self.instance_buf.slice(..));
                    spass.set_index_buffer(mesh.index_buf.slice(..), wgpu::IndexFormat::Uint32);
                    spass.draw_indexed(0..mesh.index_count, 0, batch.start..(batch.start + batch.count));
                }
            }
        }

        // Pass 2: Main Offscreen Color + Depth
        {
            let mut mpass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
                label: Some("main_scene_pass"),
                color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                    view: &self.scene_color_view,
                    depth_slice: None,
                    resolve_target: None,
                    ops: wgpu::Operations {
                        load: wgpu::LoadOp::Clear(wgpu::Color {
                            r: main_globals.fog_color[0] as f64,
                            g: main_globals.fog_color[1] as f64,
                            b: main_globals.fog_color[2] as f64,
                            a: 1.0,
                        }),
                        store: wgpu::StoreOp::Store,
                    },
                })],
                depth_stencil_attachment: Some(wgpu::RenderPassDepthStencilAttachment {
                    view: &self.scene_depth_view,
                    depth_ops: Some(wgpu::Operations {
                        load: wgpu::LoadOp::Clear(1.0),
                        store: wgpu::StoreOp::Store,
                    }),
                    stencil_ops: None,
                }),
                timestamp_writes: None,
                occlusion_query_set: None,
                multiview_mask: None,
            });
            self.encode_world_pass(&mut mpass, &self.global_bind_group, false);
        }

        // Pass 2b: Optional Live Eye PIP (First-Person Vision of Active Dog!)
        if render_pip {
            let (eye_pos, eye_tgt) = engine.pack.player().eye_camera_transform();
            let pip_aspect = PIP_WIDTH as f32 / PIP_HEIGHT as f32;
            let pip_proj = perspective(72.0f32.to_radians(), pip_aspect, 0.12, 500.0);
            let safe_tgt = if (eye_tgt - eye_pos).length_squared() > 1e-4 {
                eye_tgt
            } else {
                eye_pos + Vec3::Z
            };
            let pip_view = look_at_mat4(eye_pos, safe_tgt, Vec3::Y);
            let pip_globals = self.build_lighting(engine, eye_pos, pip_proj * pip_view);
            queue.write_buffer(&self.pip_global_uniform_buf, 0, bytemuck::bytes_of(&pip_globals));

            let pip_post_u = PostFxUniforms {
                params: [filter_id, engine.elapsed_time, pip_aspect, 1.0],
                tint: [pip_globals.sky_zenith[3], 0.0, 0.0, 0.0],
            };
            queue.write_buffer(&self.pip_post_uniform_buf, 0, bytemuck::bytes_of(&pip_post_u));

            {
                let mut pip_pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
                    label: Some("pip_scene_pass"),
                    color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                        view: &self.pip_scene_view,
                        depth_slice: None,
                        resolve_target: None,
                        ops: wgpu::Operations {
                            load: wgpu::LoadOp::Clear(wgpu::Color {
                                r: pip_globals.fog_color[0] as f64,
                                g: pip_globals.fog_color[1] as f64,
                                b: pip_globals.fog_color[2] as f64,
                                a: 1.0,
                            }),
                            store: wgpu::StoreOp::Store,
                        },
                    })],
                    depth_stencil_attachment: Some(wgpu::RenderPassDepthStencilAttachment {
                        view: &self.pip_depth_view,
                        depth_ops: Some(wgpu::Operations {
                            load: wgpu::LoadOp::Clear(1.0),
                            store: wgpu::StoreOp::Discard,
                        }),
                        stencil_ops: None,
                    }),
                    timestamp_writes: None,
                    occlusion_query_set: None,
                    multiview_mask: None,
                });
                self.encode_world_pass(&mut pip_pass, &self.pip_global_bind_group, true);
            }

            {
                let mut pip_post = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
                    label: Some("pip_post_pass"),
                    color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                        view: &self.pip_final_view,
                        depth_slice: None,
                        resolve_target: None,
                        ops: wgpu::Operations {
                            load: wgpu::LoadOp::Clear(wgpu::Color::BLACK),
                            store: wgpu::StoreOp::Store,
                        },
                    })],
                    depth_stencil_attachment: None,
                    timestamp_writes: None,
                    occlusion_query_set: None,
                    multiview_mask: None,
                });
                pip_post.set_pipeline(&self.pip_post_pipeline);
                pip_post.set_bind_group(0, &self.pip_post_bind_group, &[]);
                pip_post.draw(0..3, 0..1);
            }
        }

        // Pass 3: Main Full-Screen Optical Post-FX -> Swapchain Surface
        {
            let mut post_pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
                label: Some("main_post_pass"),
                color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                    view: target_view,
                    depth_slice: None,
                    resolve_target: None,
                    ops: wgpu::Operations {
                        load: wgpu::LoadOp::Clear(wgpu::Color::BLACK),
                        store: wgpu::StoreOp::Store,
                    },
                })],
                depth_stencil_attachment: None,
                timestamp_writes: None,
                occlusion_query_set: None,
                multiview_mask: None,
            });
            post_pass.set_pipeline(&self.post_pipeline);
            post_pass.set_bind_group(0, &self.post_bind_group, &[]);
            post_pass.draw(0..3, 0..1);
        }
    }

    pub fn pip_texture(&self) -> &wgpu::Texture {
        &self.pip_final_tex
    }
}
