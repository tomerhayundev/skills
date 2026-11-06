/* object: the business's own product, from its own 3D model, lit like a studio shot and turning slowly. three.js.
   data-model     the site's own .glb (plain glTF binary, no Draco or meshopt compression), with its own materials
   data-motion    idle (a slow turn, the pointer tilts it a little) | scroll (it turns as the page passes) | still
   There is no drawn stand-in: without the business's own model, use its photograph (and the ripple recipe).
   Lighting is never the default: a soft studio environment for reflections, one key light with a soft shadow on
   an invisible floor, neutral tone mapping so the product's colours stay true. The background stays the page's. */
SDMStage.scene('object', { three: true }, function (ctx) {
  var T = ctx.THREE, P = ctx.params;
  var renderer = new T.WebGLRenderer({ canvas: ctx.canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.toneMapping = T.NeutralToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = T.VSMShadowMap;
  var scene = new T.Scene();
  var pmrem = new T.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new T.RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.55;

  var camera = new T.PerspectiveCamera(30, 1, 0.1, 100);
  var key = new T.DirectionalLight('#fff6ec', 1.4);
  key.position.set(2.2, 6, 3);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.radius = 14;
  key.shadow.blurSamples = 16;
  key.shadow.camera.left = key.shadow.camera.bottom = -3;
  key.shadow.camera.right = key.shadow.camera.top = 3;
  scene.add(key);

  var holder = new T.Group();
  scene.add(holder);
  var floor = new T.Mesh(new T.PlaneGeometry(12, 12), new T.ShadowMaterial({ opacity: 0.16 }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  var radius = 1.2;
  function place(obj) {
    obj.traverse(function (o) { if (o.isMesh) o.castShadow = true; });
    var box = new T.Box3().setFromObject(obj), c = box.getCenter(new T.Vector3()), size = box.getSize(new T.Vector3());
    obj.position.sub(c);
    holder.add(obj);
    radius = Math.max(size.x, size.y, size.z) * 0.5 * 1.15;
    floor.position.y = -size.y / 2 - 0.02;
    frame();
  }
  var aspect = 1;
  function frame() {
    // Fit the object's bounding sphere in the view, wherever the canvas is narrow.
    var fov = camera.fov * Math.PI / 180, fit = radius / Math.sin(Math.min(fov, fov * aspect) / 2);
    camera.position.set(0, radius * 0.35, fit * 1.05);
    camera.lookAt(0, 0, 0);
    camera.near = fit / 20; camera.far = fit * 10;
    camera.updateProjectionMatrix();
  }

  // Only the business's own model: never a drawn stand-in (the build refuses an object scene without one).
  if (!P.model) throw new Error('object needs the own 3D model of the business (data-model)');
  var ready = new Promise(function (resolve, reject) {
    // Read with XMLHttpRequest, then parse: fetch never reads a file of a site opened from disk, which is how the
    // meter and the poster maker open it.
    var x = new XMLHttpRequest();
    x.open('GET', P.model); x.responseType = 'arraybuffer';
    x.onload = function () {
      if (x.status && x.status !== 200) return reject(new Error('the model did not load: ' + P.model));
      new T.GLTFLoader().parse(x.response, P.model.replace(/[^/]*$/, ''), function (gltf) { place(gltf.scene); resolve(); }, function (e) { reject(new Error('the model could not be read: ' + (e && e.message || P.model))); });
    };
    x.onerror = function () { reject(new Error('the model did not load: ' + P.model)); };
    x.send();
  });

  var motion = P.motion || 'idle', tiltX = 0, tiltY = 0;
  return {
    ready: ready,
    render: function (f) {
      if (motion === 'scroll') holder.rotation.y = -0.6 + f.progress * Math.PI * 1.2;
      else if (motion === 'idle') holder.rotation.y = f.t * 0.18;
      tiltX += (f.pointer.y * 0.12 - tiltX) * Math.min(1, f.dt * 2.5);
      tiltY += (f.pointer.x * 0.2 - tiltY) * Math.min(1, f.dt * 2.5);
      holder.rotation.x = -tiltX;
      holder.position.x = tiltY * 0.1;
      renderer.render(scene, camera);
    },
    resize: function (w, h, dpr) {
      renderer.setPixelRatio(dpr);
      renderer.setSize(w, h, false);
      camera.aspect = aspect = w / h;
      frame();
    },
    dispose: function () { renderer.dispose(); pmrem.dispose(); },
  };
});
