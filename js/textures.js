(function (global) {
  'use strict';

  var THREE = global.THREE;
  if (!THREE) return;

  var SIZE = 256;
  var COLOR_TONE = { base: '#dcdcdc', ink: '#787878', light: '#f2f2f2' };
  var HEIGHT_TONE = { base: '#9c9c9c', ink: '#707070', light: '#bababa' };

  var drawn = {};
  var grainMap = null;
  var skyMap = null;
  var shadowMap = null;
  var envTexture = null;
  var anisotropy = 4;
  var seed = 20180117;

  function random() {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  }

  function makeCanvas(size) {
    var element = document.createElement('canvas');
    element.width = size;
    element.height = size;
    return element;
  }

  function gray(value) {
    var tone = Math.max(0, Math.min(255, Math.round(value)));
    return 'rgb(' + tone + ',' + tone + ',' + tone + ')';
  }

  function noiseCanvas(size, base, spread) {
    var element = makeCanvas(size);
    var ctx = element.getContext('2d');
    var image = ctx.createImageData(size, size);
    var data = image.data;
    for (var i = 0; i < data.length; i += 4) {
      var value = base + (random() - 0.5) * spread;
      data[i] = value;
      data[i + 1] = value;
      data[i + 2] = value;
      data[i + 3] = 255;
    }
    ctx.putImageData(image, 0, 0);
    return element;
  }

  function roundedRect(ctx, x, y, width, height, radius) {
    var r = Math.min(radius, width / 2, height / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + width - r, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + r);
    ctx.lineTo(x + width, y + height - r);
    ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
    ctx.lineTo(x + r, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  function drawFine(ctx, size, tone) {
    ctx.fillStyle = tone.base;
    ctx.fillRect(0, 0, size, size);
    ctx.globalAlpha = 0.22;
    for (var i = 0; i < 320; i++) {
      ctx.fillStyle = gray(105 + random() * 150);
      ctx.beginPath();
      ctx.arc(random() * size, random() * size, 1 + random() * 4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function drawBrushed(ctx, size, tone) {
    ctx.fillStyle = tone.base;
    ctx.fillRect(0, 0, size, size);
    for (var i = 0; i < size * 2; i++) {
      ctx.globalAlpha = 0.05 + random() * 0.13;
      ctx.fillStyle = random() > 0.5 ? tone.light : tone.ink;
      ctx.fillRect(0, (random() * size) | 0, size, 1);
    }
    ctx.globalAlpha = 0.07;
    ctx.fillStyle = tone.ink;
    for (var j = 0; j < 26; j++) {
      ctx.fillRect(0, (random() * size) | 0, size, 2);
    }
    ctx.globalAlpha = 1;
  }

  function drawVented(ctx, size, tone) {
    ctx.fillStyle = tone.base;
    ctx.fillRect(0, 0, size, size);
    var margin = size * 0.07;
    ctx.strokeStyle = tone.ink;
    ctx.lineWidth = size * 0.018;
    ctx.strokeRect(margin, margin, size - margin * 2, size - margin * 2);
    var slots = 7;
    var top = margin + size * 0.05;
    var area = size - margin * 2 - size * 0.1;
    var step = area / slots;
    for (var i = 0; i < slots; i++) {
      var y = top + i * step + step * 0.16;
      ctx.fillStyle = tone.ink;
      roundedRect(ctx, margin + size * 0.05, y, size - margin * 2 - size * 0.1, step * 0.5, step * 0.22);
      ctx.fill();
      ctx.fillStyle = tone.light;
      for (var hole = 0; hole < 18; hole++) {
        ctx.globalAlpha = 0.35;
        ctx.beginPath();
        ctx.arc(margin + size * 0.08 + hole * (size - margin * 2 - size * 0.16) / 17, y + step * 0.25, size * 0.008, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
    ctx.fillStyle = tone.ink;
    for (var rivet = 0; rivet < 4; rivet++) {
      var rx = rivet % 2 ? size - margin * 1.4 : margin * 1.4;
      var ry = rivet < 2 ? margin * 1.4 : size - margin * 1.4;
      ctx.beginPath();
      ctx.arc(rx, ry, size * 0.022, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawCircuit(ctx, size, tone) {
    ctx.fillStyle = tone.base;
    ctx.fillRect(0, 0, size, size);
    ctx.strokeStyle = tone.ink;
    ctx.lineWidth = Math.max(1, size * 0.009);
    ctx.lineCap = 'round';
    for (var i = 0; i < 30; i++) {
      var x = random() * size;
      var y = random() * size;
      ctx.beginPath();
      ctx.moveTo(x, y);
      for (var step = 0; step < 4; step++) {
        if (random() > 0.45) x += (0.08 + random() * 0.16) * size * (random() > 0.5 ? 1 : -1);
        else y += (0.08 + random() * 0.16) * size * (random() > 0.5 ? 1 : -1);
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    ctx.fillStyle = tone.light;
    for (var pad = 0; pad < 46; pad++) {
      ctx.beginPath();
      ctx.arc(random() * size, random() * size, size * (0.006 + random() * 0.013), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 0.3;
    ctx.strokeStyle = tone.light;
    ctx.lineWidth = 1;
    for (var grid = 0; grid <= 8; grid++) {
      var pos = grid * size / 8;
      ctx.beginPath();
      ctx.moveTo(pos, 0);
      ctx.lineTo(pos, size);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, pos);
      ctx.lineTo(size, pos);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }


  function drawSilicon(ctx, size, tone) {
    ctx.fillStyle = tone.base;
    ctx.fillRect(0, 0, size, size);
    var pad = size * 0.1;
    ctx.fillStyle = tone.ink;
    ctx.fillRect(0, 0, size, pad);
    ctx.fillRect(0, size - pad, size, pad);
    ctx.fillRect(0, 0, pad, size);
    ctx.fillRect(size - pad, 0, pad, size);
    var cells = 12;
    var cell = (size - pad * 2) / cells;
    for (var y = 0; y < cells; y++) {
      for (var x = 0; x < cells; x++) {
        ctx.globalAlpha = 0.4 + random() * 0.45;
        ctx.fillStyle = (x + y) % 2 ? tone.light : tone.ink;
        ctx.fillRect(pad + x * cell + cell * 0.12, pad + y * cell + cell * 0.12, cell * 0.76, cell * 0.76);
      }
    }
    ctx.globalAlpha = 1;
  }

  function drawSolar(ctx, size, tone) {
    ctx.fillStyle = tone.ink;
    ctx.fillRect(0, 0, size, size);
    var cols = 4;
    var rows = 6;
    var cw = size / cols;
    var ch = size / rows;
    for (var r = 0; r < rows; r++) {
      for (var c = 0; c < cols; c++) {
        ctx.fillStyle = tone.base;
        ctx.fillRect(c * cw + 2, r * ch + 2, cw - 4, ch - 4);
        ctx.strokeStyle = tone.light;
        ctx.lineWidth = 1;
        ctx.strokeRect(c * cw + 2, r * ch + 2, cw - 4, ch - 4);
      }
    }
    ctx.globalAlpha = 0.45;
    ctx.fillStyle = tone.ink;
    for (var col = 0; col < cols; col++) {
      ctx.fillRect(col * cw + cw * 0.3, 0, 2, size);
      ctx.fillRect(col * cw + cw * 0.66, 0, 2, size);
    }
    ctx.globalAlpha = 1;
  }

  function drawRock(ctx, size, tone) {
    ctx.fillStyle = tone.base;
    ctx.fillRect(0, 0, size, size);
    for (var i = 0; i < 700; i++) {
      ctx.globalAlpha = 0.25 + random() * 0.4;
      ctx.fillStyle = gray(85 + random() * 150);
      ctx.beginPath();
      ctx.arc(random() * size, random() * size, 1 + random() * 3.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 0.45;
    ctx.strokeStyle = tone.ink;
    ctx.lineWidth = 2;
    for (var crack = 0; crack < 9; crack++) {
      var x = random() * size;
      var y = random() * size;
      ctx.beginPath();
      ctx.moveTo(x, y);
      for (var step = 0; step < 5; step++) {
        x += (random() - 0.5) * size * 0.25;
        y += (random() - 0.5) * size * 0.25;
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  function drawBark(ctx, size, tone) {
    ctx.fillStyle = tone.base;
    ctx.fillRect(0, 0, size, size);
    for (var i = 0; i < 42; i++) {
      var x = random() * size;
      var y = -10;
      ctx.strokeStyle = random() > 0.5 ? tone.ink : tone.light;
      ctx.globalAlpha = 0.18 + random() * 0.4;
      ctx.lineWidth = 1 + random() * 4;
      ctx.beginPath();
      ctx.moveTo(x, y);
      while (y < size + 10) {
        x += (random() - 0.5) * 10;
        y += 10 + random() * 22;
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  function drawLeaf(ctx, size, tone) {
    ctx.fillStyle = tone.base;
    ctx.fillRect(0, 0, size, size);
    ctx.strokeStyle = tone.ink;
    ctx.lineWidth = size * 0.012;
    ctx.beginPath();
    ctx.moveTo(size * 0.5, 0);
    ctx.lineTo(size * 0.5, size);
    ctx.stroke();
    ctx.lineWidth = size * 0.006;
    ctx.globalAlpha = 0.7;
    for (var i = 1; i < 12; i++) {
      var y = i * size / 12;
      ctx.beginPath();
      ctx.moveTo(size * 0.5, y);
      ctx.quadraticCurveTo(size * 0.5 + size * 0.22, y - size * 0.05, size, y - size * 0.16);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(size * 0.5, y);
      ctx.quadraticCurveTo(size * 0.5 - size * 0.22, y - size * 0.05, 0, y - size * 0.16);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  function drawSoil(ctx, size, tone) {
    ctx.fillStyle = tone.base;
    ctx.fillRect(0, 0, size, size);
    for (var i = 0; i < 420; i++) {
      ctx.globalAlpha = 0.3 + random() * 0.45;
      ctx.fillStyle = gray(75 + random() * 155);
      ctx.beginPath();
      ctx.arc(random() * size, random() * size, 2 + random() * 7, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 0.45;
    ctx.fillStyle = tone.ink;
    for (var stone = 0; stone < 26; stone++) {
      ctx.beginPath();
      ctx.arc(random() * size, random() * size, 3 + random() * 5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function drawCrystal(ctx, size, tone) {
    ctx.fillStyle = tone.base;
    ctx.fillRect(0, 0, size, size);
    var cx = size / 2;
    var cy = size / 2;
    for (var i = 0; i < 10; i++) {
      var angle = i * Math.PI * 2 / 10 + random() * 0.3;
      var length = size * (0.24 + random() * 0.2);
      ctx.fillStyle = i % 2 ? tone.light : tone.ink;
      ctx.globalAlpha = 0.5;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(angle - 0.2) * length, cy + Math.sin(angle - 0.2) * length);
      ctx.lineTo(cx + Math.cos(angle + 0.2) * length, cy + Math.sin(angle + 0.2) * length);
      ctx.closePath();
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function drawRipple(ctx, size, tone) {
    ctx.fillStyle = tone.base;
    ctx.fillRect(0, 0, size, size);
    var cx = size / 2;
    var cy = size / 2;
    ctx.strokeStyle = tone.ink;
    for (var i = 1; i <= 9; i++) {
      ctx.globalAlpha = 0.16 + (i % 2) * 0.16;
      ctx.lineWidth = 1 + (i % 3);
      ctx.beginPath();
      for (var angle = 0; angle <= Math.PI * 2 + 0.2; angle += 0.18) {
        var radius = i * size * 0.055 * (1 + Math.sin(angle * 3 + i) * 0.08);
        var x = cx + Math.cos(angle) * radius;
        var y = cy + Math.sin(angle) * radius;
        if (angle === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  function drawGlobe(ctx, size, tone) {
    var ocean = ctx.createLinearGradient(0, 0, 0, size);
    ocean.addColorStop(0, tone.base);
    ocean.addColorStop(1, tone.ink);
    ctx.fillStyle = ocean;
    ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = tone.light;
    ctx.globalAlpha = 0.5;
    for (var i = 0; i < 7; i++) {
      var cx = random() * size;
      var cy = size * 0.12 + random() * size * 0.76;
      ctx.beginPath();
      for (var angle = 0; angle <= Math.PI * 2 + 0.3; angle += 0.3) {
        var radius = size * (0.05 + random() * 0.08) * (0.7 + 0.5 * Math.sin(angle * 2 + i));
        var x = cx + Math.cos(angle) * radius;
        var y = cy + Math.sin(angle) * radius * 0.8;
        if (angle === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.fill();
    }
    ctx.globalAlpha = 0.32;
    ctx.fillStyle = '#ffffff';
    for (var cloud = 0; cloud < 28; cloud++) {
      ctx.beginPath();
      ctx.ellipse(random() * size, random() * size, size * 0.02 + random() * size * 0.06, size * 0.01 + random() * size * 0.02, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function drawCloud(ctx, size, tone) {
    ctx.fillStyle = tone.base;
    ctx.fillRect(0, 0, size, size);
    for (var i = 0; i < 70; i++) {
      var x = random() * size;
      var y = random() * size;
      var radius = size * (0.03 + random() * 0.1);
      var glow = ctx.createRadialGradient(x, y, 0, x, y, radius);
      glow.addColorStop(0, tone.light);
      glow.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.globalAlpha = 0.22;
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  var recipes = {
    fine: { draw: drawFine, relief: 0.9 },
    brushed: { draw: drawBrushed, relief: 1.1 },
    vented: { draw: drawVented, relief: 2.4 },
    pcb: { draw: drawCircuit, relief: 1.4 },
    silicon: { draw: drawSilicon, relief: 1.2 },
    solar: { draw: drawSolar, relief: 1.6 },
    rock: { draw: drawRock, relief: 2.6 },
    bark: { draw: drawBark, relief: 2.2 },
    leaf: { draw: drawLeaf, relief: 1.4 },
    soil: { draw: drawSoil, relief: 2.8 },
    crystal: { draw: drawCrystal, relief: 1.8 },
    ripple: { draw: drawRipple, relief: 0.8 },
    globe: { draw: drawGlobe, relief: 0.7 },
    cloud: { draw: drawCloud, relief: 0.6 }
  };

  function texture(element, srgb) {
    var map = new THREE.CanvasTexture(element);
    map.wrapS = THREE.RepeatWrapping;
    map.wrapT = THREE.RepeatWrapping;
    map.anisotropy = anisotropy;
    if (srgb) map.encoding = THREE.sRGBEncoding;
    return map;
  }

  function normalFromHeight(element, strength) {
    var size = element.width;
    var source = element.getContext('2d').getImageData(0, 0, size, size).data;
    var output = makeCanvas(size);
    var ctx = output.getContext('2d');
    var image = ctx.createImageData(size, size);
    var data = image.data;
    function sample(x, y) {
      var xi = x < 0 ? 0 : (x >= size ? size - 1 : x);
      var yi = y < 0 ? 0 : (y >= size ? size - 1 : y);
      return source[(yi * size + xi) * 4] / 255;
    }
    for (var y = 0; y < size; y++) {
      for (var x = 0; x < size; x++) {
        var dx = sample(x + 1, y - 1) + 2 * sample(x + 1, y) + sample(x + 1, y + 1)
          - sample(x - 1, y - 1) - 2 * sample(x - 1, y) - sample(x - 1, y + 1);
        var dy = sample(x - 1, y + 1) + 2 * sample(x, y + 1) + sample(x + 1, y + 1)
          - sample(x - 1, y - 1) - 2 * sample(x, y - 1) - sample(x + 1, y - 1);
        var nx = -dx * strength;
        var ny = -dy * strength;
        var length = Math.sqrt(nx * nx + ny * ny + 1);
        var offset = (y * size + x) * 4;
        data[offset] = (nx / length * 0.5 + 0.5) * 255;
        data[offset + 1] = (ny / length * 0.5 + 0.5) * 255;
        data[offset + 2] = (1 / length * 0.5 + 0.5) * 255;
        data[offset + 3] = 255;
      }
    }
    ctx.putImageData(image, 0, 0);
    return output;
  }

  function build(name) {
    if (drawn[name]) return drawn[name];
    var recipe = recipes[name];
    if (!recipe) return null;
    var color = makeCanvas(SIZE);
    recipe.draw(color.getContext('2d'), SIZE, COLOR_TONE);
    var height = makeCanvas(SIZE);
    recipe.draw(height.getContext('2d'), SIZE, HEIGHT_TONE);
    drawn[name] = {
      map: texture(color, true),
      normalMap: texture(normalFromHeight(height, recipe.relief), false)
    };
    return drawn[name];
  }

  function grain() {
    if (!grainMap) grainMap = texture(noiseCanvas(SIZE, 150, 104), false);
    return grainMap;
  }

  function shadow() {
    if (shadowMap) return shadowMap;
    var size = 256;
    var element = makeCanvas(size);
    var ctx = element.getContext('2d');
    var gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    gradient.addColorStop(0, 'rgb(96,96,96)');
    gradient.addColorStop(0.45, 'rgb(168,168,168)');
    gradient.addColorStop(0.78, 'rgb(226,226,226)');
    gradient.addColorStop(1, 'rgb(255,255,255)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
    shadowMap = texture(element, false);
    shadowMap.wrapS = THREE.ClampToEdgeWrapping;
    shadowMap.wrapT = THREE.ClampToEdgeWrapping;
    return shadowMap;
  }

  function sky() {
    if (skyMap) return skyMap;
    var size = 512;
    var element = makeCanvas(size);
    var ctx = element.getContext('2d');
    var gradient = ctx.createLinearGradient(0, 0, 0, size);
    gradient.addColorStop(0, '#ffffff');
    gradient.addColorStop(0.4, '#eaf6ec');
    gradient.addColorStop(0.5, '#d3e4d8');
    gradient.addColorStop(0.68, '#6f7c72');
    gradient.addColorStop(1, '#2b3630');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
    var sun = ctx.createRadialGradient(size * 0.72, size * 0.2, 0, size * 0.72, size * 0.2, size * 0.32);
    sun.addColorStop(0, 'rgba(255,255,255,1)');
    sun.addColorStop(0.3, 'rgba(255,250,235,0.7)');
    sun.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = sun;
    ctx.fillRect(0, 0, size, size);
    skyMap = texture(element, true);
    skyMap.wrapT = THREE.ClampToEdgeWrapping;
    return skyMap;
  }

  function environment(renderer) {
    if (!renderer) return null;
    if (renderer.__raizEnvironment === undefined) {
      var target = null;
      try {
        var generator = new THREE.PMREMGenerator(renderer);
        var room = new THREE.Scene();
        room.add(new THREE.Mesh(
          new THREE.SphereGeometry(20, 24, 16),
          new THREE.MeshBasicMaterial({ map: sky(), side: THREE.BackSide })
        ));
        target = generator.fromScene(room, 0.04);
        generator.dispose();
      } catch (error) {
        target = null;
        if (global.console && global.console.warn) global.console.warn('Raiz: mapa de ambiente indisponivel', error);
      }
      renderer.__raizEnvironment = target ? target.texture : false;
    }
    envTexture = renderer.__raizEnvironment || null;
    return envTexture;
  }

  function apply(surface, name, options) {
    if (!surface) return surface;
    var config = options || {};
    var maps = recipes[name] ? build(name) : null;
    if (maps) {
      surface.map = maps.map;
      surface.normalMap = maps.normalMap;
      if (surface.normalScale && surface.normalScale.set) {
        var depth = config.normalScale === undefined ? 1 : config.normalScale;
        surface.normalScale.set(depth, depth);
      }
    }
    if (config.roughnessMap !== false) surface.roughnessMap = grain();
    if (config.color !== undefined) surface.color = new THREE.Color(config.color);
    if (config.roughness !== undefined) surface.roughness = config.roughness;
    if (config.metalness !== undefined) surface.metalness = config.metalness;
    if (config.emissive !== undefined) surface.emissive = new THREE.Color(config.emissive);
    if (config.emissiveIntensity !== undefined) surface.emissiveIntensity = config.emissiveIntensity;
    if (config.transparent !== undefined) surface.transparent = config.transparent;
    if (config.opacity !== undefined) surface.opacity = config.opacity;
    if (envTexture) {
      surface.envMap = envTexture;
      surface.envMapIntensity = config.envMapIntensity === undefined ? 1 : config.envMapIntensity;
    }
    surface.needsUpdate = true;
    return surface;
  }

  function setAnisotropy(value) {
    anisotropy = value;
    for (var name in drawn) {
      drawn[name].map.anisotropy = value;
      drawn[name].normalMap.anisotropy = value;
    }
    if (grainMap) grainMap.anisotropy = value;
    if (skyMap) skyMap.anisotropy = value;
    if (shadowMap) shadowMap.anisotropy = value;
  }

  global.RaizTextures = {
    apply: apply,
    environment: environment,
    shadow: shadow,
    setAnisotropy: setAnisotropy,
    names: function () {
      var list = [];
      for (var key in recipes) list.push(key);
      return list;
    }
  };
})(window);