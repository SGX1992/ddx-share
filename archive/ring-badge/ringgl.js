/* A deliberately small WebGL2 layer: every ring band is the *same* 256-segment
   cylinder strip, and radius / height / tilt / UV scroll all arrive as uniforms.
   That means one VAO and one index buffer for the whole badge — the per-frame
   work is twelve uniform blocks and twelve draw calls, no buffer traffic. */

export const SEG = 256;
const STEP = (Math.PI * 2) / SEG;

const VS = `#version 300 es
in vec2 aRing;              // x = segment index, y = -1 | +1 (bottom | top edge)
uniform mat4 uMvp;
uniform float uRadius;
uniform float uHalfH;
uniform float uAngOff;      // PI for the inner face, which is wound the other way
uniform vec2  uUv;          // u = uUv.x * segmentIndex + uUv.y
out vec2 vUv;
void main() {
  float a = aRing.x * ${STEP.toFixed(10)} + uAngOff;
  vec3 p = vec3(cos(a) * uRadius, aRing.y * uHalfH, sin(a) * uRadius);
  vUv = vec2(uUv.x * aRing.x + uUv.y, aRing.y * 0.5 + 0.5);
  gl_Position = uMvp * vec4(p, 1.0);
}`;

const FS = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uTex;
uniform float uHover;
uniform vec3 uHoverTint;
out vec4 fragColor;
void main() {
  vec4 c = texture(uTex, vec2(fract(vUv.x), vUv.y));
  c.rgb = mix(c.rgb, uHoverTint, uHover * 0.28);
  fragColor = c;
}`;

function compile(gl, type, src) {
  const sh = gl.createShader(type);
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS))
    throw new Error(gl.getShaderInfoLog(sh) || 'shader compile failed');
  return sh;
}

export class RingGL {
  constructor(width, height) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = width;
    this.canvas.height = height;

    const gl = this.canvas.getContext('webgl2', {
      antialias: true,
      alpha: true,
      premultipliedAlpha: false,
      preserveDrawingBuffer: true,
    });
    if (!gl) throw new Error('This browser has no WebGL2.');
    this.gl = gl;

    const prog = gl.createProgram();
    gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, VS));
    gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, FS));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS))
      throw new Error(gl.getProgramInfoLog(prog) || 'program link failed');
    this.prog = prog;
    this.u = Object.fromEntries(
      ['uMvp', 'uRadius', 'uHalfH', 'uAngOff', 'uUv', 'uTex', 'uHover', 'uHoverTint'].map((n) => [
        n,
        gl.getUniformLocation(prog, n),
      ]),
    );

    /* One strip: SEG+1 rings of 2 vertices, so the seam vertex is duplicated and
       the UV can keep climbing past 1 instead of wrapping backwards. */
    const verts = new Float32Array((SEG + 1) * 4);
    for (let i = 0; i <= SEG; i++) {
      verts[i * 4] = i;
      verts[i * 4 + 1] = -1;
      verts[i * 4 + 2] = i;
      verts[i * 4 + 3] = 1;
    }
    const idx = new Uint16Array(SEG * 6);
    for (let i = 0; i < SEG; i++) {
      const v = i * 2;
      idx.set([v, v + 1, v + 2, v + 1, v + 3, v + 2], i * 6);
    }
    this.indexCount = idx.length;

    this.vao = gl.createVertexArray();
    gl.bindVertexArray(this.vao);
    const vb = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vb);
    gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'aRing');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    const ib = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.STATIC_DRAW);
    gl.bindVertexArray(null);

    gl.viewport(0, 0, width, height);
    gl.enable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE); // both faces of every band are visible through the ring
    gl.clearColor(0, 0, 0, 0);
  }

  /* Textures are non-power-of-two, which WebGL2 handles fine. Mipmaps do the
     downsample from the SS× canvas — without them the fine patterns crawl. */
  texture(canvas) {
    const gl = this.gl;
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const aniso = gl.getExtension('EXT_texture_filter_anisotropic');
    if (aniso)
      gl.texParameterf(
        gl.TEXTURE_2D,
        aniso.TEXTURE_MAX_ANISOTROPY_EXT,
        gl.getParameter(aniso.MAX_TEXTURE_MAX_ANISOTROPY_EXT),
      );
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    return t;
  }

  begin(hoverTint) {
    const gl = this.gl;
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.useProgram(this.prog);
    gl.bindVertexArray(this.vao);
    gl.uniform1i(this.u.uTex, 0);
    gl.uniform3fv(this.u.uHoverTint, hoverTint);
    gl.activeTexture(gl.TEXTURE0);
  }

  drawBand({ mvp, radius, halfH, angOff, uvA, uvB, texture, hover }) {
    const gl = this.gl;
    gl.uniformMatrix4fv(this.u.uMvp, false, mvp);
    gl.uniform1f(this.u.uRadius, radius);
    gl.uniform1f(this.u.uHalfH, halfH);
    gl.uniform1f(this.u.uAngOff, angOff);
    gl.uniform2f(this.u.uUv, uvA, uvB);
    gl.uniform1f(this.u.uHover, hover);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.drawElements(gl.TRIANGLES, this.indexCount, gl.UNSIGNED_SHORT, 0);
  }

  deleteTexture(t) {
    this.gl.deleteTexture(t);
  }
}

/* Model → clip in one shot. The model rotation is Rz·Rx (no yaw), the view is a
   plain pull-back along z, and the projection is orthographic — so the whole
   matrix collapses to three scaled basis columns plus a translation. */
export function makeMvp(out, rotX, rotZ, tx, ty, tz, cam) {
  const a = Math.cos(rotX);
  const b = Math.sin(rotX);
  const e = Math.cos(rotZ);
  const f = Math.sin(rotZ);

  // rows of Rz(rotZ) * Rx(rotX)
  const r00 = e, r01 = -f * a, r02 = f * b;
  const r10 = f, r11 = e * a,  r12 = -e * b;
  const r20 = 0, r21 = b,      r22 = a;

  const { sx, sy, sz, zc, camY, camZ } = cam;

  out[0] = sx * r00; out[1] = sy * r10; out[2] = sz * r20; out[3] = 0;
  out[4] = sx * r01; out[5] = sy * r11; out[6] = sz * r21; out[7] = 0;
  out[8] = sx * r02; out[9] = sy * r12; out[10] = sz * r22; out[11] = 0;
  out[12] = sx * tx;
  out[13] = sy * (ty - camY);
  out[14] = sz * (tz - camZ) + zc;
  out[15] = 1;
  return out;
}
