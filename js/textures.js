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
    // Base rochosa com gradiente
    var rockGradient = ctx.createRadialGradient(size * 0.4, size * 0.4, 0, size / 2, size / 2, size * 0.8);
    rockGradient.addColorStop(0, tone.light);
    rockGradient.addColorStop(0.5, tone.base);
    rockGradient.addColorStop(1, tone.ink);
    ctx.fillStyle = rockGradient;
    ctx.fillRect(0, 0, size, size);
    
    // Camadas geológicas
    ctx.globalAlpha = 0.15;
    for (var layer = 0; layer < 8; layer++) {
      ctx.strokeStyle = gray(60 + random() * 100);
      ctx.lineWidth = size * 0.004 + random() * size * 0.008;
      ctx.beginPath();
      
      var y = size * 0.1 + layer * size * 0.12;
      var x = -size * 0.1;
      ctx.moveTo(x, y);
      
      while (x < size * 1.1) {
        x += size * 0.08;
        y += (random() - 0.5) * size * 0.03;
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    
    // Grãos minerais grandes
    for (var i = 0; i < 250; i++) {
      var gx = random() * size;
      var gy = random() * size;
      var gr = 1 + random() * 4;
      
      ctx.globalAlpha = 0.3 + random() * 0.5;
      var brightness = 70 + random() * 160;
      
      // Grão com pequeno brilho
      var grain = ctx.createRadialGradient(gx - gr * 0.3, gy - gr * 0.3, 0, gx, gy, gr);
      grain.addColorStop(0, gray(brightness + 40));
      grain.addColorStop(0.5, gray(brightness));
      grain.addColorStop(1, gray(brightness - 40));
      
      ctx.fillStyle = grain;
      ctx.beginPath();
      ctx.arc(gx, gy, gr, 0, Math.PI * 2);
      ctx.fill();
    }
    
    // Cristais pequenos (quartzo, feldspato)
    ctx.globalAlpha = 0.6;
    for (var crystal = 0; crystal < 80; crystal++) {
      var cx = random() * size;
      var cy = random() * size;
      var csize = size * (0.008 + random() * 0.018);
      var cbrightness = 150 + random() * 105;
      
      ctx.fillStyle = gray(cbrightness);
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(random() * Math.PI);
      
      ctx.beginPath();
      ctx.moveTo(-csize, 0);
      ctx.lineTo(0, -csize * 1.5);
      ctx.lineTo(csize, 0);
      ctx.lineTo(0, csize * 1.5);
      ctx.closePath();
      ctx.fill();
      
      ctx.restore();
    }
    
    // Fraturas e rachaduras maiores
    ctx.globalAlpha = 0.4;
    ctx.strokeStyle = tone.ink;
    ctx.lineWidth = 1.5 + random() * 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    
    for (var crack = 0; crack < 12; crack++) {
      var x = random() * size;
      var y = random() * size;
      ctx.beginPath();
      ctx.moveTo(x, y);
      
      for (var step = 0; step < 6; step++) {
        var angle = random() * Math.PI * 2;
        var dist = size * (0.05 + random() * 0.15);
        x += Math.cos(angle) * dist;
        y += Math.sin(angle) * dist;
        ctx.lineTo(x, y);
        
        // Bifurcação ocasional
        if (random() > 0.75) {
          var bx = x;
          var by = y;
          for (var b = 0; b < 2; b++) {
            bx += (random() - 0.5) * size * 0.1;
            by += (random() - 0.5) * size * 0.1;
            ctx.lineTo(bx, by);
          }
          ctx.moveTo(x, y);
        }
      }
      ctx.stroke();
    }
    
    // Rachaduras finas
    ctx.globalAlpha = 0.25;
    ctx.lineWidth = 0.8 + random() * 1;
    for (var fine = 0; fine < 20; fine++) {
      var fx = random() * size;
      var fy = random() * size;
      ctx.beginPath();
      ctx.moveTo(fx, fy);
      
      for (var s = 0; s < 3; s++) {
        fx += (random() - 0.5) * size * 0.12;
        fy += (random() - 0.5) * size * 0.12;
        ctx.lineTo(fx, fy);
      }
      ctx.stroke();
    }
    
    // Poeira mineral fina
    ctx.globalAlpha = 0.2;
    for (var dust = 0; dust < 500; dust++) {
      ctx.fillStyle = gray(80 + random() * 150);
      ctx.beginPath();
      ctx.arc(random() * size, random() * size, 0.3 + random() * 1, 0, Math.PI * 2);
      ctx.fill();
    }
    
    ctx.globalAlpha = 1;
  }

  function drawBark(ctx, size, tone) {
    // Base com gradiente vertical (simula iluminação natural)
    var barkGradient = ctx.createLinearGradient(0, 0, 0, size);
    barkGradient.addColorStop(0, tone.light);
    barkGradient.addColorStop(0.5, tone.base);
    barkGradient.addColorStop(1, tone.ink);
    ctx.fillStyle = barkGradient;
    ctx.fillRect(0, 0, size, size);
    
    // Fissuras verticais principais (características de casca de árvore)
    ctx.strokeStyle = tone.ink;
    ctx.lineWidth = size * 0.015;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.globalAlpha = 0.6;
    
    for (var i = 0; i < 12; i++) {
      var x = (i + 0.5) * size / 12 + (random() - 0.5) * size * 0.08;
      var y = -size * 0.05;
      
      ctx.beginPath();
      ctx.moveTo(x, y);
      
      while (y < size * 1.05) {
        var drift = (random() - 0.5) * size * 0.04;
        x += drift;
        y += size * 0.08 + random() * size * 0.04;
        ctx.lineTo(x, y);
        
        // Nós e protuberâncias ocasionais
        if (random() > 0.85) {
          var knotX = x + (random() - 0.5) * size * 0.06;
          var knotY = y + (random() - 0.5) * size * 0.06;
          ctx.lineTo(knotX, knotY);
          ctx.lineTo(x, y);
        }
      }
      ctx.stroke();
    }
    
    // Fissuras secundárias (horizontais e diagonais)
    ctx.lineWidth = size * 0.008;
    ctx.globalAlpha = 0.4;
    
    for (var j = 0; j < 25; j++) {
      var startX = random() * size;
      var startY = random() * size;
      var angle = (random() - 0.5) * 0.8;
      
      ctx.beginPath();
      ctx.moveTo(startX, startY);
      
      var length = size * (0.1 + random() * 0.2);
      var endX = startX + Math.cos(angle) * length;
      var endY = startY + Math.sin(angle) * length;
      
      ctx.quadraticCurveTo(
        startX + (endX - startX) * 0.5 + (random() - 0.5) * size * 0.03,
        startY + (endY - startY) * 0.5 + (random() - 0.5) * size * 0.03,
        endX, endY
      );
      ctx.stroke();
    }
    
    // Textura de fibras da madeira
    ctx.globalAlpha = 0.25;
    ctx.lineWidth = size * 0.003;
    
    for (var fiber = 0; fiber < 50; fiber++) {
      ctx.strokeStyle = random() > 0.5 ? tone.ink : tone.light;
      var fx = random() * size;
      var fy = 0;
      
      ctx.beginPath();
      ctx.moveTo(fx, fy);
      
      while (fy < size) {
        fx += (random() - 0.5) * size * 0.02;
        fy += size * 0.05 + random() * size * 0.05;
        ctx.lineTo(fx, fy);
      }
      ctx.stroke();
    }
    
    // Manchas de musgo e líquens
    ctx.globalAlpha = 0.2;
    for (var lichen = 0; lichen < 40; lichen++) {
      var lx = random() * size;
      var ly = random() * size;
      var lr = size * (0.02 + random() * 0.05);
      
      var lichenGrad = ctx.createRadialGradient(lx, ly, 0, lx, ly, lr);
      lichenGrad.addColorStop(0, 'rgba(120, 140, 100, 0.5)');
      lichenGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
      
      ctx.fillStyle = lichenGrad;
      ctx.beginPath();
      ctx.arc(lx, ly, lr, 0, Math.PI * 2);
      ctx.fill();
    }
    
    // Cavidades e buracos de insetos
    ctx.globalAlpha = 0.7;
    for (var hole = 0; hole < 8; hole++) {
      var hx = random() * size;
      var hy = random() * size;
      var hr = size * (0.008 + random() * 0.015);
      
      var holeGrad = ctx.createRadialGradient(hx, hy, 0, hx, hy, hr);
      holeGrad.addColorStop(0, tone.ink);
      holeGrad.addColorStop(1, tone.base);
      
      ctx.fillStyle = holeGrad;
      ctx.beginPath();
      ctx.arc(hx, hy, hr, 0, Math.PI * 2);
      ctx.fill();
    }
    
    // Detalhe fino da textura
    ctx.globalAlpha = 0.15;
    for (var detail = 0; detail < 1000; detail++) {
      ctx.fillStyle = gray(70 + random() * 160);
      ctx.beginPath();
      ctx.arc(random() * size, random() * size, 0.3 + random() * 0.8, 0, Math.PI * 2);
      ctx.fill();
    }
    
    ctx.globalAlpha = 1;
  }

  function drawLeaf(ctx, size, tone) {
    // Base com gradiente natural de folhagem
    var leafGradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size);
    leafGradient.addColorStop(0, tone.base);
    leafGradient.addColorStop(1, tone.ink);
    ctx.fillStyle = leafGradient;
    ctx.fillRect(0, 0, size, size);
    
    // Padrão de nervuras principais
    ctx.strokeStyle = tone.ink;
    ctx.lineWidth = size * 0.008;
    ctx.globalAlpha = 0.5;
    
    for (var main = 0; main < 5; main++) {
      var startX = random() * size;
      var startY = random() * size * 0.2;
      ctx.beginPath();
      ctx.moveTo(startX, startY);
      
      var x = startX;
      var y = startY;
      while (y < size) {
        x += (random() - 0.5) * size * 0.08;
        y += size * 0.12;
        ctx.lineTo(x, y);
      }
      ctx.stroke();
      
      // Nervuras secundárias
      ctx.lineWidth = size * 0.004;
      ctx.globalAlpha = 0.35;
      var segments = Math.floor(y / (size * 0.12));
      for (var seg = 1; seg < segments; seg++) {
        var baseY = startY + seg * size * 0.12;
        var baseX = startX + (seg * (random() - 0.5) * size * 0.08);
        
        // Nervura para direita
        ctx.beginPath();
        ctx.moveTo(baseX, baseY);
        ctx.quadraticCurveTo(
          baseX + size * 0.15, baseY + size * 0.05,
          baseX + size * 0.25, baseY + size * 0.02
        );
        ctx.stroke();
        
        // Nervura para esquerda
        ctx.beginPath();
        ctx.moveTo(baseX, baseY);
        ctx.quadraticCurveTo(
          baseX - size * 0.15, baseY + size * 0.05,
          baseX - size * 0.25, baseY + size * 0.02
        );
        ctx.stroke();
      }
      ctx.lineWidth = size * 0.008;
      ctx.globalAlpha = 0.5;
    }
    
    // Manchas e variação de cor (simula clorofila irregular)
    ctx.globalAlpha = 0.2;
    for (var spot = 0; spot < 60; spot++) {
      var sx = random() * size;
      var sy = random() * size;
      var sr = size * (0.02 + random() * 0.06);
      
      var spotGrad = ctx.createRadialGradient(sx, sy, 0, sx, sy, sr);
      spotGrad.addColorStop(0, random() > 0.5 ? tone.light : tone.ink);
      spotGrad.addColorStop(1, 'rgba(0,0,0,0)');
      
      ctx.fillStyle = spotGrad;
      ctx.beginPath();
      ctx.arc(sx, sy, sr, 0, Math.PI * 2);
      ctx.fill();
    }
    
    // Textura fina (células da folha)
    ctx.globalAlpha = 0.15;
    for (var cell = 0; cell < 800; cell++) {
      ctx.fillStyle = gray(90 + random() * 140);
      ctx.beginPath();
      ctx.arc(random() * size, random() * size, 0.5 + random() * 1, 0, Math.PI * 2);
      ctx.fill();
    }
    
    ctx.globalAlpha = 1;
  }

  function drawSoil(ctx, size, tone) {
    // Base com gradiente sutil para profundidade
    var gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size);
    gradient.addColorStop(0, tone.base);
    gradient.addColorStop(1, tone.ink);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
    
    // Camada de partículas de terra grandes (torrões)
    for (var i = 0; i < 120; i++) {
      var x = random() * size;
      var y = random() * size;
      var radius = 4 + random() * 12;
      var brightness = 60 + random() * 140;
      
      // Gradiente radial para cada torrão
      var clump = ctx.createRadialGradient(x, y, 0, x, y, radius);
      clump.addColorStop(0, gray(brightness + 20));
      clump.addColorStop(0.6, gray(brightness));
      clump.addColorStop(1, gray(brightness - 30));
      
      ctx.globalAlpha = 0.4 + random() * 0.5;
      ctx.fillStyle = clump;
      ctx.beginPath();
      // Torrões irregulares
      for (var angle = 0; angle <= Math.PI * 2; angle += Math.PI / 4) {
        var r = radius * (0.7 + random() * 0.6);
        var px = x + Math.cos(angle) * r;
        var py = y + Math.sin(angle) * r;
        if (angle === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
    }
    
    // Partículas médias de terra
    for (var j = 0; j < 300; j++) {
      ctx.globalAlpha = 0.35 + random() * 0.4;
      ctx.fillStyle = gray(70 + random() * 160);
      ctx.beginPath();
      ctx.arc(random() * size, random() * size, 1.5 + random() * 5, 0, Math.PI * 2);
      ctx.fill();
    }
    
    // Partículas finas (poeira)
    for (var k = 0; k < 600; k++) {
      ctx.globalAlpha = 0.15 + random() * 0.25;
      ctx.fillStyle = gray(80 + random() * 150);
      ctx.beginPath();
      ctx.arc(random() * size, random() * size, 0.5 + random() * 2, 0, Math.PI * 2);
      ctx.fill();
    }
    
    // Pedras e pequenos detritos
    ctx.globalAlpha = 0.5;
    for (var stone = 0; stone < 35; stone++) {
      var sx = random() * size;
      var sy = random() * size;
      var sr = 3 + random() * 7;
      
      ctx.fillStyle = gray(50 + random() * 80);
      ctx.beginPath();
      // Pedras irregulares
      for (var a = 0; a <= Math.PI * 2; a += Math.PI / 3 + random() * 0.3) {
        var dist = sr * (0.8 + random() * 0.4);
        var px = sx + Math.cos(a) * dist;
        var py = sy + Math.sin(a) * dist;
        if (a === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
      
      // Destaque nas pedras
      ctx.globalAlpha = 0.3;
      ctx.fillStyle = gray(140 + random() * 60);
      ctx.beginPath();
      ctx.arc(sx - sr * 0.2, sy - sr * 0.2, sr * 0.3, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 0.5;
    }
    
    // Rachaduras e fissuras no solo
    ctx.globalAlpha = 0.2;
    ctx.strokeStyle = tone.ink;
    ctx.lineWidth = 1 + random();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    
    for (var crack = 0; crack < 15; crack++) {
      var cx = random() * size;
      var cy = random() * size;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      
      for (var seg = 0; seg < 4 + random() * 4; seg++) {
        cx += (random() - 0.5) * size * 0.15;
        cy += (random() - 0.5) * size * 0.15;
        ctx.lineTo(cx, cy);
        
        // Ramificações ocasionais
        if (random() > 0.7) {
          var bx = cx;
          var by = cy;
          for (var b = 0; b < 2; b++) {
            bx += (random() - 0.5) * size * 0.08;
            by += (random() - 0.5) * size * 0.08;
            ctx.lineTo(bx, by);
          }
          ctx.moveTo(cx, cy);
        }
      }
      ctx.stroke();
    }
    
    // Textura orgânica sutil (restos vegetais microscópicos)
    ctx.globalAlpha = 0.15;
    for (var org = 0; org < 200; org++) {
      ctx.fillStyle = random() > 0.5 ? '#3a2a1a' : '#5a4a3a';
      ctx.beginPath();
      ctx.arc(random() * size, random() * size, 0.5 + random() * 1.5, 0, Math.PI * 2);
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
    rock: { draw: drawRock, relief: 3.5 },
    bark: { draw: drawBark, relief: 2.8 },
    leaf: { draw: drawLeaf, relief: 2.0 },
    soil: { draw: drawSoil, relief: 3.2 },
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