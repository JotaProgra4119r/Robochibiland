use bytemuck::{Pod, Zeroable};
use glam::{Mat4, Vec3};

#[repr(C)]
#[derive(Copy, Clone, Debug, Pod, Zeroable)]
pub struct Vertex {
    pub pos: [f32; 3],
    pub normal: [f32; 3],
    pub uv: [f32; 2],
    pub color: [f32; 4],
    /// [roughness, metalness, emissive_strength, clearcoat]
    pub mat_params: [f32; 4],
}

#[derive(Clone, Debug, Default)]
pub struct MeshData {
    pub vertices: Vec<Vertex>,
    pub indices: Vec<u32>,
}

#[derive(Copy, Clone, Debug)]
pub struct MatStyle {
    pub color: [f32; 4],
    pub roughness: f32,
    pub metalness: f32,
    pub emissive: f32,
    pub clearcoat: f32,
}

impl MatStyle {
    pub fn from_hex(hex: u32, roughness: f32, metalness: f32, emissive: f32, clearcoat: f32) -> Self {
        Self {
            color: hex_to_rgba(hex, 1.0),
            roughness,
            metalness,
            emissive,
            clearcoat,
        }
    }

    pub fn from_hex_alpha(
        hex: u32,
        alpha: f32,
        roughness: f32,
        metalness: f32,
        emissive: f32,
        clearcoat: f32,
    ) -> Self {
        Self {
            color: hex_to_rgba(hex, alpha),
            roughness,
            metalness,
            emissive,
            clearcoat,
        }
    }

    #[inline]
    pub fn params(&self) -> [f32; 4] {
        [self.roughness, self.metalness, self.emissive, self.clearcoat]
    }
}

pub fn hex_to_rgba(hex: u32, alpha: f32) -> [f32; 4] {
    [
        ((hex >> 16) & 0xff) as f32 / 255.0,
        ((hex >> 8) & 0xff) as f32 / 255.0,
        (hex & 0xff) as f32 / 255.0,
        alpha,
    ]
}

impl MeshData {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn merge_transformed(&mut self, other: &MeshData, transform: Mat4) {
        let base = self.vertices.len() as u32;
        let normal_mat = glam::Mat3::from_mat4(transform).inverse().transpose();
        for v in &other.vertices {
            let p = transform.transform_point3(Vec3::from(v.pos));
            let n = (normal_mat * Vec3::from(v.normal)).normalize_or_zero();
            self.vertices.push(Vertex {
                pos: p.to_array(),
                normal: if n.length_squared() > 0.001 {
                    n.to_array()
                } else {
                    [0.0, 1.0, 0.0]
                },
                uv: v.uv,
                color: v.color,
                mat_params: v.mat_params,
            });
        }
        for &idx in &other.indices {
            self.indices.push(base + idx);
        }
    }

    pub fn translate(&mut self, offset: Vec3) {
        for v in &mut self.vertices {
            v.pos[0] += offset.x;
            v.pos[1] += offset.y;
            v.pos[2] += offset.z;
        }
    }

    pub fn transform(&mut self, mat: Mat4) {
        let normal_mat = glam::Mat3::from_mat4(mat).inverse().transpose();
        for v in &mut self.vertices {
            let p = mat.transform_point3(Vec3::from(v.pos));
            let n = (normal_mat * Vec3::from(v.normal)).normalize_or_zero();
            v.pos = p.to_array();
            v.normal = if n.length_squared() > 0.001 {
                n.to_array()
            } else {
                [0.0, 1.0, 0.0]
            };
        }
    }

    pub fn merge(&mut self, other: &MeshData) {
        let base = self.vertices.len() as u32;
        self.vertices.extend_from_slice(&other.vertices);
        self.indices.extend(other.indices.iter().map(|i| base + *i));
    }

    pub fn compute_flat_or_smooth_normals(&mut self) {
        for v in &mut self.vertices {
            v.normal = [0.0, 0.0, 0.0];
        }
        for tri in self.indices.chunks_exact(3) {
            let i0 = tri[0] as usize;
            let i1 = tri[1] as usize;
            let i2 = tri[2] as usize;
            let p0 = Vec3::from(self.vertices[i0].pos);
            let p1 = Vec3::from(self.vertices[i1].pos);
            let p2 = Vec3::from(self.vertices[i2].pos);
            let n = (p1 - p0).cross(p2 - p0);
            for &idx in &[i0, i1, i2] {
                self.vertices[idx].normal[0] += n.x;
                self.vertices[idx].normal[1] += n.y;
                self.vertices[idx].normal[2] += n.z;
            }
        }
        for v in &mut self.vertices {
            let n = Vec3::from(v.normal).normalize_or_zero();
            v.normal = if n.length_squared() > 0.001 {
                n.to_array()
            } else {
                [0.0, 1.0, 0.0]
            };
        }
    }
}

/// True 3D rounded/beveled box using a subdivided cube projected onto an inner core box + radius.
/// Yields smooth 3D rounded corners & bevels on ALL 6 faces and 12 edges!
pub fn beveled_box(w: f32, h: f32, d: f32, radius: f32, segs: u32, mat: MatStyle) -> MeshData {
    let segs = segs.max(2);
    let r = radius.min(w * 0.46).min(h * 0.46).min(d * 0.46).max(0.001);
    let inner_x = (w * 0.5 - r).max(0.0);
    let inner_y = (h * 0.5 - r).max(0.0);
    let inner_z = (d * 0.5 - r).max(0.0);

    let mut mesh = MeshData::new();
    let faces = [
        (Vec3::X, Vec3::Z, Vec3::Y),
        (Vec3::NEG_X, Vec3::NEG_Z, Vec3::Y),
        (Vec3::Y, Vec3::X, Vec3::Z),
        (Vec3::NEG_Y, Vec3::X, Vec3::NEG_Z),
        (Vec3::Z, Vec3::NEG_X, Vec3::Y),
        (Vec3::NEG_Z, Vec3::X, Vec3::Y),
    ];

    for (normal_axis, u_axis, v_axis) in faces {
        let base = mesh.vertices.len() as u32;
        for iy in 0..=segs {
            let fv = iy as f32 / segs as f32;
            let sv = fv * 2.0 - 1.0;
            for ix in 0..=segs {
                let fu = ix as f32 / segs as f32;
                let su = fu * 2.0 - 1.0;
                // Spherify slightly toward edges for uniform bevel distribution
                let p = normal_axis * Vec3::new(w * 0.5, h * 0.5, d * 0.5)
                    + u_axis * (su * Vec3::new(w * 0.5, h * 0.5, d * 0.5))
                    + v_axis * (sv * Vec3::new(w * 0.5, h * 0.5, d * 0.5));
                let clamped = Vec3::new(
                    p.x.clamp(-inner_x, inner_x),
                    p.y.clamp(-inner_y, inner_y),
                    p.z.clamp(-inner_z, inner_z),
                );
                let mut diff = p - clamped;
                if diff.length_squared() < 1e-8 {
                    diff = normal_axis;
                } else {
                    diff = diff.normalize();
                }
                let pos = clamped + diff * r;
                mesh.vertices.push(Vertex {
                    pos: pos.to_array(),
                    normal: diff.to_array(),
                    uv: [fu, 1.0 - fv],
                    color: mat.color,
                    mat_params: mat.params(),
                });
            }
        }
        let stride = segs + 1;
        for iy in 0..segs {
            for ix in 0..segs {
                let a = base + iy * stride + ix;
                let b = a + 1;
                let c = a + stride;
                let d_idx = c + 1;
                mesh.indices.extend_from_slice(&[a, c, b, b, c, d_idx]);
            }
        }
    }
    mesh
}

pub fn box_mesh(w: f32, h: f32, d: f32, mat: MatStyle) -> MeshData {
    let hw = w * 0.5;
    let hh = h * 0.5;
    let hd = d * 0.5;
    let mut mesh = MeshData::new();
    let faces = [
        ([0.0, 0.0, 1.0], [[-hw, -hh, hd], [hw, -hh, hd], [hw, hh, hd], [-hw, hh, hd]]),
        ([0.0, 0.0, -1.0], [[hw, -hh, -hd], [-hw, -hh, -hd], [-hw, hh, -hd], [hw, hh, -hd]]),
        ([1.0, 0.0, 0.0], [[hw, -hh, hd], [hw, -hh, -hd], [hw, hh, -hd], [hw, hh, hd]]),
        ([-1.0, 0.0, 0.0], [[-hw, -hh, -hd], [-hw, -hh, hd], [-hw, hh, hd], [-hw, hh, -hd]]),
        ([0.0, 1.0, 0.0], [[-hw, hh, hd], [hw, hh, hd], [hw, hh, -hd], [-hw, hh, -hd]]),
        ([0.0, -1.0, 0.0], [[-hw, -hh, -hd], [hw, -hh, -hd], [hw, -hh, hd], [-hw, -hh, hd]]),
    ];
    let uvs = [[0.0, 1.0], [1.0, 1.0], [1.0, 0.0], [0.0, 0.0]];
    for (n, corners) in faces {
        let base = mesh.vertices.len() as u32;
        for (i, pos) in corners.iter().enumerate() {
            mesh.vertices.push(Vertex {
                pos: *pos,
                normal: n,
                uv: uvs[i],
                color: mat.color,
                mat_params: mat.params(),
            });
        }
        mesh.indices
            .extend_from_slice(&[base, base + 1, base + 2, base, base + 2, base + 3]);
    }
    mesh
}

pub fn sphere_mesh(radius: f32, segs: u32, rings: u32, mat: MatStyle) -> MeshData {
    let segs = segs.max(6);
    let rings = rings.max(4);
    let mut mesh = MeshData::new();
    for y in 0..=rings {
        let v = y as f32 / rings as f32;
        let phi = v * std::f32::consts::PI;
        for x in 0..=segs {
            let u = x as f32 / segs as f32;
            let theta = u * std::f32::consts::TAU;
            let nx = -phi.sin() * theta.cos();
            let ny = phi.cos();
            let nz = phi.sin() * theta.sin();
            mesh.vertices.push(Vertex {
                pos: [nx * radius, ny * radius, nz * radius],
                normal: [nx, ny, nz],
                uv: [u, v],
                color: mat.color,
                mat_params: mat.params(),
            });
        }
    }
    let stride = segs + 1;
    for y in 0..rings {
        for x in 0..segs {
            let a = y * stride + x;
            let b = a + 1;
            let c = a + stride;
            let d = c + 1;
            mesh.indices.extend_from_slice(&[a, b, c, b, d, c]);
        }
    }
    mesh
}

pub fn cylinder_mesh(
    r_top: f32,
    r_bot: f32,
    height: f32,
    segs: u32,
    open_ended: bool,
    mat: MatStyle,
) -> MeshData {
    cylinder_arc_mesh(r_top, r_bot, height, segs, open_ended, 0.0, std::f32::consts::TAU, mat)
}

pub fn cylinder_arc_mesh(
    r_top: f32,
    r_bot: f32,
    height: f32,
    segs: u32,
    open_ended: bool,
    theta_start: f32,
    theta_len: f32,
    mat: MatStyle,
) -> MeshData {
    let segs = segs.max(3);
    let half_h = height * 0.5;
    let slope = (r_bot - r_top) / height.max(1e-4);
    let mut mesh = MeshData::new();

    for y in 0..=1 {
        let fy = y as f32;
        let py = if y == 0 { half_h } else { -half_h };
        let r = if y == 0 { r_top } else { r_bot };
        for x in 0..=segs {
            let u = x as f32 / segs as f32;
            let a = theta_start + u * theta_len;
            let sa = a.sin();
            let ca = a.cos();
            let n = Vec3::new(sa, slope, ca).normalize_or_zero();
            mesh.vertices.push(Vertex {
                pos: [r * sa, py, r * ca],
                normal: n.to_array(),
                uv: [u, fy],
                color: mat.color,
                mat_params: mat.params(),
            });
        }
    }
    let stride = segs + 1;
    for x in 0..segs {
        let a = x;
        let b = x + 1;
        let c = x + stride;
        let d = c + 1;
        mesh.indices.extend_from_slice(&[a, c, b, b, c, d]);
    }

    if !open_ended {
        if r_top > 1e-4 {
            let center_idx = mesh.vertices.len() as u32;
            mesh.vertices.push(Vertex {
                pos: [0.0, half_h, 0.0],
                normal: [0.0, 1.0, 0.0],
                uv: [0.5, 0.5],
                color: mat.color,
                mat_params: mat.params(),
            });
            for x in 0..=segs {
                let u = x as f32 / segs as f32;
                let a = theta_start + u * theta_len;
                mesh.vertices.push(Vertex {
                    pos: [r_top * a.sin(), half_h, r_top * a.cos()],
                    normal: [0.0, 1.0, 0.0],
                    uv: [a.sin() * 0.5 + 0.5, a.cos() * 0.5 + 0.5],
                    color: mat.color,
                    mat_params: mat.params(),
                });
            }
            for x in 0..segs {
                mesh.indices
                    .extend_from_slice(&[center_idx, center_idx + 1 + x, center_idx + 2 + x]);
            }
        }
        if r_bot > 1e-4 {
            let center_idx = mesh.vertices.len() as u32;
            mesh.vertices.push(Vertex {
                pos: [0.0, -half_h, 0.0],
                normal: [0.0, -1.0, 0.0],
                uv: [0.5, 0.5],
                color: mat.color,
                mat_params: mat.params(),
            });
            for x in 0..=segs {
                let u = x as f32 / segs as f32;
                let a = theta_start + u * theta_len;
                mesh.vertices.push(Vertex {
                    pos: [r_bot * a.sin(), -half_h, r_bot * a.cos()],
                    normal: [0.0, -1.0, 0.0],
                    uv: [a.sin() * 0.5 + 0.5, a.cos() * 0.5 + 0.5],
                    color: mat.color,
                    mat_params: mat.params(),
                });
            }
            for x in 0..segs {
                mesh.indices
                    .extend_from_slice(&[center_idx, center_idx + 2 + x, center_idx + 1 + x]);
            }
        }
    }
    mesh
}

pub fn torus_mesh(
    major_r: f32,
    minor_r: f32,
    radial_segs: u32,
    tubular_segs: u32,
    arc: f32,
    mat: MatStyle,
) -> MeshData {
    let r_segs = radial_segs.max(4);
    let t_segs = tubular_segs.max(6);
    let mut mesh = MeshData::new();
    for j in 0..=r_segs {
        let v = j as f32 / r_segs as f32 * std::f32::consts::TAU;
        for i in 0..=t_segs {
            let u = i as f32 / t_segs as f32 * arc;
            let cx = major_r * u.cos();
            let cy = major_r * u.sin();
            let px = (major_r + minor_r * v.cos()) * u.cos();
            let py = (major_r + minor_r * v.cos()) * u.sin();
            let pz = minor_r * v.sin();
            let n = Vec3::new(px - cx, py - cy, pz).normalize_or_zero();
            mesh.vertices.push(Vertex {
                pos: [px, py, pz],
                normal: n.to_array(),
                uv: [i as f32 / t_segs as f32, j as f32 / r_segs as f32],
                color: mat.color,
                mat_params: mat.params(),
            });
        }
    }
    let stride = t_segs + 1;
    for j in 0..r_segs {
        for i in 0..t_segs {
            let a = (j + 1) * stride + i;
            let b = j * stride + i;
            let c = j * stride + i + 1;
            let d = (j + 1) * stride + i + 1;
            mesh.indices.extend_from_slice(&[a, b, d, b, c, d]);
        }
    }
    mesh
}

pub fn plane_mesh(w: f32, h: f32, segs_x: u32, segs_y: u32, mat: MatStyle) -> MeshData {
    let sx = segs_x.max(1);
    let sy = segs_y.max(1);
    let mut mesh = MeshData::new();
    for iy in 0..=sy {
        let v = iy as f32 / sy as f32;
        let py = (0.5 - v) * h;
        for ix in 0..=sx {
            let u = ix as f32 / sx as f32;
            let px = (u - 0.5) * w;
            mesh.vertices.push(Vertex {
                pos: [px, py, 0.0],
                normal: [0.0, 0.0, 1.0],
                uv: [u, v],
                color: mat.color,
                mat_params: mat.params(),
            });
        }
    }
    let stride = sx + 1;
    for iy in 0..sy {
        for ix in 0..sx {
            let a = iy * stride + ix;
            let b = a + 1;
            let c = a + stride;
            let d = c + 1;
            mesh.indices.extend_from_slice(&[a, c, b, b, c, d]);
        }
    }
    mesh
}

pub fn disc_mesh(radius: f32, segs: u32, mat: MatStyle) -> MeshData {
    let segs = segs.max(6);
    let mut mesh = MeshData::new();
    mesh.vertices.push(Vertex {
        pos: [0.0, 0.0, 0.0],
        normal: [0.0, 0.0, 1.0],
        uv: [0.5, 0.5],
        color: mat.color,
        mat_params: mat.params(),
    });
    for i in 0..=segs {
        let a = (i as f32 / segs as f32) * std::f32::consts::TAU;
        mesh.vertices.push(Vertex {
            pos: [a.cos() * radius, a.sin() * radius, 0.0],
            normal: [0.0, 0.0, 1.0],
            uv: [a.cos() * 0.5 + 0.5, a.sin() * 0.5 + 0.5],
            color: mat.color,
            mat_params: mat.params(),
        });
    }
    for i in 0..segs {
        mesh.indices.extend_from_slice(&[0, i + 1, i + 2]);
    }
    mesh
}

pub fn ring_mesh(inner_r: f32, outer_r: f32, segs: u32, mat: MatStyle) -> MeshData {
    let segs = segs.max(6);
    let mut mesh = MeshData::new();
    for i in 0..=segs {
        let a = (i as f32 / segs as f32) * std::f32::consts::TAU;
        let ca = a.cos();
        let sa = a.sin();
        mesh.vertices.push(Vertex {
            pos: [ca * inner_r, sa * inner_r, 0.0],
            normal: [0.0, 0.0, 1.0],
            uv: [ca * 0.25 + 0.5, sa * 0.25 + 0.5],
            color: mat.color,
            mat_params: mat.params(),
        });
        mesh.vertices.push(Vertex {
            pos: [ca * outer_r, sa * outer_r, 0.0],
            normal: [0.0, 0.0, 1.0],
            uv: [ca * 0.5 + 0.5, sa * 0.5 + 0.5],
            color: mat.color,
            mat_params: mat.params(),
        });
    }
    for i in 0..segs {
        let b = i * 2;
        mesh.indices.extend_from_slice(&[b, b + 1, b + 2, b + 1, b + 3, b + 2]);
    }
    mesh
}

pub fn octahedron_mesh(radius: f32, mat: MatStyle) -> MeshData {
    let pts = [
        Vec3::new(0.0, radius, 0.0),
        Vec3::new(radius, 0.0, 0.0),
        Vec3::new(0.0, 0.0, radius),
        Vec3::new(-radius, 0.0, 0.0),
        Vec3::new(0.0, 0.0, -radius),
        Vec3::new(0.0, -radius, 0.0),
    ];
    let tris = [
        (0, 2, 1),
        (0, 3, 2),
        (0, 4, 3),
        (0, 1, 4),
        (5, 1, 2),
        (5, 2, 3),
        (5, 3, 4),
        (5, 4, 1),
    ];
    let mut mesh = MeshData::new();
    for (a, b, c) in tris {
        let pa = pts[a];
        let pb = pts[b];
        let pc = pts[c];
        let n = (pb - pa).cross(pc - pa).normalize_or_zero().to_array();
        let base = mesh.vertices.len() as u32;
        mesh.vertices.push(Vertex { pos: pa.to_array(), normal: n, uv: [0.5, 0.0], color: mat.color, mat_params: mat.params() });
        mesh.vertices.push(Vertex { pos: pb.to_array(), normal: n, uv: [0.0, 1.0], color: mat.color, mat_params: mat.params() });
        mesh.vertices.push(Vertex { pos: pc.to_array(), normal: n, uv: [1.0, 1.0], color: mat.color, mat_params: mat.params() });
        mesh.indices.extend_from_slice(&[base, base + 1, base + 2]);
    }
    mesh
}
