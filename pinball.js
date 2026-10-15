/* ============================================================================
   PINBALL 3D — motor compartilhado (WebGL2)
   ----------------------------------------------------------------------------
   Renderizacao 3D de verdade na GPU (no Windows o navegador executa WebGL2
   sobre Direct3D). Física de pinball em 2D sobre o plano da mesa, com altura
   apenas visual — o mesmo truque do classico "3D Pinball".

   Recursos:
     - iluminacao direta + ambiente hemisferico, especular e reflexo de metal
     - bola de aco com reflexo de ambiente procedural
     - sombra analitica da bola (a esfera escurece o que esta abaixo dela)
     - oclusao ambiente "assada" na textura da mesa (desenhada no canvas)
     - insercoes emissivas (luzes da mesa) em textura propria
     - brilhos aditivos (halos) nas luzes e quando o bumper e acertado
     - 5 mesas com tema, arte, geometria e regras proprias
   ============================================================================ */
(function (raiz) {
  "use strict";

  /* ============================== MATEMATICA ============================== */
  function m4() { return new Float32Array(16); }

  function m4Identidade(o) {
    o[0]=1; o[1]=0; o[2]=0; o[3]=0;
    o[4]=0; o[5]=1; o[6]=0; o[7]=0;
    o[8]=0; o[9]=0; o[10]=1; o[11]=0;
    o[12]=0; o[13]=0; o[14]=0; o[15]=1;
    return o;
  }

  function m4Multiplica(o, a, b) {              // o = a * b (column-major)
    var r = (o === a || o === b) ? new Float32Array(16) : o;
    for (var c = 0; c < 4; c++) {
      for (var l = 0; l < 4; l++) {
        var s = 0;
        for (var k = 0; k < 4; k++) s += a[k * 4 + l] * b[c * 4 + k];
        r[c * 4 + l] = s;
      }
    }
    if (r !== o) for (var i = 0; i < 16; i++) o[i] = r[i];
    return o;
  }

  function m4Perspectiva(o, fovy, aspecto, perto, longe) {
    var f = 1 / Math.tan(fovy / 2);
    for (var i = 0; i < 16; i++) o[i] = 0;
    o[0] = f / aspecto;
    o[5] = f;
    o[10] = (longe + perto) / (perto - longe);
    o[11] = -1;
    o[14] = (2 * longe * perto) / (perto - longe);
    return o;
  }

  function m4Olhar(o, olho, alvo, cima) {
    var zx = olho[0] - alvo[0], zy = olho[1] - alvo[1], zz = olho[2] - alvo[2];
    var lz = Math.sqrt(zx * zx + zy * zy + zz * zz) || 1;
    zx /= lz; zy /= lz; zz /= lz;
    var xx = cima[1] * zz - cima[2] * zy;
    var xy = cima[2] * zx - cima[0] * zz;
    var xz = cima[0] * zy - cima[1] * zx;
    var lx = Math.sqrt(xx * xx + xy * xy + xz * xz);
    if (lx < 1e-6) { xx = 1; xy = 0; xz = 0; } else { xx /= lx; xy /= lx; xz /= lx; }
    var yx = zy * xz - zz * xy, yy = zz * xx - zx * xz, yz = zx * xy - zy * xx;
    o[0] = xx; o[1] = yx; o[2] = zx; o[3] = 0;
    o[4] = xy; o[5] = yy; o[6] = zy; o[7] = 0;
    o[8] = xz; o[9] = yz; o[10] = zz; o[11] = 0;
    o[12] = -(xx * olho[0] + xy * olho[1] + xz * olho[2]);
    o[13] = -(yx * olho[0] + yy * olho[1] + yz * olho[2]);
    o[14] = -(zx * olho[0] + zy * olho[1] + zz * olho[2]);
    o[15] = 1;
    return o;
  }

  // translada * rotaciona(em Z) * escala
  function m4TRS(o, tx, ty, tz, rz, sx, sy, sz) {
    var c = Math.cos(rz), s = Math.sin(rz);
    o[0] = c * sx;  o[1] = s * sx;  o[2] = 0;    o[3] = 0;
    o[4] = -s * sy; o[5] = c * sy;  o[6] = 0;    o[7] = 0;
    o[8] = 0;       o[9] = 0;       o[10] = sz;  o[11] = 0;
    o[12] = tx;     o[13] = ty;     o[14] = tz;  o[15] = 1;
    return o;
  }

  function limitar(v, a, b) { return v < a ? a : (v > b ? b : v); }

  /* ============================ WEBGL: APOIO ============================= */
  function contextoFalso() {
    return new Proxy({}, {
      get: function (alvo, prop) {
        if (prop === 'getShaderParameter' || prop === 'getProgramParameter') return function () { return true; };
        if (prop === 'getUniformLocation' || prop === 'getAttribLocation') return function () { return null; };
        if (prop === 'getParameter') return function () { return 'simulado'; };
        if (prop === 'checkFramebufferStatus') return function () { return 36053; };
        return function () {};
      }
    });
  }

  function compilar(gl, tipo, fonte, aviso) {
    var o = gl.createShader(tipo);
    gl.shaderSource(o, fonte);
    gl.compileShader(o);
    if (aviso && !gl.getShaderParameter(o, gl.COMPILE_STATUS)) {
      aviso.push('erro no shader: ' + gl.getShaderInfoLog(o));
      return null;
    }
    return o;
  }

  function programa(gl, vs, fs, aviso) {
    var v = compilar(gl, gl.VERTEX_SHADER, vs, aviso);
    var f = compilar(gl, gl.FRAGMENT_SHADER, fs, aviso);
    if (!v || !f) return null;
    var p = gl.createProgram();
    gl.attachShader(p, v);
    gl.attachShader(p, f);
    gl.linkProgram(p);
    if (aviso && !gl.getProgramParameter(p, gl.LINK_STATUS)) {
      aviso.push('erro ao ligar programa: ' + gl.getProgramInfoLog(p));
      return null;
    }
    return p;
  }

  // malha: posicoes(3) + normais(3) + uv(2)
  function malha(gl, dados) {
    var vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    var vb = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vb);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(dados.vertices), gl.STATIC_DRAW);
    var ib = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(dados.indices), gl.STATIC_DRAW);
    var passo = 8 * 4;
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, passo, 0);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, passo, 12);
    gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 2, gl.FLOAT, false, passo, 24);
    gl.bindVertexArray(null);
    return { vao: vao, n: dados.indices.length };
  }

  function texturaDeCanvas(gl, canvas) {
    var t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    return t;
  }

  // textura de 1x1 usada onde o objeto nao tem arte (branca ou preta)
  function texturaCor(gl, r, g, b) {
    var t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE,
      new Uint8Array([Math.round(r * 255), Math.round(g * 255), Math.round(b * 255), 255]));
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    return t;
  }

  /* ============================== SHADERS ================================ */
  var VS_PRINCIPAL = [
    '#version 300 es',
    'in vec3 aPos; in vec3 aNor; in vec2 aUV;',
    'uniform mat4 uProj, uView, uModel;',
    'uniform mat3 uNorm;',
    'out vec3 vPos; out vec3 vNor; out vec2 vUV;',
    'void main() {',
    '  vec4 mundo = uModel * vec4(aPos, 1.0);',
    '  vPos = mundo.xyz;',
    '  vNor = uNorm * aNor;',
    '  vUV = aUV;',
    '  gl_Position = uProj * uView * mundo;',
    '}'
  ].join('\n');

  var FS_PRINCIPAL = [
    '#version 300 es',
    'precision highp float;',
    'in vec3 vPos; in vec3 vNor; in vec2 vUV;',
    'uniform sampler2D uTex, uEmis;',
    'uniform float uEmissivo;',
    'uniform vec3 uCor, uLuzDir, uLuzCor, uCam, uAmbCeu, uAmbChao;',
    'uniform float uMetal, uDureza;',
    'uniform vec3 uBolaPos;',
    'uniform float uBolaR, uSombra;',
    'uniform vec3 uPontosLuzPos[12];',
    'uniform vec3 uPontosLuzCor[12];',
    'uniform float uPontosLuzIntens[12];',
    'uniform int uNumLuzes;',
    'out vec4 saida;',
    // ambiente procedural: gradiente + faixas de luz (da o brilho do metal)
    'vec3 ambiente(vec3 d) {',
    '  float t = clamp(d.z * 0.5 + 0.5, 0.0, 1.0);',
    '  vec3 cor = mix(vec3(0.04, 0.05, 0.07), vec3(0.30, 0.36, 0.50), t);',
    '  cor += vec3(0.55, 0.60, 0.72) * smoothstep(0.55, 0.95, d.z);',
    '  cor += vec3(1.00, 0.96, 0.88) * smoothstep(0.62, 0.90, -d.y) * 0.85;',
    '  cor += vec3(0.85, 0.90, 1.00) * smoothstep(0.86, 0.99, d.x) * 0.45;',
    '  return cor;',
    '}',
    'void main() {',
    '  vec3 N = normalize(vNor);',
    '  vec3 V = normalize(uCam - vPos);',
    '  vec3 albedo = uCor * texture(uTex, vUV).rgb;',
    '  vec3 emis = texture(uEmis, vUV).rgb * uEmissivo;',
    '  vec3 L = normalize(uLuzDir);',
    '  float dif = max(dot(N, L), 0.0);',
    '  vec3 H = normalize(L + V);',
    '  float esp = pow(max(dot(N, H), 0.0), uDureza) * mix(1.0, 0.35, uMetal);',
    '  vec3 amb = mix(uAmbChao, uAmbCeu, N.z * 0.5 + 0.5);',
    '  vec3 R = reflect(-V, N);',
    '  vec3 refl = ambiente(R);',
    '  float fres = pow(1.0 - max(dot(N, V), 0.0), 3.0);',
    // Iluminacao pontual dinamica (bumpers e inserts)
    '  vec3 ptDif = vec3(0.0);',
    '  vec3 ptEsp = vec3(0.0);',
    '  for (int k = 0; k < 12; k++) {',
    '    if (k >= uNumLuzes) break;',
    '    vec3 lv = uPontosLuzPos[k] - vPos;',
    '    float dl = length(lv);',
    '    if (dl > 0.01) {',
    '      vec3 lk = lv / dl;',
    '      float att = 1.0 / (1.0 + 0.14 * dl + 0.045 * dl * dl);',
    '      float dfK = max(dot(N, lk), 0.0);',
    '      vec3 hk = normalize(lk + V);',
    '      float esK = pow(max(dot(N, hk), 0.0), uDureza);',
    '      vec3 colK = uPontosLuzCor[k] * (uPontosLuzIntens[k] * att);',
    '      ptDif += colK * dfK;',
    '      ptEsp += colK * esK;',
    '    }',
    '  }',
    '  vec3 cor = albedo * (amb + uLuzCor * dif * 0.70 + ptDif);',
    '  cor += uLuzCor * esp * 0.65 + ptEsp * mix(1.2, 3.2, uMetal);',
    '  cor = mix(cor, refl * mix(albedo, vec3(1.0), uMetal), clamp(uMetal * 0.92 + fres * 0.22, 0.0, 0.98));',
    '  cor += emis;',
    '  if (uSombra > 0.5) {',                            // sombra de oclusao sob a bola
    '    vec3 pc = uBolaPos - vPos;',
    '    float dPlan = length(pc.xy);',
    '    float s = smoothstep(uBolaR * 0.45, uBolaR * 1.6, dPlan);',
    '    cor *= mix(0.35, 1.0, s);',
    '  }',
    '  saida = vec4(cor, 1.0);',
    '}'
  ].join('\n');

  var VS_BRILHO = [
    '#version 300 es',
    'in vec2 aPos;',
    'uniform vec3 uCentro; uniform float uTam; uniform vec3 uDir, uDirC;',
    'uniform mat4 uProj, uView;',
    'out vec2 vUV;',
    'void main() {',
    '  vUV = aPos;',
    '  vec3 p = uCentro + uDir * aPos.x * uTam + uDirC * aPos.y * uTam;',
    '  gl_Position = uProj * uView * vec4(p, 1.0);',
    '}'
  ].join('\n');

  var FS_BRILHO = [
    '#version 300 es',
    'precision mediump float;',
    'in vec2 vUV;',
    'uniform vec3 uCor; uniform float uIntensidade;',
    'out vec4 saida;',
    'void main() {',
    '  float d = length(vUV);',
    '  float a = smoothstep(1.0, 0.0, d);',
    '  a = a * a * uIntensidade;',
    '  saida = vec4(uCor * a, a);',
    '}'
  ].join('\n');

  /* ============================ MALHAS BASICAS =========================== */
  function malhaCaixa() {                     // cubo unitario: -0.5..0.5 em x/y, 0..1 em z
    var v = [], i = [];
    function face(px, py, pz, ux, uy, uz, vx, vy, vz, nx, ny, nz) {
      var base = v.length / 8;
      v.push(px, py, pz, nx, ny, nz, 0, 0);
      v.push(px + ux, py + uy, pz + uz, nx, ny, nz, 1, 0);
      v.push(px + ux + vx, py + uy + vy, pz + uz + vz, nx, ny, nz, 1, 1);
      v.push(px + vx, py + vy, pz + vz, nx, ny, nz, 0, 1);
      i.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
    face(-0.5, -0.5, 1, 1, 0, 0, 0, 1, 0, 0, 0, 1);       // topo
    face(-0.5, -0.5, 0, 0, 1, 0, 1, 0, 0, 0, 0, -1);      // fundo
    face(-0.5, -0.5, 0, 0, 0, 1, 1, 0, 0, 0, -1, 0);      // frente
    face(-0.5, 0.5, 0, 0, 0, 1, 1, 0, 0, 0, 1, 0);        // tras
    face(-0.5, -0.5, 0, 0, 0, 1, 0, 1, 0, -1, 0, 0);      // esquerda
    face(0.5, -0.5, 0, 0, 0, 1, 0, 1, 0, 1, 0, 0);        // direita
    return { vertices: v, indices: i };
  }

  function malhaCilindro(lados) {
    var v = [], i = [], k;
    for (k = 0; k <= lados; k++) {
      var a = (k / lados) * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
      v.push(c, s, 0, c, s, 0, k / lados, 0);
      v.push(c, s, 1, c, s, 0, k / lados, 1);
    }
    for (k = 0; k < lados; k++) {
      var b = k * 2;
      i.push(b, b + 1, b + 3, b, b + 3, b + 2);
    }
    // tampas
    var centroBase = v.length / 8;
    v.push(0, 0, 1, 0, 0, 1, 0.5, 0.5);
    var inicioTopo = v.length / 8;
    for (k = 0; k <= lados; k++) {
      var a2 = (k / lados) * Math.PI * 2;
      v.push(Math.cos(a2), Math.sin(a2), 1, 0, 0, 1, 0.5 + 0.5 * Math.cos(a2), 0.5 + 0.5 * Math.sin(a2));
    }
    for (k = 0; k < lados; k++) i.push(centroBase, inicioTopo + k + 1, inicioTopo + k);
    var centroFundo = v.length / 8;
    v.push(0, 0, 0, 0, 0, -1, 0.5, 0.5);
    var inicioFundo = v.length / 8;
    for (k = 0; k <= lados; k++) {
      var a3 = (k / lados) * Math.PI * 2;
      v.push(Math.cos(a3), Math.sin(a3), 0, 0, 0, -1, 0.5 + 0.5 * Math.cos(a3), 0.5 - 0.5 * Math.sin(a3));
    }
    for (k = 0; k < lados; k++) i.push(centroFundo, inicioFundo + k, inicioFundo + k + 1);
    return { vertices: v, indices: i };
  }

  function malhaEsfera(setores, aneis) {      // raio 1, centrada na origem
    var v = [], i = [], y, x;
    for (y = 0; y <= aneis; y++) {
      var phi = (y / aneis) * Math.PI, sp = Math.sin(phi), cp = Math.cos(phi);
      for (x = 0; x <= setores; x++) {
        var th = (x / setores) * Math.PI * 2;
        var nx = sp * Math.cos(th), ny = sp * Math.sin(th), nz = cp;
        v.push(nx, ny, nz, nx, ny, nz, x / setores, 1 - y / aneis);
      }
    }
    for (y = 0; y < aneis; y++) {
      for (x = 0; x < setores; x++) {
        var a = y * (setores + 1) + x, b = a + setores + 1;
        i.push(a, b, a + 1, a + 1, b, b + 1);
      }
    }
    return { vertices: v, indices: i };
  }

  function malhaPlano() {                     // plano 1x1 no plano xy, z=0
    // o canvas da arte tem a linha 0 em cima (y=42 da mesa): por isso v=0 no topo
    return {
      vertices: [
        -0.5, -0.5, 0, 0, 0, 1, 0, 1,
         0.5, -0.5, 0, 0, 0, 1, 1, 1,
         0.5,  0.5, 0, 0, 0, 1, 1, 0,
        -0.5,  0.5, 0, 0, 0, 1, 0, 0
      ],
      indices: [0, 1, 2, 0, 2, 3]
    };
  }

  function malhaFlipper(lados) {              // capsula afilada ao longo de +x, 0..1
    var v = [], i = [], k;
    var aneis = 8;
    for (var j = 0; j <= aneis; j++) {
      var t = j / aneis;
      var raio = 1.0 - 0.35 * t;
      for (k = 0; k <= lados; k++) {
        var a = (k / lados) * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
        v.push(t, c * raio, s * raio, 0, c, s, t, k / lados);
      }
    }
    for (j = 0; j < aneis; j++) {
      for (k = 0; k < lados; k++) {
        var b = j * (lados + 1) + k, c2 = b + lados + 1;
        i.push(b, b + 1, c2 + 1, b, c2 + 1, c2);
      }
    }
    // ponta arredondada
    var ponta = v.length / 8;
    v.push(1.06, 0, 0, 1, 0, 0, 1, 0.5);
    var inicio = v.length / 8;
    for (k = 0; k <= lados; k++) {
      var a2 = (k / lados) * Math.PI * 2;
      v.push(1.0, Math.cos(a2) * 0.65, Math.sin(a2) * 0.65, 1, 0, 0, 1, k / lados);
    }
    for (k = 0; k < lados; k++) i.push(ponta, inicio + k, inicio + k + 1);
    return { vertices: v, indices: i };
  }

  /* ============================== AS MESAS =============================== */
  /* Coordenadas da mesa: x de 0 a 20 (largura) e y de 0 a 42 (comprimento).
     A bola comeca no canal do lancador, no canto inferior direito.           */

  var LARGURA = 20, COMPRIMENTO = 42, BOLA_RAIO = 0.38;

  // moldura comum a todas as mesas (paredes externas, canal, funis, flippers)
  function moldura() {
    return {
      paredes: [
        // contorno externo continuo: sobe a esquerda, arco do topo, desce a
        // direita, faz o fundo do canal do lancador e sobe a parede interna guia
        [[0.7, 4.0], [0.7, 33.0], [1.9, 36.4], [4.6, 39.2], [8.0, 40.4],
         [12.0, 40.4], [15.4, 39.2], [18.1, 36.4], [19.3, 33.0], [19.3, 0.9],
         [17.3, 0.9], [17.3, 34.0]],
        // defletor da orbita superior: direciona a bola do topo para os bumpers centrais
        [[1.9, 36.4], [3.6, 35.2], [4.8, 34.2]],
        // guias verticais dos rollovers superiores A-B-C (amortecem e direcionam para os bumpers)
        [[7.8, 34.0], [7.8, 37.2]],
        [[12.2, 34.0], [12.2, 37.2]],
        // guias de inlane alimentando os flippers
        [[3.4, 11.6], [3.4, 6.6], [4.6, 5.8], [5.8, 5.3]],
        [[15.2, 11.6], [15.2, 6.6], [15.4, 5.8], [14.2, 5.3]],
        // funis de dreno descendentes continuos (sem subidas, direcionando para o dreno)
        [[0.7, 4.0], [2.2, 2.0], [4.6, 1.3]],
        [[17.3, 4.0], [15.8, 2.0], [13.4, 1.3]]
      ],
      alvos: [],
      circulos: [
        { x: 7.8, y: 37.2, r: 0.32, tipo: 'post', cor: 1 },
        { x: 12.2, y: 37.2, r: 0.32, tipo: 'post', cor: 1 },
        { x: 7.8, y: 34.0, r: 0.28, tipo: 'post', cor: 1 },
        { x: 12.2, y: 34.0, r: 0.28, tipo: 'post', cor: 1 },
        { x: 4.8, y: 34.2, r: 0.32, tipo: 'post', cor: 1 },
        { x: 17.3, y: 34.0, r: 0.32, tipo: 'post', cor: 1 },
        { x: 3.4, y: 11.6, r: 0.42, tipo: 'post', cor: 1 },
        { x: 15.2, y: 11.6, r: 0.42, tipo: 'post', cor: 1 },
        // Pino salvador central (Center Save Post) — barreira anti-dreno consagrada em y=1.35 (abaixo dos flippers)
        { x: 10.0, y: 1.35, r: 0.28, tipo: 'post', cor: 1 }
      ],
      pocos: [],
      portoes: [],
      spinners: [],
      slings: [
        { x: 3.4, y: 11.6, ax: 3.4, ay: 6.8, bx: 5.2, by: 8.6, pontos: 120 },
        { x: 15.2, y: 11.6, ax: 15.2, ay: 6.8, bx: 13.8, by: 8.6, pontos: 120 }
      ],
      flippers: {
        esq: { x: 6.2, y: 4.3, comp: 3.35 },
        dir: { x: 13.8, y: 4.3, comp: 3.35 }
      },
      lancador: { x: 18.3, y: 2.4 }
    };
  }

  /* --------------------------- ferramentas de arte ------------------------ */
  function traco(ctx, pontos, largura, cor) {
    ctx.beginPath();
    ctx.moveTo(pontos[0][0], pontos[0][1]);
    for (var i = 1; i < pontos.length; i++) ctx.lineTo(pontos[i][0], pontos[i][1]);
    ctx.lineWidth = largura;
    ctx.strokeStyle = cor;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.stroke();
  }
  function disco(ctx, x, y, r, cor) {
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = cor; ctx.fill();
  }
  function anel(ctx, x, y, r, largura, cor) {
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.lineWidth = largura; ctx.strokeStyle = cor; ctx.stroke();
  }
  function texto(ctx, str, x, y, tam, cor, alinhamento) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(1, -1);                                  // desfaz o espelhamento do eixo y
    ctx.font = '700 ' + tam + 'px "Arial Black", Impact, sans-serif';
    ctx.textAlign = alinhamento || 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = cor;
    ctx.fillText(str, 0, 0);
    ctx.restore();
  }
  // sombra "assada" embaixo das paredes (da profundidade sem custo na GPU)
  function sombraParedes(albedo, paredes) {
    var camadas = [[3.6, 'rgba(0,0,0,0.10)'], [2.6, 'rgba(0,0,0,0.16)'], [1.8, 'rgba(0,0,0,0.26)']];
    for (var c = 0; c < camadas.length; c++) traco(albedo, paredes, camadas[c][0], camadas[c][1]);
  }
  function sombraDisco(albedo, x, y, r) {
    var g = albedo.createRadialGradient(x, y - r * 0.35, r * 0.35, x, y - r * 0.35, r * 2.0);
    g.addColorStop(0, 'rgba(0,0,0,0.42)');
    g.addColorStop(0.55, 'rgba(0,0,0,0.16)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    albedo.beginPath(); albedo.arc(x, y - r * 0.35, r * 2.0, 0, Math.PI * 2);
    albedo.fillStyle = g; albedo.fill();
  }

  /* ------------------------------- MESA 1 -------------------------------- */
  function mesaEspaco() {
    var m = moldura();
    m.id = 'espaco';
    m.nome = 'ESPACO';
    m.subtitulo = 'ORBITA PERDIDA';
    m.missao = 'Acenda os 3 alvos para dobrar os pontos';
    m.cores = {
      fundo: [0.02, 0.03, 0.06],
      ceu: [0.20, 0.26, 0.42], chao: [0.03, 0.04, 0.07],
      luz: [0.85, 0.92, 1.0], luzDir: [0.35, 0.55, 0.75],
      parede: [0.55, 0.60, 0.72], mesa: [0.18, 0.24, 0.52],
      emissivo1: [0.25, 0.85, 1.0], emissivo2: [1.0, 0.62, 0.25]
    };
    m.bumpers = [
      { x: 7.2, y: 25.5, r: 1.20, pontos: 100, forca: 155, cor: [0.20, 0.75, 1.0] },
      { x: 10.0, y: 29.4, r: 1.20, pontos: 100, forca: 155, cor: [0.20, 0.75, 1.0] },
      { x: 12.8, y: 25.5, r: 1.20, pontos: 100, forca: 155, cor: [0.20, 0.75, 1.0] }
    ];
    m.alvos = [
      { x: 3.2, y: 27.0, ang: Math.PI / 2, larg: 1.9, alt: 0.42, pontos: 500, cor: [1.0, 0.6, 0.2] },
      { x: 3.2, y: 29.4, ang: Math.PI / 2, larg: 1.9, alt: 0.42, pontos: 500, cor: [1.0, 0.6, 0.2] },
      { x: 3.2, y: 31.8, ang: Math.PI / 2, larg: 1.9, alt: 0.42, pontos: 500, cor: [1.0, 0.6, 0.2] },
      // Banco de 3 alvos de energia estelar no meio de campo à direita
      { x: 15.4, y: 15.5, ang: Math.PI / 2, larg: 1.6, alt: 0.42, pontos: 500, cor: [0.3, 0.85, 1.0] },
      { x: 15.4, y: 17.5, ang: Math.PI / 2, larg: 1.6, alt: 0.42, pontos: 500, cor: [0.3, 0.85, 1.0] },
      { x: 15.4, y: 19.5, ang: Math.PI / 2, larg: 1.6, alt: 0.42, pontos: 500, cor: [0.3, 0.85, 1.0] }
    ];
    m.spinners = [
      { id: 'sp_espaco', x: 4.8, y: 22.0, larg: 1.6, pontos: 150, cor: [0.3, 0.85, 1.0] }
    ];
    m.paredes.push(
      [[4.8, 22.0], [4.8, 32.5], [4.8, 34.2]],                     // guia do banco de alvos conectada ao defletor
      [[15.4, 21.0], [15.4, 33.5]]                                 // guia direita (corredor livre de 1.9)
    );
    m.circulos.push(
      { x: 4.8, y: 22.0, r: 0.35, tipo: 'post', cor: 1 },
      { x: 15.4, y: 21.0, r: 0.35, tipo: 'post', cor: 1 },
      { x: 15.4, y: 33.5, r: 0.35, tipo: 'post', cor: 1 },
      { x: 10.0, y: 20.0, r: 0.45, tipo: 'post', cor: 1 },
      // Postes extras defletores no meio-campo para prolongar a jogabilidade
      { x: 10.0, y: 16.5, r: 0.42, tipo: 'post', cor: 1 },
      { x: 6.2, y: 18.0, r: 0.38, tipo: 'post', cor: 1 },
      { x: 13.8, y: 18.0, r: 0.38, tipo: 'post', cor: 1 },
      { x: 7.5, y: 14.2, r: 0.38, tipo: 'post', cor: 1 },
      { x: 12.5, y: 14.2, r: 0.38, tipo: 'post', cor: 1 },
      { x: 10.0, y: 12.0, r: 0.42, tipo: 'post', cor: 1 }
    );
    m.pocos = [
      { id: 'buraco_negro', nome: 'BURACO NEGRO', x: 10.0, y: 36.6, r: 0.95,
        ejectX: 4.2, ejectY: 20.0, ejectVx: 60, ejectVy: -80, holdTime: 0.6, pontos: 2000, cor: [0.15, 0.45, 0.95] }
    ];
    m.portoes = [
      { id: 'escudo', nome: 'ESCUDO ORBITAL', x: 10.0, y: 33.5, larg: 2.8, alt: 0.45, ang: 0,
        hp: 3, maxHp: 3, pontos: 800, cor: [0.25, 0.85, 1.0] }
    ];
    m.luzes = [
      { x: 7.0, y: 25.5, r: 2.2, cor: [0.3, 0.8, 1], intens: 0.55 },
      { x: 10.0, y: 29.4, r: 2.2, cor: [0.3, 0.8, 1], intens: 0.55 },
      { x: 13.0, y: 25.5, r: 2.2, cor: [0.3, 0.8, 1], intens: 0.55 },
      { x: 3.2, y: 29.4, r: 1.7, cor: [1, 0.65, 0.3], intens: 0.40 },
      { x: 10.0, y: 37.6, r: 2.6, cor: [0.5, 0.75, 1], intens: 0.32 },
      { x: 1.8, y: 3.2, r: 1.8, cor: [0.2, 0.95, 0.4], intens: 0.8, tipo: 'kickback' },
      { x: 10.0, y: 3.8, r: 1.8, cor: [1.0, 0.5, 0.15], intens: 0.8, tipo: 'salva' },
      { x: 10.0, y: 11.5, r: 1.6, cor: [0.2, 0.8, 1.0], intens: 0.6, tipo: 'seta', fase: 0 },
      { x: 10.0, y: 15.5, r: 1.8, cor: [0.2, 0.8, 1.0], intens: 0.6, tipo: 'seta', fase: 1.0 },
      { x: 10.0, y: 22.0, r: 2.0, cor: [0.2, 0.8, 1.0], intens: 0.6, tipo: 'seta', fase: 2.0 },
      { x: 3.6, y: 17.5, r: 1.6, cor: [1.0, 0.7, 0.2], intens: 0.5, tipo: 'seta', fase: 0.5 },
      { x: 16.4, y: 17.5, r: 1.6, cor: [1.0, 0.7, 0.2], intens: 0.5, tipo: 'seta', fase: 1.5 },
      { x: 10.0, y: 35.0, r: 2.2, cor: [0.3, 0.9, 1.0], intens: 0.5, tipo: 'pisca', fase: 0 }
    ];
    m.arte = function (a, e, t) {
      var g = a.createLinearGradient(0, 0, 0, 42);
      g.addColorStop(0, '#141d3f'); g.addColorStop(0.5, '#1b2550'); g.addColorStop(1, '#0d1230');
      a.fillStyle = g; a.fillRect(-1, -1, 22, 44);
      // estrelas
      for (var i = 0; i < 190; i++) {
        var sx = Math.random() * 20, sy = Math.random() * 42, r = 0.03 + Math.random() * 0.09;
        a.fillStyle = 'rgba(255,255,255,' + (0.25 + Math.random() * 0.6) + ')';
        a.beginPath(); a.arc(sx, sy, r, 0, Math.PI * 2); a.fill();
      }
      // nebulosa
      var n = a.createRadialGradient(10, 30, 1, 10, 30, 16);
      n.addColorStop(0, 'rgba(80,120,255,0.22)'); n.addColorStop(1, 'rgba(80,120,255,0)');
      a.fillStyle = n; a.fillRect(0, 0, 20, 42);
      // planeta
      var p = a.createRadialGradient(15.6, 36.6, 0.3, 15.6, 36.6, 3.0);
      p.addColorStop(0, '#8fd8ff'); p.addColorStop(0.6, '#2f6fd0'); p.addColorStop(1, '#123055');
      a.beginPath(); a.arc(15.6, 36.6, 3.0, 0, Math.PI * 2); a.fillStyle = p; a.fill();
      anel(a, 15.6, 36.6, 4.3, 0.32, 'rgba(150,200,255,0.55)');
      // faixas de guia
      a.strokeStyle = 'rgba(120,180,255,0.20)'; a.lineWidth = 0.9;
      a.beginPath(); a.arc(10, 31, 7.6, Math.PI * 0.15, Math.PI * 0.85); a.stroke();
      a.beginPath(); a.arc(10, 31, 9.4, Math.PI * 0.18, Math.PI * 0.82); a.stroke();
      disco(a, 10, 22.5, 2.4, '#0d1738');
      anel(a, 10, 22.5, 2.4, 0.22, 'rgba(90,150,240,0.6)');
      texto(a, 'ORBITA', 10, 22.9, 2.5, 'rgba(150,200,255,0.55)');
      texto(a, 'PERDIDA', 10, 20.9, 1.5, 'rgba(120,170,240,0.45)');
      sombraParedes(a, t.paredes);
      for (var b = 0; b < t.bumpers.length; b++) sombraDisco(a, t.bumpers[b].x, t.bumpers[b].y, t.bumpers[b].r);
      sombraDisco(a, 15.6, 36.6, 3.0);
      // brilho: faixas e insercoes
      e.strokeStyle = 'rgba(60,180,255,0.85)'; e.lineWidth = 0.16;
      e.beginPath(); e.arc(10, 31, 7.6, Math.PI * 0.15, Math.PI * 0.85); e.stroke();
      e.beginPath(); e.arc(10, 31, 9.4, Math.PI * 0.18, Math.PI * 0.82); e.stroke();
      e.lineWidth = 0.3;
      e.beginPath(); e.arc(10, 22.5, 2.4, 0, Math.PI * 2); e.strokeStyle = 'rgba(90,170,255,0.7)'; e.stroke();
      for (var q = 0; q < 6; q++) {
        var ang = Math.PI * (0.18 + q * 0.13);
        disco(e, 10 + Math.cos(ang) * 11.4, 31 + Math.sin(ang) * 11.4, 0.2, 'rgba(120,220,255,0.8)');
      }
      for (var v = 0; v < t.alvos.length; v++) {
        disco(e, t.alvos[v].x, t.alvos[v].y, 0.3, 'rgba(255,170,80,0.75)');
      }
    };
    return m;
  }

  /* ------------------------------- MESA 2 -------------------------------- */
  function mesaFliperama() {
    var m = moldura();
    m.id = 'fliperama';
    m.nome = 'FLIPERAMA';
    m.subtitulo = 'INSIRA UMA FICHA';
    m.missao = 'Derrube os 4 alvos para o bonus';
    m.cores = {
      fundo: [0.02, 0.01, 0.04],
      ceu: [0.30, 0.12, 0.35], chao: [0.04, 0.02, 0.06],
      luz: [1.0, 0.75, 1.0], luzDir: [0.3, 0.5, 0.7],
      parede: [0.85, 0.30, 0.75], mesa: [0.22, 0.06, 0.30],
      emissivo1: [1.0, 0.25, 0.75], emissivo2: [1.0, 0.9, 0.2]
    };
    m.bumpers = [
      { x: 10.0, y: 23.5, r: 1.15, pontos: 150, forca: 165, cor: [1.0, 0.25, 0.7] },
      { x: 7.0, y: 28.0, r: 1.15, pontos: 150, forca: 165, cor: [1.0, 0.25, 0.7] },
      { x: 13.0, y: 28.0, r: 1.15, pontos: 150, forca: 165, cor: [0.4, 0.9, 1.0] },
      { x: 10.0, y: 32.5, r: 1.15, pontos: 150, forca: 165, cor: [0.4, 0.9, 1.0] }
    ];
    m.alvos = [
      { x: 6.0, y: 35.6, ang: 0, larg: 1.9, alt: 0.42, pontos: 750, cor: [1.0, 0.85, 0.2] },
      { x: 8.6, y: 35.6, ang: 0, larg: 1.9, alt: 0.42, pontos: 750, cor: [1.0, 0.85, 0.2] },
      { x: 11.4, y: 35.6, ang: 0, larg: 1.9, alt: 0.42, pontos: 750, cor: [1.0, 0.85, 0.2] },
      { x: 14.0, y: 35.6, ang: 0, larg: 1.9, alt: 0.42, pontos: 750, cor: [1.0, 0.85, 0.2] },
      // Banco de alvos 1UP no meio de campo à esquerda
      { x: 3.2, y: 14.5, ang: Math.PI / 2, larg: 1.6, alt: 0.42, pontos: 600, cor: [1.0, 0.3, 0.8] },
      { x: 3.2, y: 16.8, ang: Math.PI / 2, larg: 1.6, alt: 0.42, pontos: 600, cor: [1.0, 0.3, 0.8] },
      { x: 3.2, y: 19.1, ang: Math.PI / 2, larg: 1.6, alt: 0.42, pontos: 600, cor: [1.0, 0.3, 0.8] }
    ];
    m.spinners = [
      { id: 'sp_flip', x: 4.6, y: 20.0, larg: 1.6, pontos: 150, cor: [1.0, 0.3, 0.8] }
    ];
    m.paredes.push(
      [[4.6, 20.0], [4.6, 32.0], [4.8, 34.2]],
      [[15.6, 20.0], [15.6, 33.5]]
    );
    m.flippers.superiorDir = { x: 13.8, y: 27.0, comp: 2.4 };
    m.circulos.push(
      { x: 10.0, y: 39.2, r: 0.50, tipo: 'post', cor: 1 },
      { x: 10.0, y: 19.0, r: 0.50, tipo: 'post', cor: 1 },
      { x: 7.4, y: 21.4, r: 0.45, tipo: 'post', cor: 1 },
      { x: 12.6, y: 21.4, r: 0.45, tipo: 'post', cor: 1 },
      { x: 4.6, y: 20.0, r: 0.35, tipo: 'post', cor: 1 },
      { x: 15.6, y: 20.0, r: 0.35, tipo: 'post', cor: 1 },
      { x: 15.6, y: 33.5, r: 0.35, tipo: 'post', cor: 1 },
      // Postes extras no campo inferior para retenção dinâmica
      { x: 10.0, y: 16.0, r: 0.45, tipo: 'post', cor: 1 },
      { x: 5.8, y: 17.0, r: 0.38, tipo: 'post', cor: 1 },
      { x: 14.2, y: 17.0, r: 0.38, tipo: 'post', cor: 1 },
      { x: 7.6, y: 13.5, r: 0.38, tipo: 'post', cor: 1 },
      { x: 12.4, y: 13.5, r: 0.38, tipo: 'post', cor: 1 },
      { x: 10.0, y: 11.2, r: 0.42, tipo: 'post', cor: 1 }
    );
    m.pocos = [
      { id: 'sala_arcade', nome: 'SALA ARCADE', x: 5.4, y: 24.0, r: 0.9,
        ejectX: 5.4, ejectY: 20.0, ejectVx: 40, ejectVy: -100, holdTime: 0.6, pontos: 2500, cor: [1.0, 0.25, 0.75] }
    ];
    m.portoes = [
      { id: 'chefao', nome: 'CHEFÃO 8-BIT', x: 10.0, y: 36.5, larg: 3.2, alt: 0.45, ang: 0,
        hp: 4, maxHp: 4, pontos: 1000, cor: [1.0, 0.85, 0.2] }
    ];
    m.luzes = [
      { x: 10.0, y: 24.0, r: 2.2, cor: [1, 0.3, 0.8], intens: 0.6 },
      { x: 6.8, y: 28.5, r: 2.2, cor: [1, 0.3, 0.8], intens: 0.6 },
      { x: 13.2, y: 28.5, r: 2.2, cor: [0.4, 0.9, 1], intens: 0.6 },
      { x: 10.0, y: 33.0, r: 2.2, cor: [0.4, 0.9, 1], intens: 0.6 },
      { x: 10.0, y: 39.0, r: 3.4, cor: [1, 0.85, 0.3], intens: 0.3 },
      { x: 1.8, y: 3.2, r: 1.8, cor: [0.2, 1.0, 0.5], intens: 0.8, tipo: 'kickback' },
      { x: 10.0, y: 3.8, r: 1.8, cor: [1.0, 0.4, 0.2], intens: 0.8, tipo: 'salva' },
      { x: 10.0, y: 10.0, r: 1.6, cor: [1.0, 0.2, 0.8], intens: 0.6, tipo: 'seta', fase: 0 },
      { x: 10.0, y: 14.5, r: 1.8, cor: [1.0, 0.2, 0.8], intens: 0.6, tipo: 'seta', fase: 1.0 },
      { x: 10.0, y: 19.0, r: 2.0, cor: [0.2, 0.9, 1.0], intens: 0.6, tipo: 'seta', fase: 2.0 },
      { x: 14.5, y: 23.0, r: 1.7, cor: [1.0, 0.85, 0.2], intens: 0.5, tipo: 'pisca', fase: 0.8 },
      { x: 10.0, y: 38.0, r: 2.4, cor: [1.0, 0.85, 0.2], intens: 0.5, tipo: 'pisca', fase: 1.6 }
    ];
    m.arte = function (a, e, t) {
      a.fillStyle = '#0b0212'; a.fillRect(-1, -1, 22, 44);
      // grade synthwave
      a.strokeStyle = 'rgba(255,60,180,0.28)'; a.lineWidth = 0.12;
      for (var x = 0; x <= 20; x += 1.6) {
        a.beginPath(); a.moveTo(x, 0); a.lineTo(10 + (x - 10) * 0.35, 22); a.stroke();
      }
      for (var y = 0; y <= 22; y += 2.2) {
        a.beginPath(); a.moveTo(0, y); a.lineTo(20, y); a.stroke();
      }
      // sol com faixas
      var s = a.createLinearGradient(0, 30, 0, 38);
      s.addColorStop(0, '#ffd93b'); s.addColorStop(0.5, '#ff5f6d'); s.addColorStop(1, '#7a1fff');
      a.beginPath(); a.arc(10, 33, 5.2, 0, Math.PI * 2); a.fillStyle = s; a.fill();
      a.fillStyle = '#0b0212';
      for (var i = 0; i < 5; i++) a.fillRect(4, 30.2 + i * 1.0, 12, 0.42 + i * 0.12);
      // triangulo central
      disco(a, 10, 21, 2.6, '#160426');
      anel(a, 10, 21, 2.6, 0.2, 'rgba(255,80,200,0.7)');
      a.beginPath(); a.moveTo(10, 23.0); a.lineTo(12.1, 19.4); a.lineTo(7.9, 19.4); a.closePath();
      a.fillStyle = 'rgba(255,80,200,0.35)'; a.fill();
      // "insira uma ficha"
      a.save(); a.globalAlpha = 0.85;
      texto(a, 'FLIPERAMA', 10, 15.5, 2.6, 'rgba(255,120,220,0.85)');
      a.restore();
      texto(a, 'INSIRA UMA FICHA', 10, 13.2, 0.95, 'rgba(255,220,120,0.55)');
      sombraParedes(a, t.paredes);
      for (var b = 0; b < t.bumpers.length; b++) sombraDisco(a, t.bumpers[b].x, t.bumpers[b].y, t.bumpers[b].r);
      for (var k = 0; k < t.alvos.length; k++) {
        a.fillStyle = 'rgba(0,0,0,0.35)';
        a.fillRect(t.alvos[k].x - 1.1, t.alvos[k].y - 0.5, 2.2, 0.16);
      }
      // brilho
      e.strokeStyle = 'rgba(255,60,190,0.75)'; e.lineWidth = 0.14;
      e.beginPath(); e.arc(10, 21, 2.6, 0, Math.PI * 2); e.stroke();
      e.beginPath(); e.arc(10, 33, 5.2, 0, Math.PI * 2); e.strokeStyle = 'rgba(255,190,60,0.6)'; e.stroke();
      for (var x2 = 0; x2 <= 20; x2 += 1.6) {
        a.strokeStyle = 'rgba(60,230,255,0.0)'; e.beginPath();
        e.moveTo(10 + (x2 - 10) * 0.35, 22); e.lineTo(x2, 0);
        e.strokeStyle = 'rgba(60,220,255,0.16)'; e.lineWidth = 0.08; e.stroke();
      }
      for (var v = 0; v < t.alvos.length; v++) disco(e, t.alvos[v].x, t.alvos[v].y, 0.26, 'rgba(255,230,90,0.85)');
    };
    return m;
  }

  /* ------------------------------- MESA 3 -------------------------------- */
  function mesaSelva() {
    var m = moldura();
    m.id = 'selva';
    m.nome = 'SELVA';
    m.subtitulo = 'VALE DOS DINOSSAUROS';
    m.missao = 'Bata nos 3 troncos e derrube os alvos';
    m.cores = {
      fundo: [0.01, 0.03, 0.01],
      ceu: [0.30, 0.34, 0.16], chao: [0.03, 0.05, 0.02],
      luz: [1.0, 0.94, 0.72], luzDir: [-0.45, 0.4, 0.8],
      parede: [0.42, 0.34, 0.18], mesa: [0.12, 0.26, 0.12],
      emissivo1: [0.55, 1.0, 0.35], emissivo2: [1.0, 0.72, 0.25]
    };
    m.bumpers = [
      { x: 6.8, y: 26.0, r: 1.20, pontos: 120, forca: 150, cor: [0.45, 0.62, 0.22] },
      { x: 13.2, y: 26.0, r: 1.20, pontos: 120, forca: 150, cor: [0.45, 0.62, 0.22] },
      { x: 10.0, y: 30.5, r: 1.25, pontos: 200, forca: 165, cor: [0.62, 0.72, 0.26] }
    ];
    m.alvos = [
      { x: 16.2, y: 22.0, ang: Math.PI / 2, larg: 1.7, alt: 0.42, pontos: 400, cor: [1.0, 0.72, 0.25] },
      { x: 16.2, y: 24.0, ang: Math.PI / 2, larg: 1.7, alt: 0.42, pontos: 400, cor: [1.0, 0.72, 0.25] },
      { x: 16.2, y: 26.0, ang: Math.PI / 2, larg: 1.7, alt: 0.42, pontos: 400, cor: [1.0, 0.72, 0.25] },
      // Banco de alvos Pegadas de Raptor no meio de campo à esquerda
      { x: 3.2, y: 14.5, ang: Math.PI / 2, larg: 1.6, alt: 0.42, pontos: 550, cor: [0.55, 1.0, 0.35] },
      { x: 3.2, y: 16.8, ang: Math.PI / 2, larg: 1.6, alt: 0.42, pontos: 550, cor: [0.55, 1.0, 0.35] },
      { x: 3.2, y: 19.1, ang: Math.PI / 2, larg: 1.6, alt: 0.42, pontos: 550, cor: [0.55, 1.0, 0.35] }
    ];
    m.spinners = [
      { id: 'sp_selva', x: 4.4, y: 21.0, larg: 1.6, pontos: 150, cor: [0.55, 1.0, 0.35] }
    ];
    m.paredes.push(
      [[4.4, 21.0], [4.4, 32.5], [4.8, 34.2]],
      [[15.2, 19.0], [15.2, 33.5]],
      [[13.8, 36.4], [15.2, 34.6]]
    );
    m.circulos.push(
      { x: 7.6, y: 22.4, r: 0.48, tipo: 'post', cor: 1 },
      { x: 12.4, y: 22.4, r: 0.48, tipo: 'post', cor: 1 },
      { x: 6.0, y: 19.6, r: 0.42, tipo: 'post', cor: 1 },
      { x: 14.0, y: 19.6, r: 0.42, tipo: 'post', cor: 1 },
      { x: 4.4, y: 21.0, r: 0.35, tipo: 'post', cor: 1 },
      { x: 15.2, y: 19.0, r: 0.35, tipo: 'post', cor: 1 },
      { x: 15.2, y: 33.5, r: 0.35, tipo: 'post', cor: 1 },
      // Postes totens extras no meio do vale para manter a bola ativa
      { x: 8.5, y: 17.0, r: 0.42, tipo: 'post', cor: 1 },
      { x: 11.5, y: 17.0, r: 0.42, tipo: 'post', cor: 1 },
      { x: 3.6, y: 17.5, r: 0.38, tipo: 'post', cor: 1 },
      { x: 7.2, y: 13.5, r: 0.40, tipo: 'post', cor: 1 },
      { x: 12.8, y: 13.5, r: 0.40, tipo: 'post', cor: 1 },
      { x: 10.0, y: 11.2, r: 0.45, tipo: 'post', cor: 1 }
    );
    m.pocos = [
      { id: 'ninho_dino', nome: 'NINHO DO T-REX', x: 10.0, y: 36.6, r: 0.95,
        ejectX: 7.0, ejectY: 18.0, ejectVx: 50, ejectVy: -90, holdTime: 0.7, pontos: 3000, cor: [0.3, 0.8, 0.2] }
    ];
    m.portoes = [
      { id: 'portao_jurassico', nome: 'PORTÃO JURÁSSICO', x: 10.0, y: 33.8, larg: 3.0, alt: 0.45, ang: 0,
        hp: 3, maxHp: 3, pontos: 750, cor: [0.6, 0.7, 0.2] }
    ];
    m.luzes = [
      { x: 6.4, y: 26.0, r: 2.1, cor: [0.6, 1, 0.4], intens: 0.42 },
      { x: 13.6, y: 26.0, r: 2.1, cor: [0.6, 1, 0.4], intens: 0.42 },
      { x: 10.0, y: 31.0, r: 2.4, cor: [1, 0.9, 0.4], intens: 0.5 },
      { x: 10.0, y: 38.4, r: 3.0, cor: [1, 0.85, 0.5], intens: 0.28 },
      { x: 1.8, y: 3.2, r: 1.8, cor: [0.3, 1.0, 0.3], intens: 0.8, tipo: 'kickback' },
      { x: 10.0, y: 3.8, r: 1.8, cor: [1.0, 0.6, 0.1], intens: 0.8, tipo: 'salva' },
      { x: 10.0, y: 11.0, r: 1.6, cor: [0.5, 1.0, 0.3], intens: 0.6, tipo: 'seta', fase: 0 },
      { x: 10.0, y: 15.0, r: 1.8, cor: [0.5, 1.0, 0.3], intens: 0.6, tipo: 'seta', fase: 1.0 },
      { x: 10.0, y: 20.0, r: 2.0, cor: [0.8, 1.0, 0.2], intens: 0.6, tipo: 'seta', fase: 2.0 },
      { x: 10.0, y: 35.5, r: 2.4, cor: [1.0, 0.7, 0.1], intens: 0.5, tipo: 'pisca', fase: 0.5 }
    ];
    m.arte = function (a, e, t) {
      var g = a.createLinearGradient(0, 0, 0, 42);
      g.addColorStop(0, '#1d3a17'); g.addColorStop(0.5, '#254a1c'); g.addColorStop(1, '#122a10');
      a.fillStyle = g; a.fillRect(-1, -1, 22, 44);
      // folhagem nas bordas
      for (var i = 0; i < 70; i++) {
        var lado = i % 2 ? 1 : 0;
        var px2 = lado ? 19.4 - Math.random() * 1.6 : 0.6 + Math.random() * 1.6;
        var py = Math.random() * 42;
        a.save(); a.translate(px2, py); a.rotate((Math.random() - 0.5) * 1.4);
        a.beginPath(); a.ellipse(0, 0, 1.5, 0.42, 0, 0, Math.PI * 2);
        a.fillStyle = 'rgba(40,90,35,' + (0.35 + Math.random() * 0.4) + ')'; a.fill();
        a.restore();
      }
      // pegadas de dino
      for (var p = 0; p < 4; p++) {
        var cx = 6 + p * 2.8, cy = 16 + (p % 2) * 1.4;
        for (var d = 0; d < 3; d++) disco(a, cx - 0.5 + d * 0.5, cy + 0.35, 0.24, 'rgba(20,45,15,0.65)');
        disco(a, cx, cy - 0.3, 0.44, 'rgba(20,45,15,0.65)');
      }
      disco(a, 10, 21.5, 3.0, '#16300f');
      anel(a, 10, 21.5, 3.0, 0.24, 'rgba(150,200,90,0.5)');
      texto(a, 'SELVA', 10, 21.8, 2.6, 'rgba(190,230,120,0.65)');
      sombraParedes(a, t.paredes);
      for (var b = 0; b < t.bumpers.length; b++) sombraDisco(a, t.bumpers[b].x, t.bumpers[b].y, t.bumpers[b].r);
      // brilho
      e.strokeStyle = 'rgba(120,255,80,0.5)'; e.lineWidth = 0.16;
      e.beginPath(); e.arc(10, 21.5, 3.0, 0, Math.PI * 2); e.stroke();
      for (var v = 0; v < t.alvos.length; v++) disco(e, t.alvos[v].x, t.alvos[v].y, 0.24, 'rgba(255,200,90,0.8)');
      e.lineWidth = 0.1; e.strokeStyle = 'rgba(140,255,110,0.28)';
      e.beginPath(); e.moveTo(0.9, 6); e.lineTo(19.1, 6); e.stroke();
    };
    return m;
  }

  /* ------------------------------- MESA 4 -------------------------------- */
  function mesaPirata() {
    var m = moldura();
    m.id = 'pirata';
    m.nome = 'PIRATA';
    m.subtitulo = 'TESOURO AMALDICOADO';
    m.missao = 'Afunde os 4 canhoes e pegue as moedas';
    m.cores = {
      fundo: [0.01, 0.02, 0.03],
      ceu: [0.24, 0.24, 0.20], chao: [0.05, 0.04, 0.02],
      luz: [0.72, 0.68, 0.55], luzDir: [0.20, 0.45, 0.88],
      parede: [0.40, 0.30, 0.16], mesa: [0.06, 0.22, 0.24],
      emissivo1: [1.0, 0.80, 0.30], emissivo2: [0.35, 0.85, 1.0]
    };
    m.bumpers = [
      { x: 7.0, y: 27.0, r: 1.15, pontos: 130, forca: 158, cor: [0.85, 0.68, 0.25] },
      { x: 13.0, y: 27.0, r: 1.15, pontos: 130, forca: 158, cor: [0.85, 0.68, 0.25] },
      { x: 10.0, y: 29.5, r: 1.15, pontos: 130, forca: 158, cor: [0.85, 0.68, 0.25] }
    ];
    m.alvos = [
      { x: 2.8, y: 24.0, ang: Math.PI / 2, larg: 1.8, alt: 0.42, pontos: 600, cor: [1.0, 0.82, 0.30] },
      { x: 2.8, y: 26.0, ang: Math.PI / 2, larg: 1.8, alt: 0.42, pontos: 600, cor: [1.0, 0.82, 0.30] },
      { x: 2.8, y: 28.0, ang: Math.PI / 2, larg: 1.8, alt: 0.42, pontos: 600, cor: [1.0, 0.82, 0.30] },
      { x: 2.8, y: 30.0, ang: Math.PI / 2, larg: 1.8, alt: 0.42, pontos: 600, cor: [1.0, 0.82, 0.30] },
      // Banco de 4 moedas de ouro no meio-campo (eliminando a zona vazia)
      { x: 7.2, y: 13.5, ang: 0, larg: 1.5, alt: 0.42, pontos: 700, cor: [1.0, 0.85, 0.25] },
      { x: 9.1, y: 13.5, ang: 0, larg: 1.5, alt: 0.42, pontos: 700, cor: [1.0, 0.85, 0.25] },
      { x: 10.9, y: 13.5, ang: 0, larg: 1.5, alt: 0.42, pontos: 700, cor: [1.0, 0.85, 0.25] },
      { x: 12.8, y: 13.5, ang: 0, larg: 1.5, alt: 0.42, pontos: 700, cor: [1.0, 0.85, 0.25] }
    ];
    m.spinners = [
      { id: 'sp_pirata', x: 4.8, y: 21.0, larg: 1.6, pontos: 150, cor: [1.0, 0.85, 0.30] }
    ];
    m.paredes.push(
      [[4.8, 21.0], [4.8, 32.5], [4.8, 34.2]],
      [[15.4, 21.0], [15.4, 33.5]]
    );
    m.circulos.push(
      { x: 8.0, y: 21.5, r: 0.45, tipo: 'post', cor: 1 },
      { x: 12.0, y: 21.5, r: 0.45, tipo: 'post', cor: 1 },
      { x: 10.0, y: 18.6, r: 0.45, tipo: 'post', cor: 1 },
      { x: 4.8, y: 21.0, r: 0.35, tipo: 'post', cor: 1 },
      { x: 15.4, y: 21.0, r: 0.35, tipo: 'post', cor: 1 },
      { x: 15.4, y: 33.5, r: 0.35, tipo: 'post', cor: 1 },
      // Postes das âncoras e barris no meio-campo para ricochete e dinâmica contínua
      { x: 5.5, y: 16.0, r: 0.42, tipo: 'post', cor: 1 },
      { x: 14.5, y: 16.0, r: 0.42, tipo: 'post', cor: 1 },
      { x: 7.2, y: 16.5, r: 0.42, tipo: 'post', cor: 1 },
      { x: 12.8, y: 16.5, r: 0.42, tipo: 'post', cor: 1 },
      { x: 10.0, y: 16.0, r: 0.45, tipo: 'post', cor: 1 },
      { x: 10.0, y: 10.5, r: 0.42, tipo: 'post', cor: 1 }
    );
    m.pocos = [
      { id: 'porao_tesouro', nome: 'PORÃO DO TESOURO', x: 10.0, y: 36.0, r: 0.95,
        ejectX: 13.0, ejectY: 19.0, ejectVx: -60, ejectVy: -80, holdTime: 0.7, pontos: 3500, lock: true, cor: [1.0, 0.75, 0.25] }
    ];
    m.portoes = [
      { id: 'porta_forte', nome: 'PORTÃO DO FORTE', x: 10.0, y: 33.0, larg: 3.0, alt: 0.45, ang: 0,
        hp: 3, maxHp: 3, pontos: 900, cor: [0.85, 0.65, 0.2] }
    ];
    m.luzes = [
      { x: 6.6, y: 27.5, r: 2.0, cor: [1, 0.82, 0.35], intens: 0.5 },
      { x: 13.4, y: 27.5, r: 2.0, cor: [1, 0.82, 0.35], intens: 0.5 },
      { x: 10.0, y: 32.6, r: 2.0, cor: [1, 0.82, 0.35], intens: 0.5 },
      { x: 10.0, y: 38.2, r: 3.0, cor: [1, 0.9, 0.6], intens: 0.3 },
      { x: 1.8, y: 3.2, r: 1.8, cor: [0.2, 0.95, 0.7], intens: 0.8, tipo: 'kickback' },
      { x: 10.0, y: 3.8, r: 1.8, cor: [1.0, 0.7, 0.15], intens: 0.8, tipo: 'salva' },
      { x: 10.0, y: 10.5, r: 1.6, cor: [1.0, 0.8, 0.25], intens: 0.6, tipo: 'seta', fase: 0 },
      { x: 10.0, y: 14.5, r: 1.8, cor: [1.0, 0.8, 0.25], intens: 0.6, tipo: 'seta', fase: 1.0 },
      { x: 10.0, y: 22.5, r: 2.0, cor: [1.0, 0.8, 0.25], intens: 0.6, tipo: 'seta', fase: 2.0 },
      { x: 4.2, y: 27.0, r: 1.8, cor: [1.0, 0.3, 0.1], intens: 0.5, tipo: 'pisca', fase: 1.2 },
      { x: 10.0, y: 37.5, r: 2.4, cor: [1.0, 0.85, 0.2], intens: 0.5, tipo: 'pisca', fase: 0.7 }
    ];
    m.arte = function (a, e, t) {
      var g = a.createLinearGradient(0, 0, 0, 42);
      g.addColorStop(0, '#06282c'); g.addColorStop(0.5, '#083036'); g.addColorStop(1, '#04181c');
      a.fillStyle = g; a.fillRect(-1, -1, 22, 44);
      // ondas
      a.strokeStyle = 'rgba(80,180,190,0.20)'; a.lineWidth = 0.16;
      for (var y = 2; y < 20; y += 1.9) {
        a.beginPath();
        for (var x = 0; x <= 20; x += 0.5) a.lineTo(x, y + Math.sin(x * 0.9 + y) * 0.28);
        a.stroke();
      }
      // rosa dos ventos
      a.save(); a.translate(10, 21.5);
      for (var i = 0; i < 8; i++) {
        a.rotate(Math.PI / 4);
        a.beginPath(); a.moveTo(0, 0); a.lineTo(0.55, 1.5); a.lineTo(-0.55, 1.5); a.closePath();
        a.fillStyle = i % 2 ? 'rgba(220,190,110,0.55)' : 'rgba(150,120,60,0.40)'; a.fill();
        a.beginPath(); a.moveTo(0, 0); a.lineTo(0.55, -1.5); a.lineTo(-0.55, -1.5); a.closePath();
        a.fillStyle = 'rgba(30,60,70,0.7)'; a.fill();
      }
      a.restore();
      anel(a, 10, 21.5, 3.4, 0.22, 'rgba(220,190,110,0.55)');
      disco(a, 10, 21.5, 0.5, 'rgba(220,190,110,0.8)');
      texto(a, 'PIRATA', 10, 15.0, 2.6, 'rgba(230,200,120,0.6)');
      // caveira
      disco(a, 16.2, 34.5, 1.5, 'rgba(200,210,200,0.75)');
      a.fillStyle = 'rgba(10,30,34,1)';
      a.beginPath(); a.arc(15.7, 34.8, 0.34, 0, Math.PI * 2); a.fill();
      a.beginPath(); a.arc(16.7, 34.8, 0.34, 0, Math.PI * 2); a.fill();
      a.fillRect(15.6, 33.4, 1.2, 0.36);
      sombraParedes(a, t.paredes);
      for (var b = 0; b < t.bumpers.length; b++) sombraDisco(a, t.bumpers[b].x, t.bumpers[b].y, t.bumpers[b].r);
      sombraDisco(a, 16.2, 34.5, 1.5);
      // brilho
      for (var v = 0; v < t.alvos.length; v++) disco(e, t.alvos[v].x, t.alvos[v].y, 0.26, 'rgba(255,215,110,0.85)');
      e.strokeStyle = 'rgba(255,210,110,0.4)'; e.lineWidth = 0.14;
      e.beginPath(); e.arc(10, 21.5, 3.4, 0, Math.PI * 2); e.stroke();
    };
    return m;
  }

  /* ------------------------------- MESA 5 -------------------------------- */
  function mesaNeon() {
    var m = moldura();
    m.id = 'neon';
    m.nome = 'NEON';
    m.subtitulo = 'CIDADE RETRO';
    m.missao = 'Complete as 4 faixas de neon';
    m.cores = {
      fundo: [0.01, 0.00, 0.03],
      ceu: [0.28, 0.10, 0.36], chao: [0.03, 0.01, 0.06],
      luz: [0.75, 0.90, 1.0], luzDir: [-0.35, 0.45, 0.82],
      parede: [0.25, 0.85, 0.95], mesa: [0.06, 0.04, 0.16],
      emissivo1: [1.0, 0.20, 0.60], emissivo2: [0.20, 0.95, 1.0]
    };
    m.bumpers = [
      { x: 7.2, y: 24.5, r: 1.15, pontos: 140, forca: 162, cor: [1.0, 0.20, 0.60] },
      { x: 12.8, y: 24.5, r: 1.15, pontos: 140, forca: 162, cor: [0.20, 0.95, 1.0] },
      { x: 10.0, y: 29.0, r: 1.15, pontos: 140, forca: 162, cor: [1.0, 0.20, 0.60] }
    ];
    m.alvos = [
      { x: 6.4, y: 34.4, ang: 0, larg: 1.9, alt: 0.42, pontos: 650, cor: [0.20, 0.95, 1.0] },
      { x: 8.9, y: 35.6, ang: 0, larg: 1.9, alt: 0.42, pontos: 650, cor: [0.20, 0.95, 1.0] },
      { x: 11.1, y: 35.6, ang: 0, larg: 1.9, alt: 0.42, pontos: 650, cor: [0.20, 0.95, 1.0] },
      { x: 13.6, y: 34.4, ang: 0, larg: 1.9, alt: 0.42, pontos: 650, cor: [0.20, 0.95, 1.0] },
      // Banco de 3 alvos cibernéticos no meio-campo à direita
      { x: 15.6, y: 14.5, ang: Math.PI / 2, larg: 1.6, alt: 0.42, pontos: 700, cor: [1.0, 0.20, 0.60] },
      { x: 15.6, y: 16.8, ang: Math.PI / 2, larg: 1.6, alt: 0.42, pontos: 700, cor: [1.0, 0.20, 0.60] },
      { x: 15.6, y: 19.1, ang: Math.PI / 2, larg: 1.6, alt: 0.42, pontos: 700, cor: [1.0, 0.20, 0.60] }
    ];
    m.spinners = [
      { id: 'sp_neon', x: 3.6, y: 19.5, larg: 1.6, pontos: 150, cor: [0.20, 0.95, 1.0] }
    ];
    m.paredes.push(
      [[3.6, 19.5], [3.6, 32.5], [4.8, 34.2]],
      [[15.6, 19.5], [15.6, 33.5]]
    );
    m.flippers.superiorEsq = { x: 5.4, y: 26.0, comp: 2.4 };
    m.circulos.push(
      { x: 10.0, y: 22.6, r: 0.5, tipo: 'post', cor: 1 },
      { x: 6.6, y: 21.0, r: 0.42, tipo: 'post', cor: 1 },
      { x: 13.4, y: 21.0, r: 0.42, tipo: 'post', cor: 1 },
      { x: 3.6, y: 19.5, r: 0.35, tipo: 'post', cor: 1 },
      { x: 15.6, y: 19.5, r: 0.35, tipo: 'post', cor: 1 },
      { x: 15.6, y: 33.5, r: 0.35, tipo: 'post', cor: 1 },
      // Postes extras no meio do circuito cibernético
      { x: 7.4, y: 16.5, r: 0.42, tipo: 'post', cor: 1 },
      { x: 12.6, y: 16.5, r: 0.42, tipo: 'post', cor: 1 },
      { x: 10.0, y: 14.5, r: 0.45, tipo: 'post', cor: 1 },
      { x: 7.2, y: 13.5, r: 0.42, tipo: 'post', cor: 1 },
      { x: 12.8, y: 13.5, r: 0.42, tipo: 'post', cor: 1 },
      { x: 10.0, y: 11.5, r: 0.45, tipo: 'post', cor: 1 }
    );
    m.pocos = [
      { id: 'portal_cyber', nome: 'PORTAL CIBERNÉTICO', x: 10.0, y: 37.6, r: 0.95,
        ejectX: 10.0, ejectY: 20.0, ejectVx: 55, ejectVy: -90, holdTime: 0.6, pontos: 4000, cor: [0.2, 0.95, 1.0] }
    ];
    m.portoes = [
      { id: 'firewall', nome: 'FIREWALL DE DEFESA', x: 10.0, y: 33.0, larg: 3.2, alt: 0.45, ang: 0,
        hp: 4, maxHp: 4, pontos: 1200, cor: [1.0, 0.2, 0.6] }
    ];
    m.luzes = [
      { x: 7.2, y: 24.5, r: 2.1, cor: [1, 0.25, 0.65], intens: 0.55 },
      { x: 12.8, y: 24.5, r: 2.1, cor: [0.25, 0.95, 1], intens: 0.55 },
      { x: 10.0, y: 29.0, r: 2.1, cor: [1, 0.25, 0.65], intens: 0.55 },
      { x: 10.0, y: 39.0, r: 3.2, cor: [0.8, 0.4, 1], intens: 0.32 },
      { x: 1.8, y: 3.2, r: 1.8, cor: [0.1, 1.0, 0.8], intens: 0.8, tipo: 'kickback' },
      { x: 10.0, y: 3.8, r: 1.8, cor: [1.0, 0.3, 0.7], intens: 0.8, tipo: 'salva' },
      { x: 10.0, y: 9.5, r: 1.6, cor: [0.1, 0.9, 1.0], intens: 0.6, tipo: 'seta', fase: 0 },
      { x: 10.0, y: 13.5, r: 1.8, cor: [0.1, 0.9, 1.0], intens: 0.6, tipo: 'seta', fase: 1.0 },
      { x: 10.0, y: 18.0, r: 2.0, cor: [1.0, 0.2, 0.7], intens: 0.6, tipo: 'seta', fase: 2.0 },
      { x: 4.5, y: 22.0, r: 1.7, cor: [0.1, 0.9, 1.0], intens: 0.5, tipo: 'pisca', fase: 0.6 },
      { x: 10.0, y: 34.5, r: 2.2, cor: [1.0, 0.2, 0.5], intens: 0.5, tipo: 'pisca', fase: 1.4 },
      { x: 10.0, y: 38.5, r: 2.5, cor: [0.2, 1.0, 0.9], intens: 0.5, tipo: 'pisca', fase: 2.2 }
    ];
    m.arte = function (a, e, t) {
      a.fillStyle = '#07020f'; a.fillRect(-1, -1, 22, 44);
      // grade em perspectiva
      a.strokeStyle = 'rgba(0,220,255,0.30)'; a.lineWidth = 0.1;
      for (var x = -6; x <= 26; x += 2) {
        a.beginPath(); a.moveTo(10 + (x - 10) * 2.6, 0); a.lineTo(x, 13); a.stroke();
      }
      for (var y = 0; y <= 13; y += 1.3) { a.beginPath(); a.moveTo(0, y); a.lineTo(20, y); a.stroke(); }
      // sol retrowave
      var s = a.createLinearGradient(0, 16, 0, 24);
      s.addColorStop(0, '#ffe14d'); s.addColorStop(0.55, '#ff3d8b'); s.addColorStop(1, '#5b1cff');
      a.beginPath(); a.arc(10, 20, 4.4, 0, Math.PI * 2); a.fillStyle = s; a.fill();
      a.fillStyle = '#07020f';
      for (var i = 0; i < 5; i++) a.fillRect(4.6, 17.6 + i * 1.05, 10.8, 0.4 + i * 0.1);
      // palmeiras
      function palmeira(x, y, esc) {
        a.save(); a.translate(x, y); a.scale(esc, esc);
        a.fillStyle = 'rgba(255,60,150,0.75)'; a.fillRect(-0.16, 0, 0.32, 2.6);
        for (var f = 0; f < 6; f++) {
          a.save(); a.translate(0, 2.6); a.rotate(Math.PI * (f / 3 + 0.16));
          a.beginPath(); a.ellipse(0.9, 0, 1.0, 0.22, 0, 0, Math.PI * 2);
          a.fillStyle = 'rgba(255,60,150,0.6)'; a.fill(); a.restore();
        }
        a.restore();
      }
      palmeira(3.0, 27, 0.9); palmeira(17.0, 27, 0.9);
      disco(a, 10, 10.5, 2.2, '#0d0620');
      anel(a, 10, 10.5, 2.2, 0.2, 'rgba(0,230,255,0.6)');
      texto(a, 'NEON', 10, 10.8, 2.4, 'rgba(0,230,255,0.7)');
      sombraParedes(a, t.paredes);
      for (var b = 0; b < t.bumpers.length; b++) sombraDisco(a, t.bumpers[b].x, t.bumpers[b].y, t.bumpers[b].r);
      // brilho
      e.strokeStyle = 'rgba(255,50,150,0.6)'; e.lineWidth = 0.14;
      e.beginPath(); e.arc(10, 20, 4.4, Math.PI, 0); e.stroke();
      e.strokeStyle = 'rgba(0,230,255,0.55)';
      e.beginPath(); e.arc(10, 10.5, 2.2, 0, Math.PI * 2); e.stroke();
      for (var v = 0; v < t.alvos.length; v++) disco(e, t.alvos[v].x, t.alvos[v].y, 0.26, 'rgba(80,240,255,0.85)');
      e.lineWidth = 0.12; e.strokeStyle = 'rgba(255,60,160,0.35)';
      e.beginPath(); e.moveTo(0.9, 25); e.lineTo(19.1, 25); e.stroke();
    };
    return m;
  }

  var MESAS = [mesaEspaco, mesaFliperama, mesaSelva, mesaPirata, mesaNeon];

  /* ============================== FISICA ================================= */
  var GRAVIDADE = 62;                  // pol/s^2 (inclinacao real e cadencia autentica de 6.5 graus das mesas Williams/Bally)
  var PASSO_FISICA = 1 / 960;
  var ATRITO_PAREDE = 0.9965;          // retencao de velocidade tangencial por sub-passo (fluidez em trilhos de aco e funis)

  function montarFisica(mesa) {
    var segs = [], circs = [];
    var i, j;

    function addSeg(a, b, tipo, dados, rest) {
      segs.push({ ax: a[0], ay: a[1], bx: b[0], by: b[1],
                  rest: rest === undefined ? 0.42 : rest,
                  tipo: tipo || 'parede', dados: dados || null });
    }

    for (i = 0; i < mesa.paredes.length; i++) {
      var linha = mesa.paredes[i];
      for (j = 0; j + 1 < linha.length; j++) addSeg(linha[j], linha[j + 1], 'parede');
    }

    // slingshots: triangulo, com a face ativa dando o empurrao
    for (i = 0; i < mesa.slings.length; i++) {
      var s = mesa.slings[i];
      addSeg([s.x, s.y], [s.ax, s.ay], 'parede', null, 0.5);
      addSeg([s.ax, s.ay], [s.bx, s.by], 'parede', null, 0.5);
      addSeg([s.bx, s.by], [s.x, s.y], 'sling', s, 0.55);
    }

    // alvos moveis (viram segmentos que podem sair de cena)
    var alvos = [];
    for (i = 0; i < mesa.alvos.length; i++) {
      var al = mesa.alvos[i];
      var ca = Math.cos(al.ang), sa = Math.sin(al.ang);
      var meiaL = al.larg / 2, meiaA = al.alt / 2;
      function ponto(dx, dy) { return [al.x + dx * ca - dy * sa, al.y + dx * sa + dy * ca]; }
      var p1 = ponto(-meiaL, -meiaA), p2 = ponto(meiaL, -meiaA);
      var p3 = ponto(meiaL, meiaA), p4 = ponto(-meiaL, meiaA);
      var alvo = { dados: al, ativo: true, segs: [] };
      var pares = [[p1, p2], [p2, p3], [p3, p4], [p4, p1]];
      for (j = 0; j < pares.length; j++) {
        var sg = { ax: pares[j][0][0], ay: pares[j][0][1], bx: pares[j][1][0], by: pares[j][1][1],
                   rest: 0.3, tipo: 'alvo', dados: alvo };
        segs.push(sg); alvo.segs.push(sg);
      }
      alvos.push(alvo);
    }

    for (i = 0; i < mesa.circulos.length; i++) {
      var c = mesa.circulos[i];
      circs.push({ x: c.x, y: c.y, r: c.r, tipo: c.tipo, forca: 0, pontos: 0,
                   rest: 0.5, cor: c.cor === undefined ? 1 : c.cor, brilho: 0 });
    }
    for (i = 0; i < mesa.bumpers.length; i++) {
      var b = mesa.bumpers[i];
      circs.push({ x: b.x, y: b.y, r: b.r, tipo: 'bumper', forca: b.forca,
                   pontos: b.pontos, rest: 0.55, cor: 0, brilho: 0, base: b });
    }

    // portoes reativos (destrutiveis com HP)
    var portoes = [];
    if (mesa.portoes) {
      for (i = 0; i < mesa.portoes.length; i++) {
        var pt = mesa.portoes[i];
        var caP = Math.cos(pt.ang), saP = Math.sin(pt.ang);
        var mL = pt.larg / 2, mA = pt.alt / 2;
        function pontoP(dx, dy) { return [pt.x + dx * caP - dy * saP, pt.y + dx * saP + dy * caP]; }
        var pt1 = pontoP(-mL, -mA), pt2 = pontoP(mL, -mA);
        var pt3 = pontoP(mL, mA), pt4 = pontoP(-mL, mA);
        var portaoObj = { dados: pt, hp: pt.hp, maxHp: pt.maxHp, ativo: true, segs: [] };
        var paresP = [[pt1, pt2], [pt2, pt3], [pt3, pt4], [pt4, pt1]];
        for (j = 0; j < paresP.length; j++) {
          var sgP = { ax: paresP[j][0][0], ay: paresP[j][0][1], bx: paresP[j][1][0], by: paresP[j][1][1],
                      rest: 0.45, tipo: 'portao', dados: portaoObj };
          segs.push(sgP); portaoObj.segs.push(sgP);
        }
        portoes.push(portaoObj);
      }
    }

    function criarFlipper(dados, lado, tag) {
      return {
        x: dados.x, y: dados.y, comp: dados.comp, raio: 0.46,
        ang: lado < 0 ? -0.50 : Math.PI + 0.50,
        repouso: lado < 0 ? -0.50 : Math.PI + 0.50,
        ativo: lado < 0 ? 0.52 : Math.PI - 0.52,
        vel: 0, lado: lado, subindo: false, tag: tag || (lado < 0 ? 'esq' : 'dir')
      };
    }

    var listaFlippers = [
      criarFlipper(mesa.flippers.esq, -1, 'esq'),
      criarFlipper(mesa.flippers.dir, 1, 'dir')
    ];
    if (mesa.flippers.superiorEsq) {
      listaFlippers.push(criarFlipper(mesa.flippers.superiorEsq, -1, 'esq'));
    }
    if (mesa.flippers.superiorDir) {
      listaFlippers.push(criarFlipper(mesa.flippers.superiorDir, 1, 'dir'));
    }

    var listaSpinners = [];
    if (mesa.spinners) {
      for (var spI = 0; spI < mesa.spinners.length; spI++) {
        var spD = mesa.spinners[spI];
        listaSpinners.push({
          id: spD.id, x: spD.x, y: spD.y, larg: spD.larg || 1.6,
          rot: 0, velRot: 0, voltas: 0, pontos: spD.pontos || 100,
          cor: spD.cor || [0.95, 0.85, 0.30]
        });
      }
    }

    return {
      segs: segs, circs: circs, alvos: alvos, portoes: portoes,
      flippers: listaFlippers,
      spinners: listaSpinners,
      mesa: mesa
    };
  }

  /* ================================ JOGO ================================= */
  function criarPinball(canvas, opcoes) {
    opcoes = opcoes || {};
    var aviso = [];
    var gl = null;
    try {
      gl = canvas.getContext('webgl2', { antialias: true, alpha: false, depth: true, powerPreference: 'high-performance' });
    } catch (e) { gl = null; }
    if (!gl && opcoes.exigirVideo) aviso.push('este navegador nao suporta WebGL2');
    if (!gl) gl = contextoFalso();

    var aoAtualizar = opcoes.aoAtualizar || function () {};
    var aoDados = opcoes.aoDados || function () {};

    /* ------------------------------ estado -------------------------------- */
    var indiceMesa = opcoes.mesaInicial || 0;
    var mesa = null, fisica = null;
    var bola = null;
    var bolasAtivas = [];
    var bolasTravadas = 0;
    var estado = 'mesa';                     // mesa | lancando | jogando | fim
    var pontos = 0, bolas = 3, mult = 1, bonus = 0;
    var recordes = {};
    var fisicaAcum = 0;
    var lancando = false, forcaLancador = 0;
    var pausado = false, som = true;
    var mensagem = '', mensagemTempo = 0;
    var tempoSalva = 0;
    var kickbackAtivo = true;                // kickback ativo na outlane esquerda
    var strobeTempo = 0;                     // efeito estroboscopico em eventos especiais
    var luzTempo = 0;
    var tempoParado = 0;
    var camTremor = 0;
    var tilt = false, tiltTempo = 0, nudgeCooldown = 0, nudgeAvisos = 0;

    var proj = m4(), view = m4(), modelo = m4();
    var camAlvoY = COMPRIMENTO / 2, camDist = 52, camPitch = 1.02;
    var larguraTela = 1, alturaTela = 1;

    /* ------------------------------ audio --------------------------------- */
    var ac = null, destino = null;
    function garantirAudio() {
      if (ac) return ac;
      try {
        var AC = raiz.AudioContext || raiz.webkitAudioContext;
        if (!AC) return null;
        ac = new AC();
        destino = ac.createGain();
        destino.gain.value = 0.45;
        destino.connect(ac.destination);
      } catch (e) { ac = null; }
      return ac;
    }
    function som_(tipo) {
      if (!som) return;
      var a = garantirAudio();
      if (!a) return;
      var f = 400, dur = 0.06, forma = 'square', vol = 0.18;
      if (tipo === 'flipper') { f = 220; dur = 0.045; vol = 0.20; }
      else if (tipo === 'bumper') { f = 880; dur = 0.10; vol = 0.20; }
      else if (tipo === 'alvo') { f = 1180; dur = 0.09; vol = 0.20; }
      else if (tipo === 'spinner') { f = 1650; dur = 0.022; vol = 0.15; forma = 'triangle'; }
      else if (tipo === 'parede') { f = 150; dur = 0.03; vol = 0.10; }
      else if (tipo === 'lancar') { f = 520; dur = 0.16; vol = 0.20; forma = 'sawtooth'; }
      else if (tipo === 'perdeu') { f = 130; dur = 0.42; vol = 0.22; forma = 'sawtooth'; }
      else if (tipo === 'bonus') { f = 1320; dur = 0.28; vol = 0.20; }
      else if (tipo === 'nudge') { f = 95; dur = 0.09; vol = 0.28; forma = 'triangle'; }
      else if (tipo === 'tilt') { f = 85; dur = 0.55; vol = 0.35; forma = 'sawtooth'; }
      try {
        if (a.state === 'suspended') a.resume();
        var o = a.createOscillator(), g = a.createGain();
        o.type = forma;
        o.frequency.setValueAtTime(f, a.currentTime);
        if (tipo === 'bumper') o.frequency.exponentialRampToValueAtTime(f * 1.7, a.currentTime + dur);
        if (tipo === 'lancar') o.frequency.exponentialRampToValueAtTime(f * 3.2, a.currentTime + dur);
        if (tipo === 'tilt') o.frequency.exponentialRampToValueAtTime(40, a.currentTime + dur);
        g.gain.setValueAtTime(vol, a.currentTime);
        g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + dur);
        o.connect(g); g.connect(destino);
        o.start(); o.stop(a.currentTime + dur + 0.02);
      } catch (e) {}
    }

    /* -------------------------- recursos de video -------------------------- */
    var progPrincipal = null, progBrilho = null;
    var malhas = {};
    var uni = {}, uniB = {};
    var texMesa = null, texEmis = null, texBranco = null, texPreto = null;
    var vaoQuad = null;

    function iniciarVideo() {
      progPrincipal = programa(gl, VS_PRINCIPAL, FS_PRINCIPAL, aviso);
      progBrilho = programa(gl, VS_BRILHO, FS_BRILHO, aviso);
      if (!progPrincipal) return;
      ['uProj', 'uView', 'uModel', 'uNorm', 'uTex', 'uEmis', 'uEmissivo',
       'uCor', 'uLuzDir', 'uLuzCor', 'uCam', 'uAmbCeu', 'uAmbChao', 'uMetal', 'uDureza',
       'uBolaPos', 'uBolaR', 'uSombra', 'uNumLuzes'].forEach(function (n) {
        uni[n] = gl.getUniformLocation(progPrincipal, n);
      });
      uni.uPontosLuzPos = gl.getUniformLocation(progPrincipal, 'uPontosLuzPos[0]') || gl.getUniformLocation(progPrincipal, 'uPontosLuzPos');
      uni.uPontosLuzCor = gl.getUniformLocation(progPrincipal, 'uPontosLuzCor[0]') || gl.getUniformLocation(progPrincipal, 'uPontosLuzCor');
      uni.uPontosLuzIntens = gl.getUniformLocation(progPrincipal, 'uPontosLuzIntens[0]') || gl.getUniformLocation(progPrincipal, 'uPontosLuzIntens');
      texBranco = texturaCor(gl, 1, 1, 1);
      texPreto = texturaCor(gl, 0, 0, 0);
      if (progBrilho) {
        ['uProj', 'uView', 'uCentro', 'uTam', 'uDir', 'uDirC', 'uCor', 'uIntensidade'].forEach(function (n) {
          uniB[n] = gl.getUniformLocation(progBrilho, n);
        });
      }
      malhas.caixa = malha(gl, malhaCaixa());
      malhas.cilindro = malha(gl, malhaCilindro(24));
      malhas.esfera = malha(gl, malhaEsfera(28, 18));
      malhas.plano = malha(gl, malhaPlano());
      malhas.flipper = malha(gl, malhaFlipper(16));
      // quad para os brilhos aditivos
      var vb = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, vb);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
        -1, -1, 1, -1, 1, 1, -1, -1, 1, 1, -1, 1
      ]), gl.STATIC_DRAW);
      vaoQuad = gl.createVertexArray();
      gl.bindVertexArray(vaoQuad);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      gl.bindVertexArray(null);
      gl.enable(gl.DEPTH_TEST);
      gl.depthFunc(gl.LEQUAL);
      gl.disable(gl.CULL_FACE);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
    }

    function desenharMalha(nome, mat, cor, opc) {
      opc = opc || {};
      gl.uniformMatrix4fv(uni.uModel, false, mat);
      var n = new Float32Array([mat[0], mat[1], mat[2], mat[4], mat[5], mat[6], mat[8], mat[9], mat[10]]);
      gl.uniformMatrix3fv(uni.uNorm, false, n);
      gl.uniform3fv(uni.uCor, cor);
      gl.uniform1f(uni.uMetal, opc.metal === undefined ? 0.25 : opc.metal);
      gl.uniform1f(uni.uDureza, opc.dureza === undefined ? 42 : opc.dureza);
      gl.uniform1f(uni.uEmissivo, opc.emissivo === undefined ? 1 : opc.emissivo);
      gl.uniform1f(uni.uSombra, opc.sombra ? 1 : 0);
      // sem desvios no shader: objetos sem arte usam textura 1x1 branca/preta
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, opc.tex ? texMesa : texBranco);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, opc.emis ? texEmis : texPreto);
      var m = malhas[nome];
      gl.bindVertexArray(m.vao);
      gl.drawElements(gl.TRIANGLES, m.n, gl.UNSIGNED_SHORT, 0);
      gl.bindVertexArray(null);
    }

    /* ----------------------------- mesa atual ----------------------------- */
    function carregarMesa(i) {
      indiceMesa = ((i % MESAS.length) + MESAS.length) % MESAS.length;
      mesa = MESAS[indiceMesa]();
      fisica = montarFisica(mesa);
      // texturas da mesa: arte + brilho
      var alt = 2048, larg = Math.round(alt * LARGURA / COMPRIMENTO);
      var cvA = raiz.document ? raiz.document.createElement('canvas') : null;
      if (cvA) {
        cvA.width = larg; cvA.height = alt;
        var cvE = raiz.document.createElement('canvas');
        cvE.width = larg; cvE.height = alt;
        var a = cvA.getContext('2d'), e = cvE.getContext('2d');
        a.setTransform(larg / LARGURA, 0, 0, -alt / COMPRIMENTO, 0, alt);
        e.setTransform(larg / LARGURA, 0, 0, -alt / COMPRIMENTO, 0, alt);
        a.lineJoin = 'round'; a.lineCap = 'round';
        e.lineJoin = 'round'; e.lineCap = 'round';
        try { mesa.arte(a, e, mesa); } catch (err) { aviso.push('erro na arte da mesa: ' + err.message); }
        texMesa = texturaDeCanvas(gl, cvA);
        texEmis = texturaDeCanvas(gl, cvE);
      }
      pontos = 0; bolas = 3; mult = 1; bonus = 0; bolasTravadas = 0;
      bolasAtivas = [];
      bola = null;
      estado = 'mesa';
      luzTempo = 0;
      try {
        var t = raiz.localStorage && raiz.localStorage.getItem('pinball.top.' + mesa.id);
        recordes[mesa.id] = t ? parseInt(t, 10) || 0 : 0;
      } catch (e) { recordes[mesa.id] = 0; }
      publicar();
    }

    var ultimaAssinatura = '';
    function publicar() {
      var d = {
        mesa: mesa ? { id: mesa.id, nome: mesa.nome, subtitulo: mesa.subtitulo,
                       missao: mesa.missao, indice: indiceMesa, total: MESAS.length } : null,
        nome: mesa ? mesa.nome : '',
        id: mesa ? mesa.id : '',
        pontos: pontos, bolas: bolas, mult: mult, estado: estado,
        bolasAtivas: bolasAtivas.length,
        bolasTravadas: bolasTravadas,
        recorde: mesa ? (recordes[mesa.id] || 0) : 0,
        mensagem: mensagem, som: som, pausado: pausado,
        lancador: forcaLancador,
        kickback: kickbackAtivo,
        ballSave: tempoSalva > 0,
        tempoSalva: tempoSalva,
        tilt: tilt,
        tiltAvisos: nudgeAvisos,
        camTremor: camTremor
      };
      // so avisa a tela quando algo muda de verdade (evita mexer no DOM a toa)
      var assinatura = (d.mesa ? d.mesa.id : '') + '|' + d.pontos + '|' + d.bolas + '|' + d.mult + '|' +
        d.estado + '|' + d.mensagem + '|' + Math.round(d.lancador * 24) + '|' + d.pausado + '|' + d.som + '|' +
        d.bolasAtivas + '|' + d.tilt + '|' + d.tiltAvisos + '|' + d.kickback + '|' + Math.ceil(d.tempoSalva);
      if (assinatura === ultimaAssinatura) return;
      ultimaAssinatura = assinatura;
      aoAtualizar(d);
    }

    /* ------------------------------ partida ------------------------------- */
    function sincronizarBolas() {
      bola = bolasAtivas.length > 0 ? bolasAtivas[0] : null;
    }

    function adicionarBola(x, y, vx, vy) {
      var b = { x: x, y: y, vx: vx || 0, vy: vy || 0, r: BOLA_RAIO, dentro: true, parada: false, presaTempo: 0 };
      bolasAtivas.push(b);
      sincronizarBolas();
      return b;
    }

    function dispararMultiball(qtd) {
      qtd = qtd || 2;
      for (var i = 0; i < qtd; i++) {
        adicionarBola(8 + i * 4, 26, (Math.random() - 0.5) * 120, 90 + Math.random() * 80);
      }
      mensagem = 'MULTIBALL!';
      mensagemTempo = 2.5;
      som_('bonus');
      strobeTempo = 0.8;
      luzTempo = 1.5;
      publicar();
    }

    function travarBola() {
      bolasTravadas++;
      if (bolasTravadas >= 3) {
        mensagem = 'MULTIBALL 3 BOLAS!';
        mensagemTempo = 2.5;
        som_('bonus');
        strobeTempo = 1.0;
        luzTempo = 1.5;
        bolasTravadas = 0;
        dispararMultiball(2);
      } else {
        mensagem = 'BOLA TRAVADA (' + bolasTravadas + '/3)!';
        mensagemTempo = 1.8;
        som_('bonus');
        luzTempo = 1.0;
        publicar();
      }
    }

    function novaBola(concederSalva) {
      var l = mesa.lancador;
      var b = { x: l.x, y: l.y, vx: 0, vy: 0, r: BOLA_RAIO, dentro: false, parada: true, presaTempo: 0 };
      bolasAtivas = [b];
      sincronizarBolas();
      forcaLancador = 0;
      lancando = false;
      estado = 'lancando';
      tempoSalva = concederSalva !== false ? 12.0 : 0; // "ball save" estendido para 12s
      kickbackAtivo = true;                            // kickback rearmado em cada bola nova
      publicar();
    }

    function comecar() {
      pontos = 0; bolas = 3; mult = 1; bonus = 0; bolasTravadas = 0;
      kickbackAtivo = true;
      strobeTempo = 0;
      for (var i = 0; i < fisica.alvos.length; i++) {
        fisica.alvos[i].ativo = true;
        for (var j = 0; j < fisica.alvos[i].segs.length; j++) fisica.alvos[i].segs[j].ativo = true;
      }
      if (fisica.portoes) {
        for (var p = 0; p < fisica.portoes.length; p++) {
          fisica.portoes[p].hp = fisica.portoes[p].maxHp;
          fisica.portoes[p].ativo = true;
          for (var sp = 0; sp < fisica.portoes[p].segs.length; sp++) fisica.portoes[p].segs[sp].ativo = true;
        }
      }
      novaBola();
      som_('lancar');
    }

    function lancar() {
      if (estado !== 'lancando' || !bola) return;
      var f = limitar(forcaLancador, 0.04, 1);
      // Toque rapido (f ~ 0.04): velocidade inicial suave (~24 pol/s).
      // Sobe apenas um pouco no canal (cerca de 4 polegadas) e a gravidade traz de volta para o lancador!
      // Carga completa (f = 1.0): lanca com energia (~165 pol/s), subindo o canal inteiro e entrando na mesa!
      var velLancamento = 22 + 143 * Math.pow(f, 1.3);
      bola.vy = velLancamento;
      bola.vx = (Math.random() - 0.5) * 1.5;
      bola.parada = false;
      bola.dentro = true;
      bola.saiuCanal = false;
      estado = 'jogando';
      som_('lancar');
      forcaLancador = 0;
      mensagem = '';
      publicar();
    }

    function perderBola() {
      if (tempoSalva > 0) {                   // bola salva: volta ao lancador, mas so uma vez
        tempoSalva = 0;                       // consome a protecao (senao salvaria para sempre)
        mensagem = 'BOLA SALVA!';
        mensagemTempo = 1.6;
        som_('bonus');
        novaBola();
        return;
      }
      bolas--;
      som_('perdeu');
      if (bolas <= 0) {
        estado = 'fim';
        if (pontos > (recordes[mesa.id] || 0)) {
          recordes[mesa.id] = pontos;
          try { raiz.localStorage && raiz.localStorage.setItem('pinball.top.' + mesa.id, String(pontos)); } catch (e) {}
        }
        mensagem = 'FIM DE JOGO';
        mensagemTempo = 3;
        bolasAtivas = [];
        sincronizarBolas();
      } else {
        mensagem = 'BOLA PERDIDA';
        mensagemTempo = 1.6;
        novaBola();
      }
      publicar();
    }

    function marcar(valor, motivo) {
      pontos += Math.round(valor * mult);
      if (motivo) { mensagem = motivo; mensagemTempo = 0.8; }
    }

    var alvoCooldown = 0;
    function conferirAlvos() {
      var todos = true;
      for (var i = 0; i < fisica.alvos.length; i++) if (fisica.alvos[i].ativo) { todos = false; break; }
      if (todos && fisica.alvos.length) {
        mult = Math.min(9, mult + 1);
        bonus += 5000;
        pontos += 5000 * mult;
        kickbackAtivo = true;
        strobeTempo = 0.5;
        mensagem = 'ALVOS COMPLETOS! x' + mult;
        mensagemTempo = 2.2;
        som_('bonus');
        alvoCooldown = 0.3; // tempo para solenoide travar sem que a mesma bola derrube imediatamente
        for (var k = 0; k < fisica.alvos.length; k++) {
          fisica.alvos[k].ativo = true;
          for (var j = 0; j < fisica.alvos[k].segs.length; j++) fisica.alvos[k].segs[j].ativo = true;
        }
        publicar();
      }
    }

    /* ------------------------------ fisica -------------------------------- */
    function colideSegmentoBola(sg, b) {
      // Se o portao for atingido descendo por tras (b.vy < 0), ele age como portao de sentido unico (one-way)
      // e permite que a bola caia livremente para a mesa em vez de prender atras do portao
      if (sg.tipo === 'portao') {
        var ptObjPre = sg.dados;
        if (ptObjPre && b.vy < 0 && b.y > ptObjPre.dados.y - 0.2) return false;
      }

      var ex = sg.bx - sg.ax, ey = sg.by - sg.ay;
      var l2 = ex * ex + ey * ey;
      var t = l2 > 0 ? ((b.x - sg.ax) * ex + (b.y - sg.ay) * ey) / l2 : 0;
      t = limitar(t, 0, 1);
      var cx = sg.ax + ex * t, cy = sg.ay + ey * t;
      var dx = b.x - cx, dy = b.y - cy;
      var d2 = dx * dx + dy * dy;
      var soma = b.r + 0.14;                     // paredes tem espessura
      if (d2 >= soma * soma) return false;
      var d = Math.sqrt(d2);
      var nx, ny;
      if (d < 1e-6) {                               // centro exatamente sobre o segmento
        var ll = Math.sqrt(l2) || 1;
        nx = -ey / ll; ny = ex / ll;
        d = 0;
      } else {
        nx = dx / d; ny = dy / d;
      }
      b.x = cx + nx * soma;
      b.y = cy + ny * soma;
      var vn = b.vx * nx + b.vy * ny;
      if (vn < 0) {
        // reflexao sem micro-quiques em baixas velocidades
        var restSg = Math.abs(vn) > 10 ? sg.rest : 0.0;
        var vt = b.vx - vn * nx, wt = b.vy - vn * ny;
        var vr = -vn * restSg;
        b.vx = nx * vr + vt * ATRITO_PAREDE;
        b.vy = ny * vr + wt * ATRITO_PAREDE;
        if (sg.tipo === 'sling') {
          var s = sg.dados;
          b.vx += nx * 95 + (b.x < 10 ? 25 : -25);
          b.vy += ny * 95 + 30;
          marcar(s.pontos, null);
          som_('bumper');
          luzTempo = 1;
        } else if (sg.tipo === 'portao') {
          var ptObj = sg.dados;
          if (ptObj && ptObj.ativo) {
            ptObj.hp--;
            marcar(ptObj.dados.pontos, 'PORTÃO: ' + ptObj.hp + ' HP');
            som_('bumper');
            luzTempo = 1;
            if (ptObj.hp <= 0) {
              ptObj.ativo = false;
              for (var sp = 0; sp < ptObj.segs.length; sp++) ptObj.segs[sp].ativo = false;
              marcar(ptObj.dados.pontos * 2, 'PORTÃO DESTRUÍDO!');
              mensagemTempo = 2.0;
              som_('bonus');
            }
          }
        } else if (Math.abs(vn) > 40) {
          som_('parede');
        }
      }
      return true;
    }

    function colideCirculoBola(c, b) {
      var dx = b.x - c.x, dy = b.y - c.y;
      var d2 = dx * dx + dy * dy;
      var soma = b.r + c.r;
      if (d2 >= soma * soma || d2 <= 1e-9) return false;
      var d = Math.sqrt(d2);
      // Se a bola estiver caindo exatamente no topo de um poste circular (ponto de equilíbrio instável),
      // introduz uma micro-deflexão para os lados para a gravidade conduzir a bola sem estagnação
      if (dy > 0 && Math.abs(dx) < 0.10) {
        dx = dx >= 0 ? 0.12 : -0.12;
        d = Math.sqrt(dx * dx + dy * dy);
      }
      var nx = dx / d, ny = dy / d;
      b.x = c.x + nx * soma;
      b.y = c.y + ny * soma;
      var vn = b.vx * nx + b.vy * ny;
      if (vn < 0) {
        var restC = c.rest !== undefined ? c.rest : (c.tipo === 'post' ? 0.70 : (Math.abs(vn) > 10 ? 0.30 : 0.0));
        b.vx -= (1 + restC) * vn * nx;
        b.vy -= (1 + restC) * vn * ny;
      }
      if (c.forca > 0) {                            // bumper empurra
        b.vx += nx * c.forca;
        b.vy += ny * c.forca;
        marcar(c.pontos, null);
        som_('bumper');
        c.brilho = 1;
        luzTempo = 1;
      }
      return true;
    }

    function colideFlipperBola(f, b) {
      var ex = Math.cos(f.ang) * f.comp, ey = Math.sin(f.ang) * f.comp;
      var px = f.x, py = f.y;
      var l2 = ex * ex + ey * ey;
      var t = limitar(((b.x - px) * ex + (b.y - py) * ey) / l2, 0, 1);
      var cx = px + ex * t, cy = py + ey * t;
      var dx = b.x - cx, dy = b.y - cy;
      var d2 = dx * dx + dy * dy;
      var soma = b.r + f.raio;
      if (d2 >= soma * soma) return false;
      var d = Math.sqrt(d2) || 1e-6;
      var nx = dx / d, ny = dy / d;
      b.x = cx + nx * soma;
      b.y = cy + ny * soma;
      // velocidade do ponto do flipper (rotacao em torno do pivo)
      var rx = cx - px, ry = cy - py;
      var vpx = -f.vel * ry, vpy = f.vel * rx;
      var rvx = b.vx - vpx, rvy = b.vy - vpy;
      var vn = rvx * nx + rvy * ny;
      if (vn < 0) {
        var velF = Math.abs(f.vel);
        var rest = velF > 1.5 ? 0.38 : (Math.abs(vn) > 10 ? 0.20 : 0.0);
        var rtx = rvx - vn * nx, rty = rvy - vn * ny;
        var atritoF = velF > 1.5 ? 0.95 : 0.9995;
        rvx = -rest * vn * nx + rtx * atritoF;
        rvy = -rest * vn * ny + rty * atritoF;
        b.vx = rvx + vpx;
        b.vy = rvy + vpy;
        if (velF > 1.5) som_('flipper');
      }
      // Se o flipper estiver em repouso e a bola na face superior (ny > 0),
      // a gravidade natural deve fazê-la escorregar livremente rumo à ponta do flipper
      if (!f.subindo && ny > 0) {
        var tx = ex / f.comp, ty = ey / f.comp;
        var vt = b.vx * tx + b.vy * ty;
        if (vt < 1.0) {
          b.vx += tx * 1.5;
          b.vy += ty * 1.5;
        }
      }
      return true;
    }

    function passoFisica(dt) {
      if (!bolasAtivas.length || estado === 'mesa' || estado === 'fim') return;

      // flippers (movimento a cada sub-passo da fisica)
      for (var f = 0; f < fisica.flippers.length; f++) {
        var fl = fisica.flippers[f];
        var alvo = (fl.subindo && !tilt) ? fl.ativo : fl.repouso;
        var dif = alvo - fl.ang;
        var maxPasso = 34 * dt;
        if (Math.abs(dif) <= maxPasso) { fl.vel = dif / dt; fl.ang = alvo; }
        else { fl.vel = (dif > 0 ? 1 : -1) * 34; fl.ang += fl.vel * dt; }
      }

      var bolasRestantes = [];

      for (var bi = 0; bi < bolasAtivas.length; bi++) {
        var b = bolasAtivas[bi];
        if (b.parada) {
          bolasRestantes.push(b);
          continue;
        }

        // poço / scoop: retencao e ejecao
        if (b.presaTempo > 0) {
          b.presaTempo -= dt;
          if (b.presaTempo <= 0 && b.poço) {
            b.presaTempo = 0;
            b.x = b.poço.ejectX;
            b.y = b.poço.ejectY;
            b.vx = b.poço.ejectVx;
            b.vy = b.poço.ejectVy;
            b.poço = null;
            som_('lancar');
          }
          bolasRestantes.push(b);
          continue;
        }

        // Se a bola estiver em repouso estatico no berco do flipper (trava intencional do jogador)
        if (b._repouso) {
          var acordar = false;
          if (fisica.flippers) {
            for (var k = 0; k < fisica.flippers.length; k++) {
              var fl = fisica.flippers[k];
              var fdx = b.x - fl.x, fdy = b.y - fl.y;
              if (fdx * fdx + fdy * fdy < 24.0) {
                if (Math.abs(fl.vel) > 0.5 || !fl.subindo) acordar = true;
              }
            }
          }
          if (camTremor > 0 || tilt) acordar = true;
          if (acordar) {
            b._repouso = false;
          } else {
            b.vx = 0;
            b.vy = 0;
            bolasRestantes.push(b);
            continue;
          }
        }

        // atrito de rolamento suave e natural do fliperama
        b.vx *= (1 - 0.14 * dt);
        b.vy *= (1 - 0.14 * dt);

        b.vy -= GRAVIDADE * dt;

        // saida do canal do lancador para o campo (apenas ao alcancar o topo da mesa)
        if (b.y > 33.5 && b.x < 17.0) b.saiuCanal = true;

        // portao de sentido unico no topo do canal do lancador: depois de entrar no jogo, nao volta
        if (b.saiuCanal && b.x > 17.1 && b.y > 33.0 && b.vy < 0) {
          b.x = 16.9;
          b.vx = -Math.abs(b.vx || 30) - 25;
        }

        // retorno natural ao lancador se o disparo foi fraco e nao alcancou o topo do canal:
        if (!b.saiuCanal && b.x > 17.2 && b.y <= 2.4 && b.vy <= 0) {
          b.y = 2.4;
          b.x = mesa.lancador.x;
          b.vx = 0;
          b.vy = 0;
          b.parada = true;
          b._tempoCanal = 0;
          estado = 'lancando';
          forcaLancador = 0;
          publicar();
        }

        // Se a bola estiver no canal sem sair ha mais de 2.5s durante jogo, reconduz suavemente ao lancador
        if (estado === 'jogando' && !b.saiuCanal && b.x > 17.1 && !b.parada) {
          b._tempoCanal = (b._tempoCanal || 0) + dt;
          if (b._tempoCanal > 2.5) {
            b.y = 2.4;
            b.x = mesa.lancador.x;
            b.vx = 0;
            b.vy = 0;
            b.parada = true;
            b._tempoCanal = 0;
            estado = 'lancando';
            forcaLancador = 0;
            publicar();
          }
        } else {
          b._tempoCanal = 0;
        }

        // limite de velocidade realista para estabilidade
        var v = Math.sqrt(b.vx * b.vx + b.vy * b.vy);
        if (v > 450) { b.vx *= 450 / v; b.vy *= 450 / v; }
        b.x += b.vx * dt;
        b.y += b.vy * dt;

        // colisoes (duas passadas ajudam nos cantos)
        for (var passoC = 0; passoC < 2; passoC++) {
          for (var i = 0; i < fisica.segs.length; i++) {
            var sg = fisica.segs[i];
            if (sg.ativo === false) continue;
            colideSegmentoBola(sg, b);
          }
          for (var c = 0; c < fisica.circs.length; c++) colideCirculoBola(fisica.circs[c], b);
          for (var k = 0; k < fisica.flippers.length; k++) colideFlipperBola(fisica.flippers[k], b);
        }

        // pocos / scoops
        if (mesa.pocos && b.presaTempo <= 0) {
          for (var pi = 0; pi < mesa.pocos.length; pi++) {
            var pc = mesa.pocos[pi];
            var dxP = b.x - pc.x, dyP = b.y - pc.y;
            if (dxP * dxP + dyP * dyP < (pc.r + b.r) * (pc.r + b.r)) {
              b.presaTempo = pc.holdTime || 0.6;
              b.poço = pc;
              b.x = pc.x; b.y = pc.y;
              b.vx = 0; b.vy = 0;
              marcar(pc.pontos, pc.nome + '!');
              som_('bonus');
              luzTempo = 1;
              kickbackAtivo = true;
              if (pc.lock) travarBola();
              break;
            }
          }
          if (b.presaTempo > 0) {
            bolasRestantes.push(b);
            continue;
          }
        }

        // alvos derrubados
        if (alvoCooldown <= 0) {
          for (var a = 0; a < fisica.alvos.length; a++) {
            var al = fisica.alvos[a];
            if (!al.ativo) continue;
            var perto = false;
            for (var s2 = 0; s2 < al.segs.length && !perto; s2++) {
              var q = al.segs[s2];
              var ex2 = q.bx - q.ax, ey2 = q.by - q.ay;
              var l22 = ex2 * ex2 + ey2 * ey2;
              var tt2 = l22 > 0 ? ((b.x - q.ax) * ex2 + (b.y - q.ay) * ey2) / l22 : 0;
              tt2 = limitar(tt2, 0, 1);
              var ddx = b.x - (q.ax + ex2 * tt2), ddy = b.y - (q.ay + ey2 * tt2);
              if (ddx * ddx + ddy * ddy < (b.r + 0.2) * (b.r + 0.2)) perto = true;
            }
            if (perto) {
              al.ativo = false;
              for (var s3 = 0; s3 < al.segs.length; s3++) al.segs[s3].ativo = false;
              marcar(al.dados.pontos, 'ALVO!');
              som_('alvo');
              luzTempo = 1;
              conferirAlvos();
              publicar();
              break;
            }
          }
        }

        // Kickback na outlane esquerda (recurso classico de mesas Williams/Bally)
        if (kickbackAtivo && b.x >= 0.7 && b.x <= 2.8 && b.y <= 4.5 && b.y >= 1.8 && b.vy < 0) {
          kickbackAtivo = false;
          b.vx = 18;
          b.vy = 155;
          som_('lancar');
          mensagem = 'KICKBACK SALVOU!';
          mensagemTempo = 2.2;
          strobeTempo = 0.8;
          luzTempo = 1.6;
          publicar();
        }

        // dreno
        if (b.y < 0.7 && b.x < 17.0) {
          continue; // descartada
        }

        // Sistema de busca de bola (Ball Search do fliperama):
        // Se a bola permanecer em uma vizinhanca fechada (<= 1.2 pol) por mais de 0.50s,
        // mesmo oscilando ou vibrando em quinas, aciona solenoide inteligente de desentalar
        // Area de controle dos flippers do jogador (cradling/trava intencional com as setas)
        var emControleFlipper = false;
        var flipperSegurado = false;
        if (fisica.flippers) {
          for (var kf = 0; kf < fisica.flippers.length; kf++) {
            var flp = fisica.flippers[kf];
            var fdx = b.x - flp.x, fdy = b.y - flp.y;
            if (fdx * fdx + fdy * fdy < 24.0 && flp.subindo && Math.abs(flp.ang - flp.ativo) < 0.08) {
              flipperSegurado = true;
              break;
            }
          }
        }
        if (flipperSegurado && b.y <= 6.5 && (b.vx * b.vx + b.vy * b.vy) < 0.04) {
          b.vx = 0;
          b.vy = 0;
          b._repouso = true;
          emControleFlipper = true;
        } else {
          b._repouso = false;
          emControleFlipper = false;
        }

        if (estado === 'jogando' && !b.parada && b.presaTempo <= 0 && !emControleFlipper) {
          if (b._ancoraX === undefined) {
            b._ancoraX = b.x;
            b._ancoraY = b.y;
            b._tempoPresa = 0;
          }
          var dAncoraX = b.x - b._ancoraX;
          var dAncoraY = b.y - b._ancoraY;
          if (dAncoraX * dAncoraX + dAncoraY * dAncoraY < 1.44) {
            b._tempoPresa = (b._tempoPresa || 0) + dt;
            if (b._tempoPresa > 0.50) {
              b.vx = (b.x < 10 ? 42 : -42) + (Math.random() - 0.5) * 16;
              b.vy = -58; // pulso firme para baixo rumo aos flippers
              b._tempoPresa = 0;
              b._ancoraX = b.x;
              b._ancoraY = b.y;
              som_('flipper');
            }
          } else {
            b._ancoraX = b.x;
            b._ancoraY = b.y;
            b._tempoPresa = 0;
          }
        } else if (emControleFlipper) {
          b._tempoPresa = 0;
          b._ancoraX = b.x;
          b._ancoraY = b.y;
        }

        // seguranca: se escapar por algum canto, reposiciona
        if (b.x < -2 || b.x > 22 || b.y > 46) {
          b.x = 10; b.y = 20; b.vx = 0; b.vy = 0;
        }

        bolasRestantes.push(b);
      }

      bolasAtivas = bolasRestantes;
      sincronizarBolas();

      // Atualizacao e colisao dos spinners mecânicos (catracas 3D)
      if (fisica.spinners) {
        for (var sIdx = 0; sIdx < fisica.spinners.length; sIdx++) {
          var spn = fisica.spinners[sIdx];
          spn.rot += spn.velRot * dt;
          spn.velRot *= Math.max(0, 1 - 2.4 * dt);
          if (Math.abs(spn.velRot) < 0.1) spn.velRot = 0;

          var nVoltas = Math.floor(Math.abs(spn.rot) / Math.PI);
          if (nVoltas > (spn.voltas || 0) && Math.abs(spn.velRot) > 4) {
            spn.voltas = nVoltas;
            marcar(spn.pontos, 'SPINNER!');
            som_('spinner');
            luzTempo = 0.5;
          }

          for (var bSp = 0; bSp < bolasAtivas.length; bSp++) {
            var bObj = bolasAtivas[bSp];
            if (bObj.parada || bObj.presaTempo > 0) continue;
            var dxS = Math.abs(bObj.x - spn.x);
            var dyS = bObj.y - spn.y;
            if (dxS <= spn.larg / 2 + bObj.r && Math.abs(dyS) <= bObj.r + 0.35) {
              if (Math.abs(bObj.vy) > 3.0 && Math.abs(spn.velRot) < 45) {
                spn.velRot = bObj.vy * 2.2 + (Math.random() - 0.5) * 8;
                som_('spinner');
                marcar(spn.pontos * 2, 'SPINNER!');
                luzTempo = 0.8;
                bObj.vy *= 0.94; // leve amortecimento ao acionar a catraca
              }
            }
          }
        }
      }

      if (!bolasAtivas.length) {
        perderBola();
      }
    }

    /* -------------------------------- passo ------------------------------- */
    function passo(dt) {
      if (pausado) return;
      if (mensagemTempo > 0) mensagemTempo -= dt;
      if (luzTempo > 0) luzTempo = Math.max(0, luzTempo - dt * 1.6);
      if (strobeTempo > 0) strobeTempo = Math.max(0, strobeTempo - dt * 2.5);
      if (tempoSalva > 0) tempoSalva -= dt;
      if (alvoCooldown > 0) alvoCooldown -= dt;
      if (camTremor > 0) camTremor = Math.max(0, camTremor - dt * 2.5);
      if (nudgeCooldown > 0) nudgeCooldown = Math.max(0, nudgeCooldown - dt);
      else if (nudgeAvisos > 0 && !tilt) {
        nudgeAvisos--;
        nudgeCooldown = 3.5;
        publicar();
      }
      if (tiltTempo > 0) {
        tiltTempo -= dt;
        if (tiltTempo <= 0) { tilt = false; nudgeAvisos = 0; publicar(); }
      }

      // se nao estiver jogando fisicamente (ex: tela de mesa ou lancamento), os flippers ainda respondem
      if (estado !== 'jogando' || !bolasAtivas.length) {
        if (fisica && fisica.flippers) {
          for (var f = 0; f < fisica.flippers.length; f++) {
            var fl = fisica.flippers[f];
            var alvo = (fl.subindo && !tilt) ? fl.ativo : fl.repouso;
            var dif = alvo - fl.ang;
            var maxPasso = 34 * dt;
            if (Math.abs(dif) <= maxPasso) { fl.vel = dif / dt; fl.ang = alvo; }
            else { fl.vel = (dif > 0 ? 1 : -1) * 34; fl.ang += fl.vel * dt; }
          }
        }
      }

      for (var i = 0; i < fisica.circs.length; i++) {
        if (fisica.circs[i].brilho > 0) fisica.circs[i].brilho = Math.max(0, fisica.circs[i].brilho - dt * 2.2);
      }

      if (estado === 'lancando') {
        if (lancando) {
          forcaLancador = Math.min(1, forcaLancador + dt * 0.95);
          publicar();
        }
        return;
      }
      if (estado !== 'jogando') return;

      fisicaAcum += dt;
      var passos = 0;
      while (fisicaAcum >= PASSO_FISICA && passos < 60) {
        passoFisica(PASSO_FISICA);
        fisicaAcum -= PASSO_FISICA;
        passos++;
        if (!bolasAtivas.length) break;
      }
      if (fisicaAcum > PASSO_FISICA * 60) fisicaAcum = 0;
    }

    // mecanica real de tremer a mesa (nudge / tilt)
    function tremer(dir) {
      if (tilt || estado !== 'jogando' || !bolasAtivas.length) return;
      var impX = 0;
      if (dir === 'esq') impX = -65;
      else if (dir === 'dir') impX = 65;
      else impX = (Math.random() - 0.5) * 60;
      var impY = 32 + Math.random() * 25;

      for (var bi = 0; bi < bolasAtivas.length; bi++) {
        var bb = bolasAtivas[bi];
        if (bb && !bb.parada && bb.presaTempo <= 0) {
          bb.vx += impX;
          bb.vy += impY;
        }
      }
      camTremor = Math.min(1.2, camTremor + 0.55);
      som_('nudge');

      nudgeAvisos++;
      nudgeCooldown = 3.5;
      if (nudgeAvisos >= 3) {
        tilt = true;
        tiltTempo = 4.0;
        mensagem = 'TILT! FLIPPERS DESLIGADOS';
        mensagemTempo = 3.5;
        som_('tilt');
      } else {
        mensagem = 'AVISO DE TILT (' + nudgeAvisos + '/3)';
        mensagemTempo = 1.0;
      }
      publicar();
    }

    /* ------------------------------ desenho ------------------------------- */
    function ajustarCamera(aspecto) {
      var fovy = 0.72;
      var pitch = 0.98; // ~56 graus (perspectiva autentica de pinball 3D com profundidade)
      var s = Math.sin(pitch), c = Math.cos(pitch);
      var t = Math.tan(fovy / 2);

      // Encaixe vertical exato: o fundo da mesa (y=0.2) fica na borda inferior (-0.96)
      // e o topo da mesa (y=42.4) fica na borda superior (+0.92)
      var yBot = 0.2, yTop = 42.4;
      var ndcBot = -0.96, ndcTop = 0.92;
      var kBot = ndcBot * t / s;
      var kTop = ndcTop * t / s;
      var mBot = (1 - kBot * c) / kBot;
      var mTop = (1 - kTop * c) / kTop;
      var yt = (mTop * yTop - mBot * yBot) / (mTop - mBot);
      var dVert = mBot * (yBot - yt);

      // Largura da mesa: em telas estreitas (celulares retrato), garante que as laterais caibam
      var xHalf = (LARGURA / 2) + 1.6;
      var dHoriz = (xHalf / (t * aspecto)) - (yBot - yt) * c;

      camDist = Math.max(dVert, dHoriz);
      camAlvoY = yt;
      camPitch = pitch;

      var tremorX = camTremor > 0 ? (Math.sin(Date.now() * 0.08) * camTremor * 0.8) : 0;
      var tremorY = camTremor > 0 ? (Math.cos(Date.now() * 0.09) * camTremor * 0.6) : 0;
      var alvo = [tremorX, camAlvoY + tremorY, 0.4];
      var olho = [tremorX, camAlvoY - c * camDist + tremorY, s * camDist];
      m4Perspectiva(proj, fovy, aspecto, 1, 600);
      m4Olhar(view, olho, alvo, [0, 0, 1]);
    }

    function desenhar() {
      if (!progPrincipal) return;
      var ceu = mesa.cores.ceu, chao = mesa.cores.chao, fundo = mesa.cores.fundo;
      gl.viewport(0, 0, larguraTela, alturaTela);
      gl.clearColor(fundo[0], fundo[1], fundo[2], 1);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.useProgram(progPrincipal);
      gl.uniformMatrix4fv(uni.uProj, false, proj);
      gl.uniformMatrix4fv(uni.uView, false, view);
      gl.uniform3fv(uni.uLuzDir, new Float32Array(mesa.cores.luzDir));
      gl.uniform3fv(uni.uLuzCor, new Float32Array(mesa.cores.luz));
      gl.uniform3fv(uni.uAmbCeu, new Float32Array(ceu));
      gl.uniform3fv(uni.uAmbChao, new Float32Array(chao));
      gl.uniform1i(uni.uTex, 0);
      gl.uniform1i(uni.uEmis, 1);
      gl.uniform3f(uni.uCam, 0, camAlvoY - Math.cos(camPitch) * camDist, Math.sin(camPitch) * camDist);
      var bp = bola ? [bola.x - 10, bola.y, bola.r] : [0, -50, 0.5];
      gl.uniform3fv(uni.uBolaPos, new Float32Array(bp));
      gl.uniform1f(uni.uBolaR, BOLA_RAIO);

      // Coleta de luzes pontuais dinamicas (bumpers e insercoes de mesa)
      var posLuzes = new Float32Array(36);
      var corLuzes = new Float32Array(36);
      var intensLuzes = new Float32Array(12);
      var numLuzes = 0;

      for (var bL = 0; bL < fisica.circs.length && numLuzes < 4; bL++) {
        var bcL = fisica.circs[bL];
        if (bcL.tipo !== 'bumper') continue;
        posLuzes[numLuzes * 3 + 0] = bcL.x - 10;
        posLuzes[numLuzes * 3 + 1] = bcL.y;
        posLuzes[numLuzes * 3 + 2] = 1.35;
        corLuzes[numLuzes * 3 + 0] = bcL.base.cor[0];
        corLuzes[numLuzes * 3 + 1] = bcL.base.cor[1];
        corLuzes[numLuzes * 3 + 2] = bcL.base.cor[2];
        intensLuzes[numLuzes] = 1.4 + (bcL.brilho || 0) * 4.2;
        numLuzes++;
      }

      var tempoAnim = Date.now() * 0.001;
      if (mesa.luzes) {
        for (var lzL = 0; lzL < mesa.luzes.length && numLuzes < 12; lzL++) {
          var mLz = mesa.luzes[lzL];
          var intensBase = mLz.intens || 0.5;
          var intensFinal = intensBase;
          if (mLz.tipo === 'salva') {
            intensFinal = tempoSalva > 0 ? (0.85 + 0.5 * Math.sin(tempoAnim * 12)) : 0.05;
          } else if (mLz.tipo === 'kickback') {
            intensFinal = kickbackAtivo ? (0.8 + 0.45 * Math.sin(tempoAnim * 8)) : 0.05;
          } else if (mLz.tipo === 'seta') {
            intensFinal = 0.25 + 0.75 * Math.max(0, Math.sin(tempoAnim * 6 - (mLz.fase || 0)));
          } else if (mLz.tipo === 'pisca') {
            intensFinal = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(tempoAnim * 5 + (mLz.fase || 0)));
          } else {
            intensFinal = intensBase + (luzTempo > 0 ? luzTempo * 0.45 : 0);
          }
          if (strobeTempo > 0) {
            intensFinal = Math.max(intensFinal, (Math.sin(tempoAnim * 40) > 0 ? 1.8 : 0.2));
          }
          mLz._intensCalc = intensFinal;

          posLuzes[numLuzes * 3 + 0] = mLz.x - 10;
          posLuzes[numLuzes * 3 + 1] = mLz.y;
          posLuzes[numLuzes * 3 + 2] = 1.15;
          corLuzes[numLuzes * 3 + 0] = mLz.cor[0];
          corLuzes[numLuzes * 3 + 1] = mLz.cor[1];
          corLuzes[numLuzes * 3 + 2] = mLz.cor[2];
          intensLuzes[numLuzes] = intensFinal;
          numLuzes++;
        }
      }

      if (uni.uNumLuzes) gl.uniform1i(uni.uNumLuzes, numLuzes);
      if (uni.uPontosLuzPos) gl.uniform3fv(uni.uPontosLuzPos, posLuzes);
      if (uni.uPontosLuzCor) gl.uniform3fv(uni.uPontosLuzCor, corLuzes);
      if (uni.uPontosLuzIntens) gl.uniform1fv(uni.uPontosLuzIntens, intensLuzes);

      // 1. Chao da mesa (tabuleiro de madeira lacrada com arte e oclusao)
      m4TRS(modelo, 0, COMPRIMENTO / 2, 0, 0, LARGURA, COMPRIMENTO, 1);
      desenharMalha('plano', modelo, [1.0, 1.0, 1.04],
        { tex: true, emis: true, metal: 0.05, dureza: 20, emissivo: 1.1, sombra: true });

      // 2. Fundo estrutural do gabinete
      m4TRS(modelo, 0, COMPRIMENTO / 2, -0.65, 0, LARGURA + 1.2, COMPRIMENTO + 1.2, 0.60);
      desenharMalha('caixa', modelo, [0.08, 0.07, 0.09], { metal: 0.20, dureza: 25, sombra: true });

      // 3. Gabinete 3D: laterais em madeira nobre, trilhos superiores em metal escovado e espelhos internos
      var corGabinete = [0.06, 0.06, 0.08];
      var corMetalTrilho = [0.86, 0.88, 0.94];
      var corMirror = [0.45, 0.50, 0.60];
      
      // Trilho lateral esquerdo (madeira + aco escovado)
      m4TRS(modelo, -10.5, COMPRIMENTO / 2, 0.8, 0, 1.2, COMPRIMENTO + 2.2, 2.2);
      desenharMalha('caixa', modelo, corGabinete, { metal: 0.2, dureza: 30, sombra: true });
      m4TRS(modelo, -10.5, COMPRIMENTO / 2, 1.95, 0, 0.7, COMPRIMENTO + 2.2, 0.18);
      desenharMalha('caixa', modelo, corMetalTrilho, { metal: 0.95, dureza: 160, sombra: true });
      // Espelho interno esquerdo
      m4TRS(modelo, -9.85, COMPRIMENTO / 2, 0.8, 0, 0.08, COMPRIMENTO, 1.8);
      desenharMalha('caixa', modelo, corMirror, { metal: 0.92, dureza: 140 });

      // Trilho lateral direito (madeira + aco escovado)
      m4TRS(modelo, 10.5, COMPRIMENTO / 2, 0.8, 0, 1.2, COMPRIMENTO + 2.2, 2.2);
      desenharMalha('caixa', modelo, corGabinete, { metal: 0.2, dureza: 30, sombra: true });
      m4TRS(modelo, 10.5, COMPRIMENTO / 2, 1.95, 0, 0.7, COMPRIMENTO + 2.2, 0.18);
      desenharMalha('caixa', modelo, corMetalTrilho, { metal: 0.95, dureza: 160, sombra: true });
      // Espelho interno direito
      m4TRS(modelo, 9.85, COMPRIMENTO / 2, 0.8, 0, 0.08, COMPRIMENTO, 1.8);
      desenharMalha('caixa', modelo, corMirror, { metal: 0.92, dureza: 140 });

      // Lockdown bar frontal cromada
      m4TRS(modelo, 0, -0.6, 0.7, 0, LARGURA + 2.4, 1.4, 1.8);
      desenharMalha('caixa', modelo, corMetalTrilho, { metal: 0.94, dureza: 180, sombra: true });

      // Cabeceira traseira / backboard 3D
      m4TRS(modelo, 0, COMPRIMENTO + 1.1, 2.0, 0, LARGURA + 2.4, 1.6, 4.2);
      desenharMalha('caixa', modelo, [0.08, 0.07, 0.10], { metal: 0.25, dureza: 35 });
      // Faixa neon da cabeceira
      m4TRS(modelo, 0, COMPRIMENTO + 0.25, 4.0, 0, LARGURA * 0.92, 0.2, 0.2);
      desenharMalha('caixa', modelo, mesa.cores.emissivo1 || [0.4, 0.8, 1.0],
        { metal: 0.3, dureza: 40, emissivo: 2.2 });

      // Trilho de arame tubular de aco (wireform) separador do canal do lancador
      m4TRS(modelo, 7.3, 14.0, 0.95, 0, 0.12, 26.0, 0.12);
      desenharMalha('cilindro', modelo, [0.92, 0.94, 0.98], { metal: 0.98, dureza: 240, sombra: true });

      // 4. Paredes da mesa (perfil 3D chanfrado com friso superior brilhante)
      var corP = mesa.cores.parede;
      for (var i = 0; i < mesa.paredes.length; i++) {
        var linha = mesa.paredes[i];
        for (var j = 0; j + 1 < linha.length; j++) {
          var ax = linha[j][0], ay = linha[j][1], bx = linha[j + 1][0], by = linha[j + 1][1];
          var mx = (ax + bx) / 2 - 10, my = (ay + by) / 2;
          var dx = bx - ax, dy = by - ay;
          var comp = Math.sqrt(dx * dx + dy * dy) + 0.6;
          var ang = Math.atan2(dy, dx);
          // corpo da parede
          m4TRS(modelo, mx, my, 0.38, ang, comp, 0.62, 0.76);
          desenharMalha('caixa', modelo, corP, { metal: 0.45, dureza: 50, sombra: true });
          // friso superior metalico
          m4TRS(modelo, mx, my, 0.78, ang, comp * 0.96, 0.35, 0.08);
          desenharMalha('caixa', modelo,
            [Math.min(1, corP[0] * 1.5 + 0.15), Math.min(1, corP[1] * 1.5 + 0.15), Math.min(1, corP[2] * 1.5 + 0.15)],
            { metal: 0.85, dureza: 140, sombra: true });
        }
      }

      // 5. Posts e Bumpers 3D com aneis de borracha e joias de neon
      for (var c = 0; c < fisica.circs.length; c++) {
        var cc = fisica.circs[c];
        if (cc.tipo === 'bumper') {
          var corBmp = cc.base.cor;
          var brilhoBmp = cc.brilho || 0;
          // Anel / saia inferior de borracha amortecedora
          m4TRS(modelo, cc.x - 10, cc.y, 0.0, 0, cc.r * 1.08, cc.r * 1.08, 0.28);
          desenharMalha('cilindro', modelo, [0.94, 0.94, 0.96], { metal: 0.15, dureza: 25, sombra: true });
          // Corpo translucido / joia neon iluminada
          m4TRS(modelo, cc.x - 10, cc.y, 0.26, 0, cc.r * 0.94, cc.r * 0.94, 0.62);
          desenharMalha('cilindro', modelo,
            [corBmp[0] * (0.8 + 0.6 * brilhoBmp), corBmp[1] * (0.8 + 0.6 * brilhoBmp), corBmp[2] * (0.8 + 0.6 * brilhoBmp)],
            { metal: 0.35, dureza: 70, emissivo: 0.8 + brilhoBmp * 1.8, sombra: true });
          // Coroa de aco cromado / tampa brilhante
          m4TRS(modelo, cc.x - 10, cc.y, 0.88, 0, cc.r * 0.64, cc.r * 0.64, 0.14);
          desenharMalha('cilindro', modelo, [0.92, 0.94, 0.98], { metal: 0.96, dureza: 180, sombra: true });
          // Pino central refletivo
          m4TRS(modelo, cc.x - 10, cc.y, 1.02, 0, cc.r * 0.25, cc.r * 0.25, 0.10);
          desenharMalha('cilindro', modelo, [1.0, 0.92, 0.6], { metal: 0.98, dureza: 220, sombra: true });
        } else {
          // Post vertical com manga de borracha
          m4TRS(modelo, cc.x - 10, cc.y, 0.0, 0, cc.r, cc.r, 0.75);
          desenharMalha('cilindro', modelo, [0.88, 0.90, 0.92], { metal: 0.65, dureza: 75, sombra: true });
          // Tampa cromada
          m4TRS(modelo, cc.x - 10, cc.y, 0.75, 0, cc.r * 1.15, cc.r * 1.15, 0.10);
          desenharMalha('cilindro', modelo, [0.95, 0.96, 0.99], { metal: 0.95, dureza: 180, sombra: true });
        }
      }

      // 6. Alvos moveis com profundidade e feedback luminoso
      for (var a = 0; a < mesa.alvos.length; a++) {
        var al = mesa.alvos[a];
        var ativo = fisica.alvos[a].ativo;
        var altura = ativo ? 0.55 : 0.1;
        var z = ativo ? 0.28 : 0.05;
        m4TRS(modelo, al.x - 10, al.y, z, al.ang, al.larg, al.alt, altura);
        var corA = al.cor;
        desenharMalha('caixa', modelo, ativo ? corA : [corA[0] * 0.3, corA[1] * 0.3, corA[2] * 0.3],
          { metal: 0.5, dureza: 55, sombra: true, emissivo: ativo ? 0.45 : 0 });
      }

      // 7. Pocos / scoops subterraneos
      if (mesa.pocos) {
        for (var p = 0; p < mesa.pocos.length; p++) {
          var pc = mesa.pocos[p];
          m4TRS(modelo, pc.x - 10, pc.y, 0.04, 0, pc.r, pc.r, 0.08);
          desenharMalha('cilindro', modelo, [0.06, 0.06, 0.09], { metal: 0.9, dureza: 30 });
          m4TRS(modelo, pc.x - 10, pc.y, 0.08, 0, pc.r * 1.15, pc.r * 1.15, 0.04);
          desenharMalha('cilindro', modelo, pc.cor || [0.4, 0.6, 1.0],
            { metal: 0.8, dureza: 80, emissivo: 0.8, sombra: true });
        }
      }

      // Insercoes 3D translúcidas sobre o playfield (joias de luz com moldura chanfrada)
      if (mesa.luzes) {
        for (var il = 0; il < mesa.luzes.length; il++) {
          var lzObj = mesa.luzes[il];
          var corIns = lzObj.cor;
          var intIns = lzObj._intensCalc !== undefined ? lzObj._intensCalc : (lzObj.intens || 0.5);
          var rIns = Math.min(0.55, (lzObj.r || 1.8) * 0.26);
          // Anel / moldura chanfrada embutida na madeira
          m4TRS(modelo, lzObj.x - 10, lzObj.y, 0.02, 0, rIns * 1.25, rIns * 1.25, 0.04);
          desenharMalha('cilindro', modelo, [0.08, 0.08, 0.10], { metal: 0.8, dureza: 40 });
          // Joia de cristal / acrilico colorido emissivo
          m4TRS(modelo, lzObj.x - 10, lzObj.y, 0.04, 0, rIns, rIns, 0.05);
          desenharMalha('cilindro', modelo,
            [corIns[0] * (0.4 + 0.6 * intIns), corIns[1] * (0.4 + 0.6 * intIns), corIns[2] * (0.4 + 0.6 * intIns)],
            { metal: 0.4, dureza: 90, emissivo: 0.4 + intIns * 1.8, sombra: false });
        }
      }

      // 8. Portoes reativos (com altura/cor por HP)
      if (fisica.portoes) {
        for (var ig = 0; ig < fisica.portoes.length; ig++) {
          var pt = fisica.portoes[ig];
          if (!pt.ativo) continue;
          var corPrt = pt.dados.cor || [1.0, 0.8, 0.2];
          var fracHp = Math.max(0.2, pt.hp / pt.maxHp);
          m4TRS(modelo, pt.dados.x - 10, pt.dados.y, 0.35, pt.dados.ang, pt.dados.larg, pt.dados.alt, 0.65 * fracHp);
          desenharMalha('caixa', modelo,
            [corPrt[0] * (0.3 + 0.7 * fracHp), corPrt[1] * (0.3 + 0.7 * fracHp), corPrt[2] * (0.3 + 0.7 * fracHp)],
            { metal: 0.65, dureza: 75, sombra: true, emissivo: 0.4 });
        }
      }

      // 8.5. Spinners mecânicos giratórios (catracas 3D)
      if (fisica.spinners) {
        for (var isp = 0; isp < fisica.spinners.length; isp++) {
          var spn = fisica.spinners[isp];
          var corSpn = spn.cor || [0.95, 0.85, 0.3];
          var meioL = spn.larg / 2;
          m4TRS(modelo, spn.x - 10 - meioL, spn.y, 0, 0, 0.16, 0.16, 0.95);
          desenharMalha('cilindro', modelo, [0.88, 0.90, 0.95], { metal: 0.95, dureza: 180, sombra: true });
          m4TRS(modelo, spn.x - 10 + meioL, spn.y, 0, 0, 0.16, 0.16, 0.95);
          desenharMalha('cilindro', modelo, [0.88, 0.90, 0.95], { metal: 0.95, dureza: 180, sombra: true });
          m4TRS(modelo, spn.x - 10, spn.y, 0.85, 0, spn.larg * 0.98, 0.08, 0.08);
          desenharMalha('caixa', modelo, [0.92, 0.94, 0.98], { metal: 0.98, dureza: 220 });
          var cSp = Math.cos(spn.rot), sSp = Math.sin(spn.rot);
          var matBlade = new Float32Array(16);
          matBlade[0] = spn.larg * 0.88; matBlade[1] = 0; matBlade[2] = 0; matBlade[3] = 0;
          matBlade[4] = 0; matBlade[5] = cSp * 0.08; matBlade[6] = sSp * 0.65; matBlade[7] = 0;
          matBlade[8] = 0; matBlade[9] = -sSp * 0.08; matBlade[10] = cSp * 0.65; matBlade[11] = 0;
          matBlade[12] = spn.x - 10; matBlade[13] = spn.y; matBlade[14] = 0.85; matBlade[15] = 1;
          desenharMalha('caixa', matBlade, corSpn, { metal: 0.9, dureza: 140, sombra: true, emissivo: 0.35 });
        }
      }

      // 9. Flippers 3D com revestimento de borracha e pivo central cromado
      for (var f = 0; f < fisica.flippers.length; f++) {
        var fl = fisica.flippers[f];
        m4TRS(modelo, fl.x - 10, fl.y, 0.24, fl.ang, fl.comp, fl.raio, 0.48);
        desenharMalha('flipper', modelo, [0.94, 0.92, 0.96],
          { metal: 0.70, dureza: 80, sombra: true });
        // Pivo central de aco cromado
        m4TRS(modelo, fl.x - 10, fl.y, 0, 0, 0.48, 0.48, 0.65);
        desenharMalha('cilindro', modelo, [0.88, 0.90, 0.95], { metal: 0.98, dureza: 200, sombra: true });
      }

      // 10. Bolas de aco cromadas (com reflexo ultra-realista e luzes pontuais)
      gl.uniform1f(uni.uSombra, 0);
      for (var ib = 0; ib < bolasAtivas.length; ib++) {
        var b = bolasAtivas[ib];
        if (b.presaTempo > 0.05) continue; // invisivel quando dentro do poco
        m4TRS(modelo, b.x - 10, b.y, b.r, 0, b.r, b.r, b.r);
        desenharMalha('esfera', modelo, [0.95, 0.96, 0.99], { metal: 1.0, dureza: 320 });
      }

      // brilhos aditivos: halos das luzes e dos bumpers
      if (progBrilho) {
        gl.useProgram(progBrilho);
        gl.enable(gl.BLEND);
        gl.depthMask(false);
        gl.uniformMatrix4fv(uniB.uProj, false, proj);
        gl.uniformMatrix4fv(uniB.uView, false, view);
        // a camera nao tem rolagem: direita = +x do mundo, cima = (0, sin, cos)
        gl.uniform3f(uniB.uDir, 1, 0, 0);
        gl.uniform3f(uniB.uDirC, 0, Math.sin(camPitch), Math.cos(camPitch));
        gl.bindVertexArray(vaoQuad);
        for (var q = 0; q < mesa.luzes.length; q++) {
          var L = mesa.luzes[q];
          var intBrilho = L._intensCalc !== undefined ? L._intensCalc : L.intens;
          gl.uniform3f(uniB.uCentro, L.x - 10, L.y, 1.15);
          gl.uniform1f(uniB.uTam, L.r * (0.5 + 0.2 * intBrilho));
          gl.uniform3fv(uniB.uCor, new Float32Array(L.cor));
          gl.uniform1f(uniB.uIntensidade, intBrilho * 0.75 + luzTempo * 0.22);
          gl.drawArrays(gl.TRIANGLES, 0, 6);
        }
        for (var b2 = 0; b2 < fisica.circs.length; b2++) {
          var bc = fisica.circs[b2];
          if (bc.tipo !== 'bumper') continue;
          gl.uniform3f(uniB.uCentro, bc.x - 10, bc.y, bc.r * 0.95 + 0.3);
          gl.uniform1f(uniB.uTam, bc.r * 1.5);
          gl.uniform3fv(uniB.uCor, new Float32Array(bc.base.cor));
          gl.uniform1f(uniB.uIntensidade, 0.30 + bc.brilho * 0.9);
          gl.drawArrays(gl.TRIANGLES, 0, 6);
        }
        gl.bindVertexArray(null);
        gl.depthMask(true);
        gl.disable(gl.BLEND);
      }
    }

    /* -------------------------------- laco -------------------------------- */
    var ultimoTempo = 0;
    function quadro(agora) {
      if (!ultimoTempo) ultimoTempo = agora;
      var dt = (agora - ultimoTempo) / 1000;
      ultimoTempo = agora;
      if (dt > 0.1) dt = 0.1;
      passo(dt);
      desenhar();
      if (mensagemTempo <= 0 && mensagem) mensagem = '';
      publicar();
      raiz.requestAnimationFrame(quadro);
    }

    /* ------------------------------- redimensionar ------------------------ */
    function redimensionar(larg, alt) {
      var dpr = Math.min(raiz.devicePixelRatio || 1, 2);
      larguraTela = Math.max(1, Math.round(larg * dpr));
      alturaTela = Math.max(1, Math.round(alt * dpr));
      canvas.width = larguraTela;
      canvas.height = alturaTela;
      ajustarCamera(larguraTela / alturaTela);
    }

    /* --------------------------------- api -------------------------------- */
    var api = {
      entrada: {
        // segurar/soltar o flipper (esq ou dir) — aciona todos os flippers do lado (inferior e superior)
        fliper: function (lado, ativo) {
          if (!fisica || !fisica.flippers) return;
          var mudou = false;
          for (var f = 0; f < fisica.flippers.length; f++) {
            var fl = fisica.flippers[f];
            if (fl.tag === lado) {
              if (fl.subindo !== ativo) { fl.subindo = ativo; mudou = true; }
            }
          }
          if (mudou && ativo) som_('flipper');
        },
        // segurar para carregar o lancador; soltar para disparar
        lancador: function (ativo) {
          if (estado !== 'lancando') return;
          if (ativo) lancando = true;
          else if (lancando) { lancando = false; lancar(); }
        },
        // tremer / sacudir a mesa (nudge fisico / tilt)
        tremer: function (dir) { tremer(dir); }
      },
      acao: function (nome) {
        if (nome === 'comecar' || nome === 'reiniciar') { comecar(); }
        else if (nome === 'lancar') { lancar(); }
        else if (nome === 'tremer' || nome === 'nudge') { tremer(); }
        else if (nome === 'pausa') { pausado = !pausado; publicar(); }
        else if (nome === 'som') { som = !som; publicar(); }
        else if (nome === 'mesa+') { carregarMesa(indiceMesa + 1); }
        else if (nome === 'mesa-') { carregarMesa(indiceMesa - 1); }
        else if (nome === 'camera') { camPitch = camPitch > 1.0 ? 0.72 : 1.02; ajustarCamera(larguraTela / alturaTela); }
      },
      escolherMesa: function (i) { carregarMesa(i); },
      mesas: function () {
        var lista = [];
        for (var i = 0; i < MESAS.length; i++) {
          var mm = MESAS[i]();
          lista.push({ id: mm.id, nome: mm.nome, subtitulo: mm.subtitulo, missao: mm.missao });
        }
        return lista;
      },
      dados: function () {
        return { mesa: mesa ? mesa.nome : '', nome: mesa ? mesa.nome : '', id: mesa ? mesa.id : '', indice: indiceMesa,
                 pontos: pontos, bolas: bolas, mult: mult, estado: estado,
                 bolasAtivas: bolasAtivas.length, bolasTravadas: bolasTravadas,
                 recorde: mesa ? (recordes[mesa.id] || 0) : 0, pausado: pausado, som: som,
                 mensagem: mensagem, lancador: forcaLancador,
                 kickback: kickbackAtivo, ballSave: tempoSalva > 0, tempoSalva: tempoSalva,
                 tilt: tilt, tiltAvisos: nudgeAvisos, camTremor: camTremor };
      },
      redimensionar: redimensionar,
      iniciar: function () {
        iniciarVideo();
        if (larguraTela <= 1) redimensionar(canvas.clientWidth || 960, canvas.clientHeight || 540);
        carregarMesa(indiceMesa);
        raiz.requestAnimationFrame(quadro);
      },
      avisos: function () { return aviso.slice(); },
      _teste: {
        fisica: function () { return fisica; },
        bola: function () { return bola; },
        bolas: function () { return bolasAtivas.slice(); },
        bolaRaio: BOLA_RAIO,
        definirBola: function (x, y, vx, vy) {
          bola = { x: x, y: y, vx: vx || 0, vy: vy || 0, r: BOLA_RAIO, dentro: true, parada: false, presaTempo: 0, saiuCanal: true };
          bolasAtivas = [bola];
          estado = 'jogando';
        },
        adicionarBola: adicionarBola,
        dispararMultiball: dispararMultiball,
        travarBola: travarBola,
        bolasTravadas: function () { return bolasTravadas; },
        pocos: function () { return mesa ? (mesa.pocos || []) : []; },
        portoes: function () { return fisica ? (fisica.portoes || []) : []; },
        tremer: tremer,
        tilt: function () { return tilt; },
        nudgeAvisos: function () { return nudgeAvisos; },
        removerBola: function () { bola = null; bolasAtivas = []; },
        kickback: function () { return kickbackAtivo; },
        definirKickback: function (v) { kickbackAtivo = !!v; },
        definirTempoSalva: function (v) { tempoSalva = v; },
        tempoSalva: function () { return tempoSalva; },
        zerarSalva: function () { tempoSalva = 0; },
        passo: passo,
        mesa: function () { return mesa; },
        lancadorForca: function () { return forcaLancador; },
        estados: function () { return { estado: estado, pontos: pontos, bolas: bolas, mult: mult }; },
        definirPontos: function (v) { pontos = v; },
        definirEstado: function (e) { estado = e; },
        carregarMesa: carregarMesa,
        lancar: lancar,
        info: function () {
          return {
            programa: !!progPrincipal, brilho: !!progBrilho,
            avisos: aviso.slice(),
            locais: {
              uTex: uni.uTex, uCor: uni.uCor, uModel: uni.uModel
            }
          };
        }
      }
    };
    return api;
  }

  raiz.criarPinball = criarPinball;
  raiz.PINBALL_MESAS = MESAS.length;
})(typeof window !== 'undefined' ? window : this);
