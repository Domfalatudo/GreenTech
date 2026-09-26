(function () {
  var THREE = window.THREE;
  if (!THREE) return;

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var palette = {
    forest: 0x16332a,
    deep: 0x214b3a,
    leaf: 0x6da77a,
    mint: 0xbfe6c6,
    pale: 0xe2f0df,
    blue: 0x5d93a0,
    water: 0x78bec6,
    metal: 0x899b94,
    stone: 0x8c7960,
    gold: 0xd2b76e
  };

  var textures = window.RaizTextures || null;
  var UV_DENSITY = 2.6;

  function surfaceName(metalness, roughness) {
    if (metalness >= 0.4) return 'brushed';
    if (roughness >= 0.82) return 'rock';
    return 'fine';
  }

  function material(color, roughness, metalness, extras) {
    var options = {};
    var name;
    if (extras) {
      name = extras.surface;
      for (var key in extras) {
        if (key !== 'surface') options[key] = extras[key];
      }
    }
    var settings = {};
    for (var setting in options) {
      if (setting !== 'normalScale') settings[setting] = options[setting];
    }
    var surface = new THREE.MeshStandardMaterial(Object.assign({
      color: color,
      roughness: roughness === undefined ? 0.62 : roughness,
      metalness: metalness || 0
    }, settings));
    if (!name) name = surfaceName(surface.metalness, surface.roughness);
    if (textures) textures.apply(surface, name, options);
    return surface;
  }

  function addMesh(parent, geometry, surface, position, scale, rotation) {
    var mesh = new THREE.Mesh(geometry, surface);
    if (position) mesh.position.set(position[0], position[1], position[2]);
    if (scale) mesh.scale.set(scale[0], scale[1], scale[2]);
    if (rotation) mesh.rotation.set(rotation[0], rotation[1], rotation[2]);
    parent.add(mesh);
    return mesh;
  }

  function tileUV(geometry, scaleX, scaleY) {
    var uv = geometry.attributes.uv;
    if (!uv) return geometry;
    for (var i = 0; i < uv.count; i++) {
      uv.setXY(i, uv.getX(i) * scaleX, uv.getY(i) * scaleY);
    }
    uv.needsUpdate = true;
    return geometry;
  }

  function boxGeometry(width, height, depth) {
    var geometry = new THREE.BoxGeometry(width, height, depth);
    var uv = geometry.attributes.uv;
    var faces = [
      [depth, height], [depth, height],
      [width, depth], [width, depth],
      [width, height], [width, height]
    ];
    for (var face = 0; face < faces.length; face++) {
      for (var corner = 0; corner < 4; corner++) {
        var index = face * 4 + corner;
        uv.setXY(index,
          uv.getX(index) * faces[face][0] * UV_DENSITY,
          uv.getY(index) * faces[face][1] * UV_DENSITY);
      }
    }
    uv.needsUpdate = true;
    return geometry;
  }

  function box(parent, width, height, depth, surface, position, rotation) {
    return addMesh(parent, boxGeometry(width, height, depth), surface, position, null, rotation);
  }

  function slabGeometry(width, height, depth, radius) {
    var limit = Math.min(width / 2 - 0.001, height / 2 - 0.001);
    var r = Math.max(0.001, Math.min(radius === undefined ? 0.03 : radius, limit));
    var left = -width / 2;
    var top = -height / 2;
    var shape = new THREE.Shape();
    shape.moveTo(left + r, top);
    shape.lineTo(left + width - r, top);
    shape.quadraticCurveTo(left + width, top, left + width, top + r);
    shape.lineTo(left + width, top + height - r);
    shape.quadraticCurveTo(left + width, top + height, left + width - r, top + height);
    shape.lineTo(left + r, top + height);
    shape.quadraticCurveTo(left, top + height, left, top + height - r);
    shape.lineTo(left, top + r);
    shape.quadraticCurveTo(left, top, left + r, top);
    var bevel = Math.min(r * 0.6, depth * 0.22, 0.022);
    var geometry = new THREE.ExtrudeGeometry(shape, {
      depth: Math.max(0.002, depth - bevel * 2),
      bevelEnabled: true,
      bevelThickness: bevel,
      bevelSize: bevel,
      bevelSegments: 2,
      curveSegments: 4,
      steps: 1
    });
    geometry.center();
    return tileUV(geometry, UV_DENSITY, UV_DENSITY);
  }

  function slab(parent, width, height, depth, surface, position, rotation, radius) {
    return addMesh(parent, slabGeometry(width, height, depth, radius), surface, position, null, rotation);
  }

  function sphere(parent, radius, surface, position, scale, segments) {
    return addMesh(parent, new THREE.SphereGeometry(radius, segments || 20, segments || 14), surface, position, scale);
  }

  function tube(parent, points, radius, surface) {
    var curve = new THREE.CatmullRomCurve3(points.map(function (point) {
      return new THREE.Vector3(point[0], point[1], point[2]);
    }));
    return addMesh(parent, new THREE.TubeGeometry(curve, 32, radius, 7, false), surface);
  }

  function link(parent, start, end, radius, surface) {
    var from = new THREE.Vector3(start[0], start[1], start[2]);
    var to = new THREE.Vector3(end[0], end[1], end[2]);
    var direction = to.clone().sub(from);
    var mesh = addMesh(parent, new THREE.CylinderGeometry(radius, radius, direction.length(), 8), surface);
    mesh.position.copy(from.add(to).multiplyScalar(0.5));
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
    return mesh;
  }

  function ring(parent, radius, thickness, surface, rotation, position) {
    return addMesh(parent, new THREE.TorusGeometry(radius, thickness, 8, 96), surface, position, null, rotation);
  }

  function contactShadow(parent, radius, y, strength) {
    if (!textures) return null;
    var decal = addMesh(parent, new THREE.CircleGeometry(radius, 40), new THREE.MeshBasicMaterial({
      map: textures.shadow(),
      blending: THREE.MultiplyBlending,
      transparent: true,
      depthWrite: false,
      opacity: strength === undefined ? 0.85 : strength
    }), [0, y, 0], null, [-Math.PI / 2, 0, 0]);
    decal.renderOrder = 2;
    return decal;
  }

  function platform(parent, radius, y) {
    var disc = addMesh(parent, new THREE.CylinderGeometry(radius, radius * 0.94, 0.12, 48), material(palette.pale, 0.66, 0.04, {
      surface: 'fine',
      envMapIntensity: 0.65
    }), [0, y, 0]);
    contactShadow(parent, radius * 0.92, y + 0.063, 0.8);
    return disc;
  }

  function buildEarth(root) {
    var globe = new THREE.Group();
    root.add(globe);
    sphere(globe, 1.08, material(palette.deep, 0.56, 0.08, {
      surface: 'globe',
      envMapIntensity: 1.2,
      normalScale: 0.8
    }), [0, 0.18, 0], null, 32);
    addMesh(globe, new THREE.SphereGeometry(1.095, 28, 18), new THREE.MeshBasicMaterial({
      color: palette.mint,
      wireframe: true,
      transparent: true,
      opacity: 0.11
    }), [0, 0.18, 0]);

    var land = material(palette.leaf, 0.8, 0, { surface: 'rock', normalScale: 1.4, envMapIntensity: 0.9 });
    [[-38, 24, 0.4], [-5, 8, 0.28], [55, -12, 0.42], [130, 28, 0.32], [205, -30, 0.38]].forEach(function (place) {
      var longitude = place[0] * Math.PI / 180;
      var latitude = place[1] * Math.PI / 180;
      var normal = new THREE.Vector3(
        Math.cos(latitude) * Math.sin(longitude),
        Math.sin(latitude),
        Math.cos(latitude) * Math.cos(longitude)
      );
      var patch = addMesh(globe, new THREE.IcosahedronGeometry(place[2], 1), land);
      patch.position.copy(normal.clone().multiplyScalar(1.04));
      patch.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), normal);
      patch.scale.set(1.35, 0.22, 0.82);
    });

    var orbit = new THREE.Group();
    root.add(orbit);
    ring(orbit, 1.53, 0.012, material(palette.blue, 0.3, 0.55, { surface: 'brushed', envMapIntensity: 1.2 }), [0.9, 0.2, 0.35]);
    ring(orbit, 1.72, 0.008, material(palette.mint, 0.4, 0.2), [1.28, 0.6, 0.1]);
    [[1.45, 0.6, 0.1], [-1.3, -0.45, 0.8], [0.2, 1.55, -0.7]].forEach(function (position, index) {
      sphere(orbit, index === 0 ? 0.11 : 0.075, material(index === 1 ? palette.blue : palette.gold, 0.28, 0.5, { envMapIntensity: 1.3 }), position, null, 14);
    });

    var roots = material(palette.stone, 0.9, 0, { surface: 'bark', normalScale: 1.4 });
    tube(root, [[-0.16, -0.76, 0], [-0.2, -1.15, 0.04], [-0.48, -1.48, 0.1], [-0.55, -1.82, 0.18]], 0.035, roots);
    tube(root, [[0.06, -0.78, 0.06], [0.16, -1.18, 0.08], [0.45, -1.45, -0.02], [0.62, -1.76, -0.12]], 0.03, roots);
    tube(root, [[0, -0.82, -0.08], [-0.04, -1.23, -0.15], [0.03, -1.58, -0.3], [-0.04, -1.84, -0.48]], 0.026, roots);

    var sprout = new THREE.Group();
    root.add(sprout);
    tube(sprout, [[0, 0.92, 0], [0.02, 1.2, 0], [0.02, 1.52, 0]], 0.035, material(palette.leaf, 0.7, 0, { surface: 'bark', normalScale: 0.8 }));
    sphere(sprout, 0.25, material(palette.leaf, 0.58, 0, { surface: 'leaf', envMapIntensity: 1.1 }), [-0.2, 1.42, 0], [1.1, 0.4, 0.58], 18).rotation.z = -0.48;
    sphere(sprout, 0.24, material(palette.mint, 0.5, 0, { surface: 'leaf', envMapIntensity: 1.1 }), [0.22, 1.52, 0], [1.05, 0.38, 0.55], 18).rotation.z = 0.48;

    return {
      update: function (delta) {
        globe.rotation.y += delta * 0.12;
        orbit.rotation.y -= delta * 0.09;
        sprout.rotation.y += delta * 0.04;
      }
    };
  }

  function buildRoots(root) {
    platform(root, 1.45, -0.82);
    var board = material(palette.forest, 0.44, 0.22, { surface: 'pcb', envMapIntensity: 0.9 });
    slab(root, 1.5, 0.22, 1.5, board, [0, -0.66, 0], null, 0.05);
    slab(root, 1.22, 0.045, 1.22, material(palette.metal, 0.3, 0.52, { surface: 'brushed', envMapIntensity: 1.1 }), [0, -0.52, 0], null, 0.02);

    var pinMaterial = material(palette.gold, 0.3, 0.72, { surface: 'brushed', envMapIntensity: 1.2 });
    for (var i = 0; i < 5; i++) {
      var offset = -0.48 + i * 0.24;
      box(root, 0.08, 0.08, 0.24, pinMaterial, [offset, -0.68, 0.84]);
      box(root, 0.08, 0.08, 0.24, pinMaterial, [offset, -0.68, -0.84]);
      box(root, 0.24, 0.08, 0.08, pinMaterial, [0.84, -0.68, offset]);
      box(root, 0.24, 0.08, 0.08, pinMaterial, [-0.84, -0.68, offset]);
    }

    var core = sphere(root, 0.48, material(palette.blue, 0.2, 0.35, { emissive: 0x16332a, emissiveIntensity: 0.16, envMapIntensity: 1.4 }), [0, 0.04, 0], null, 24);
    ring(root, 0.68, 0.018, material(palette.mint, 0.28, 0.45), [Math.PI / 2, 0.25, 0]);
    ring(root, 0.82, 0.009, material(palette.gold, 0.3, 0.62, { envMapIntensity: 1.25 }), [1.2, 0.2, 0.3]);

    var traceMaterial = material(palette.leaf, 0.38, 0.18);
    [[-0.48, -0.48], [0.48, -0.48], [-0.48, 0.48], [0.48, 0.48]].forEach(function (corner) {
      link(root, [corner[0], -0.48, corner[1]], [corner[0] * 0.55, -0.48, corner[1] * 0.55], 0.018, traceMaterial);
      sphere(root, 0.055, material(palette.mint, 0.28), [corner[0], -0.45, corner[1]], null, 12);
    });

    tube(root, [[0, 0.44, 0], [0, 0.78, 0], [0.03, 1.03, 0]], 0.034, material(palette.leaf, 0.7, 0, { surface: 'bark', normalScale: 0.8 }));
    sphere(root, 0.27, material(palette.leaf, 0.58, 0, { surface: 'leaf', envMapIntensity: 1.1 }), [-0.24, 0.92, 0], [1.05, 0.42, 0.55], 18).rotation.z = -0.62;
    sphere(root, 0.24, material(palette.mint, 0.5, 0, { surface: 'leaf', envMapIntensity: 1.1 }), [0.24, 1.05, 0], [1.05, 0.4, 0.52], 18).rotation.z = 0.55;

    return { update: function (delta) { core.rotation.y += delta * 0.18; } };
  }

  function buildEnergy(root) {
    platform(root, 1.75, -0.88);
    var frame = material(palette.metal, 0.34, 0.5, { surface: 'brushed', envMapIntensity: 1.15 });
    var rack = material(palette.forest, 0.4, 0.34, { surface: 'brushed', normalScale: 0.7 });
    var panel = material(0x315448, 0.52, 0.24, { surface: 'vented', normalScale: 1.8, envMapIntensity: 0.9 });
    var led = material(palette.mint, 0.28, 0.1, { emissive: 0x457e54, emissiveIntensity: 0.28, envMapIntensity: 1.1 });
    var fanGroups = [];
    [-0.78, 0, 0.78].forEach(function (x, rackIndex) {
      slab(root, 0.58, 1.52, 0.56, rack, [x, -0.02, 0], null, 0.045);
      slab(root, 0.64, 0.07, 0.62, frame, [x, 0.78, 0], null, 0.02);
      slab(root, 0.64, 0.07, 0.62, frame, [x, -0.82, 0], null, 0.02);
      for (var row = 0; row < 4; row++) {
        var y = 0.53 - row * 0.36;
        slab(root, 0.46, 0.27, 0.035, panel, [x, y, 0.296], null, 0.014);
        for (var light = 0; light < 3; light++) {
          sphere(root, 0.022, led, [x - 0.16 + light * 0.07, y, 0.32], null, 8);
        }
      }
      if (rackIndex === 2) {
        var fan = new THREE.Group();
        root.add(fan);
        ring(fan, 0.17, 0.025, material(palette.metal, 0.3, 0.62, { envMapIntensity: 1.2 }), [Math.PI / 2, 0, 0], [x, -0.55, 0.33]);
        sphere(fan, 0.045, led, [x, -0.55, 0.34], null, 10);
        for (var blade = 0; blade < 3; blade++) {
          box(fan, 0.055, 0.22, 0.025, material(palette.blue, 0.34, 0.42, { envMapIntensity: 1.2 }), [x, -0.55, 0.34], [0, 0, blade * Math.PI / 3]);
        }
        fanGroups.push(fan);
      }
    });

    var solar = new THREE.Group();
    root.add(solar);
    solar.position.set(1.32, 0.22, -0.3);
    solar.rotation.z = -0.42;
    slab(solar, 0.62, 0.045, 0.52, material(palette.blue, 0.18, 0.3, { surface: 'solar', normalScale: 1.1, envMapIntensity: 1.35 }), [0, 0.36, 0], null, 0.015);
    for (var lineIndex = -2; lineIndex <= 2; lineIndex++) {
      box(solar, 0.014, 0.012, 0.5, material(palette.mint, 0.35, 0.2), [lineIndex * 0.11, 0.39, 0]);
    }
    box(solar, 0.05, 0.4, 0.05, frame, [0, 0.12, 0]);

    sphere(root, 0.13, material(palette.leaf, 0.48, 0, { surface: 'leaf', envMapIntensity: 1.1 }), [-1.3, 0.75, 0.1], [0.55, 1, 0.28], 16).rotation.z = -0.7;
    return {
      update: function (delta) {
        fanGroups.forEach(function (fan) { fan.rotation.z += delta * 0.75; });
      }
    };
  }

  function buildNetwork(root) {
    var cloud = new THREE.Group();
    root.add(cloud);
    var cloudMaterial = material(palette.pale, 0.5, 0.05, { surface: 'cloud', envMapIntensity: 0.8 });
    sphere(cloud, 0.5, cloudMaterial, [0, 0.22, 0], [1.2, 0.74, 0.82], 20);
    sphere(cloud, 0.36, cloudMaterial, [-0.36, 0.34, 0], [1, 0.86, 0.86], 18);
    sphere(cloud, 0.4, cloudMaterial, [0.35, 0.4, 0.02], [1, 0.8, 0.8], 18);
    box(cloud, 0.68, 0.3, 0.55, cloudMaterial, [0, 0.07, 0]);

    var orbit = new THREE.Group();
    root.add(orbit);
    ring(orbit, 1.62, 0.016, material(palette.blue, 0.28, 0.55, { surface: 'brushed', envMapIntensity: 1.2 }), [1.15, 0.12, 0.1]);
    ring(orbit, 1.28, 0.01, material(palette.mint, 0.3, 0.4), [0.86, 0.9, 0]);

    var nodes = [];
    var nodeMaterial = material(palette.leaf, 0.35, 0.24, { emissive: 0x254a31, emissiveIntensity: 0.14 });
    var nodePositions = [[-1.5, 0.65, 0.12], [-0.92, -0.78, 0.7], [0.65, -0.9, -0.34], [1.5, 0.36, 0.25], [0.2, 1.28, -0.4]];
    nodePositions.forEach(function (position, index) {
      sphere(orbit, 0.12, index === 3 ? material(palette.gold, 0.26, 0.6, { envMapIntensity: 1.3 }) : nodeMaterial, position, null, 14);
      link(orbit, position, [position[0] * 0.34, position[1] * 0.32, position[2] * 0.34], 0.012, material(palette.blue, 0.5, 0.2));
      nodes.push(position);
    });

    var deviceMaterial = material(palette.forest, 0.38, 0.34, { surface: 'brushed', normalScale: 0.8 });
    [[-1.45, -0.05, 0.15], [1.35, -0.42, -0.05]].forEach(function (position, index) {
      var device = new THREE.Group();
      orbit.add(device);
      box(device, 0.34, 0.5, 0.12, deviceMaterial, position, [0, 0, index ? -0.24 : 0.2]);
      box(device, 0.25, 0.34, 0.025, material(index ? palette.mint : palette.blue, 0.18, 0.12, {
        emissive: index ? 0x2f5a48 : 0x1d4652,
        emissiveIntensity: 0.4,
        envMapIntensity: 1.25
      }), [position[0], position[1], position[2] + 0.075]);
      sphere(device, 0.025, material(palette.gold, 0.3), [position[0], position[1] - 0.2, position[2] + 0.09], null, 8);
    });

    return {
      update: function (delta) {
        orbit.rotation.y += delta * 0.1;
        cloud.position.y = 0.06 * Math.sin(performance.now() * 0.0008);
      }
    };
  }

  function buildCommunity(root) {
    platform(root, 1.65, -0.82);
    var chip = material(palette.forest, 0.42, 0.24, { surface: 'pcb', envMapIntensity: 0.9 });
    slab(root, 0.82, 0.38, 0.82, chip, [0, -0.22, 0], null, 0.03);
    slab(root, 0.58, 0.1, 0.58, material(palette.blue, 0.26, 0.38, { surface: 'silicon', normalScale: 1.2, envMapIntensity: 1.25 }), [0, 0.02, 0], null, 0.015);
    var core = sphere(root, 0.22, material(palette.gold, 0.2, 0.55, { emissive: 0x6f5222, emissiveIntensity: 0.22, envMapIntensity: 1.4 }), [0, 0.23, 0], null, 18);
    ring(root, 0.42, 0.014, material(palette.mint, 0.28, 0.45), [Math.PI / 2, 0.1, 0]);

    var community = new THREE.Group();
    root.add(community);
    ring(community, 1.36, 0.012, material(palette.blue, 0.28, 0.5, { surface: 'brushed', envMapIntensity: 1.2 }), [1.15, 0.12, 0]);
    var people = [];
    var peopleMaterials = [material(palette.leaf, 0.5), material(palette.blue, 0.5), material(palette.gold, 0.5)];
    for (var person = 0; person < 3; person++) {
      var angle = person * Math.PI * 2 / 3 - Math.PI / 2;
      var x = Math.cos(angle) * 1.36;
      var z = Math.sin(angle) * 1.36;
      var figure = new THREE.Group();
      community.add(figure);
      figure.position.set(x, 0, z);
      sphere(figure, 0.19, material(palette.pale, 0.6), [0, 0.55, 0], [0.76, 1, 0.76], 16);
      addMesh(figure, new THREE.CylinderGeometry(0.13, 0.2, 0.46, 14), peopleMaterials[person], [0, 0.18, 0]);
      link(community, [x * 0.82, 0.2, z * 0.82], [x * 0.35, 0.2, z * 0.35], 0.014, material(palette.mint, 0.45, 0.18));
      people.push(figure);
    }
    return {
      update: function (delta) {
        community.rotation.y += delta * 0.08;
        core.position.y = 0.23 + 0.035 * Math.sin(performance.now() * 0.001);
      }
    };
  }

  function buildWater(root) {
    platform(root, 1.62, -0.86);
    var board = material(palette.forest, 0.44, 0.22, { surface: 'pcb', envMapIntensity: 0.9 });
    slab(root, 1.12, 0.24, 1.12, board, [0.1, -0.7, 0], null, 0.04);
    slab(root, 0.83, 0.06, 0.83, material(palette.metal, 0.26, 0.55, { surface: 'brushed', envMapIntensity: 1.15 }), [0.1, -0.54, 0], null, 0.02);
    var pinMaterial = material(palette.gold, 0.3, 0.72, { surface: 'brushed', envMapIntensity: 1.2 });
    for (var pin = 0; pin < 4; pin++) {
      var offset = -0.34 + pin * 0.22;
      box(root, 0.07, 0.07, 0.2, pinMaterial, [offset + 0.1, -0.72, 0.66]);
      box(root, 0.07, 0.07, 0.2, pinMaterial, [offset + 0.1, -0.72, -0.66]);
      box(root, 0.2, 0.07, 0.07, pinMaterial, [0.76, -0.72, offset]);
      box(root, 0.2, 0.07, 0.07, pinMaterial, [-0.56, -0.72, offset]);
    }

    var dropPoints = [
      new THREE.Vector2(0, 0), new THREE.Vector2(0.2, 0.08),
      new THREE.Vector2(0.38, 0.28), new THREE.Vector2(0.42, 0.52),
      new THREE.Vector2(0.32, 0.82), new THREE.Vector2(0.17, 1.08),
      new THREE.Vector2(0, 1.34)
    ];
    var drop = addMesh(root, new THREE.LatheGeometry(dropPoints, 32), material(palette.water, 0.14, 0.2, {
      transparent: true,
      opacity: 0.88,
      emissive: 0x163d43,
      emissiveIntensity: 0.14,
      surface: 'ripple',
      normalScale: 0.7,
      envMapIntensity: 1.5
    }), [0.12, -0.12, 0], [1, 1, 1], [0, 0, -0.08]);
    sphere(root, 0.07, material(palette.pale, 0.18, 0.1, { surface: 'ripple', envMapIntensity: 1.4 }), [0.02, 0.42, 0.38], [0.72, 1.2, 0.32], 12);

    var rockMaterial = material(palette.stone, 0.88, 0, { surface: 'rock', normalScale: 1.6 });
    [[-1, -0.52, 0.05, 0.3], [-1.25, -0.57, -0.2, 0.22], [-0.82, -0.6, -0.3, 0.19]].forEach(function (rock) {
      addMesh(root, new THREE.DodecahedronGeometry(rock[3], 0), rockMaterial, [rock[0], rock[1], rock[2]], [1.2, 0.82, 1]);
    });
    var crystal = material(palette.blue, 0.16, 0.32, { surface: 'crystal', normalScale: 1.3, envMapIntensity: 1.4 });
    addMesh(root, new THREE.OctahedronGeometry(0.28, 0), crystal, [1.12, -0.38, 0.08], [0.72, 1.3, 0.78], [0.14, 0.2, -0.08]);
    addMesh(root, new THREE.OctahedronGeometry(0.2, 0), material(palette.mint, 0.2, 0.3, { surface: 'crystal', envMapIntensity: 1.4 }), [1.42, -0.52, -0.15], [0.72, 1.05, 0.82]);
    ring(root, 0.94, 0.012, material(palette.blue, 0.28, 0.5, { surface: 'brushed', envMapIntensity: 1.2 }), [1.05, 0.2, 0.1], [0, 0.04, 0]);
    return {
      update: function (delta) {
        drop.rotation.y += delta * 0.12;
        drop.position.y = -0.12 + 0.045 * Math.sin(performance.now() * 0.0011);
      }
    };
  }

  var builders = {
    earth: buildEarth,
    roots: buildRoots,
    energy: buildEnergy,
    network: buildNetwork,
    community: buildCommunity,
    water: buildWater
  };

  function initialize(container) {
    var builder = builders[container.dataset.scene];
    if (!builder) return;

    var scene = new THREE.Scene();
    var camera = new THREE.PerspectiveCamera(34, 1, 0.1, 40);
    camera.position.set(0, 1.2, 7.1);
    camera.lookAt(0, 0, 0);
    var renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.6));
    renderer.setClearColor(0x000000, 0);
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.domElement.setAttribute('aria-hidden', 'true');
    container.appendChild(renderer.domElement);

    if (textures) {
      textures.setAnisotropy(renderer.capabilities.getMaxAnisotropy());
      var environment = textures.environment(renderer);
      if (environment) scene.environment = environment;
    }

    scene.add(new THREE.HemisphereLight(0xe8f5e8, 0x385447, 0.6));
    var key = new THREE.DirectionalLight(0xffffff, 1.05);
    key.position.set(4, 6, 5);
    scene.add(key);
    var fill = new THREE.DirectionalLight(palette.mint, 0.28);
    fill.position.set(-4, 1, -3);
    scene.add(fill);
    var rim = new THREE.DirectionalLight(0xdff3e4, 0.4);
    rim.position.set(-3, 2.4, -5.5);
    scene.add(rim);

    var root = new THREE.Group();
    scene.add(root);
    var composition = builder(root);
    var dragging = false;
    var lastX = 0;
    var lastY = 0;

    function resize() {
      var bounds = container.getBoundingClientRect();
      var width = Math.max(1, Math.round(bounds.width));
      var height = Math.max(1, Math.round(bounds.height));
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    }

    if ('ResizeObserver' in window) {
      new ResizeObserver(resize).observe(container);
    } else {
      window.addEventListener('resize', resize);
    }
    resize();

    container.addEventListener('pointerdown', function (event) {
      dragging = true;
      lastX = event.clientX;
      lastY = event.clientY;
      container.setPointerCapture(event.pointerId);
    });
    container.addEventListener('pointermove', function (event) {
      if (!dragging) return;
      root.rotation.y += (event.clientX - lastX) * 0.007;
      root.rotation.x = THREE.MathUtils.clamp(root.rotation.x + (event.clientY - lastY) * 0.006, -0.5, 0.5);
      lastX = event.clientX;
      lastY = event.clientY;
    });
    function stopDrag() { dragging = false; }
    container.addEventListener('pointerup', stopDrag);
    container.addEventListener('pointercancel', stopDrag);

    var previousTime = 0;
    function render(time) {
      requestAnimationFrame(render);
      var delta = previousTime ? Math.min((time - previousTime) / 1000, 0.05) : 0;
      previousTime = time;
      if (!reduceMotion && !dragging) root.rotation.y += delta * 0.055;
      if (!reduceMotion && composition.update) composition.update(delta);
      renderer.render(scene, camera);
      container.dataset.sceneReady = 'true';
    }
    requestAnimationFrame(render);
  }

  document.querySelectorAll('[data-scene]').forEach(function (container) {
    try {
      initialize(container);
    } catch (error) {
      container.dataset.sceneError = 'true';
      console.error('Raiz 3D scene could not initialize:', error);
    }
  });
})();