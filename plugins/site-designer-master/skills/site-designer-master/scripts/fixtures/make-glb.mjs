// A minimal glTF binary (.glb) for tests: one box with normals and a coloured material, written byte by byte so
// the tests need no 3D tool and no file from outside.
export function boxGlb({ size = 1, color = [0.55, 0.32, 0.18, 1] } = {}) {
  const h = size / 2;
  const faces = [
    [[1, 0, 0], [[h, -h, -h], [h, h, -h], [h, h, h], [h, -h, h]]],
    [[-1, 0, 0], [[-h, -h, h], [-h, h, h], [-h, h, -h], [-h, -h, -h]]],
    [[0, 1, 0], [[-h, h, -h], [-h, h, h], [h, h, h], [h, h, -h]]],
    [[0, -1, 0], [[-h, -h, h], [-h, -h, -h], [h, -h, -h], [h, -h, h]]],
    [[0, 0, 1], [[-h, -h, h], [h, -h, h], [h, h, h], [-h, h, h]]],
    [[0, 0, -1], [[h, -h, -h], [-h, -h, -h], [-h, h, -h], [h, h, -h]]],
  ];
  const pos = [], nor = [], idx = [];
  faces.forEach(([n, quad], f) => {
    for (const p of quad) { pos.push(...p); nor.push(...n); }
    const b = f * 4;
    idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
  });
  const P = Buffer.from(new Float32Array(pos).buffer), N = Buffer.from(new Float32Array(nor).buffer), I = Buffer.from(new Uint16Array(idx).buffer);
  const bin = Buffer.concat([P, N, I, Buffer.alloc((4 - (I.length % 4)) % 4)]);
  const json = {
    asset: { version: '2.0' },
    scene: 0, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0 }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0, NORMAL: 1 }, indices: 2, material: 0 }] }],
    materials: [{ pbrMetallicRoughness: { baseColorFactor: color, metallicFactor: 0, roughnessFactor: 0.6 } }],
    buffers: [{ byteLength: bin.length }],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: P.length },
      { buffer: 0, byteOffset: P.length, byteLength: N.length },
      { buffer: 0, byteOffset: P.length + N.length, byteLength: I.length },
    ],
    accessors: [
      { bufferView: 0, componentType: 5126, count: pos.length / 3, type: 'VEC3', min: [-h, -h, -h], max: [h, h, h] },
      { bufferView: 1, componentType: 5126, count: nor.length / 3, type: 'VEC3' },
      { bufferView: 2, componentType: 5123, count: idx.length, type: 'SCALAR' },
    ],
  };
  let js = Buffer.from(JSON.stringify(json));
  js = Buffer.concat([js, Buffer.alloc((4 - (js.length % 4)) % 4, 0x20)]);
  const header = Buffer.alloc(12);
  header.writeUInt32LE(0x46546c67, 0); header.writeUInt32LE(2, 4); header.writeUInt32LE(12 + 8 + js.length + 8 + bin.length, 8);
  const chunk = (buf, type) => { const c = Buffer.alloc(8); c.writeUInt32LE(buf.length, 0); c.writeUInt32LE(type, 4); return Buffer.concat([c, buf]); };
  return Buffer.concat([header, chunk(js, 0x4e4f534a), chunk(bin, 0x004e4942)]);
}
