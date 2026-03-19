// Photo Editor — fullscreen crop & adjust overlay
// Public API: openPhotoEditor(file) → Promise<{ photoBlob, thumbnailBlob } | null>

function openPhotoEditor(file) {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(url);
      try {
        launchEditor(img, file, resolve);
      } catch (e) {
        console.error('Photo editor failed to open:', e);
        resolve(null);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    img.src = url;
  });
}

function launchEditor(img, file, resolve) {
  // State
  const crop = getAutoCropBounds(img);
  const adjust = { brightness: 0, contrast: 0, saturation: 0 };
  let mode = 'crop'; // 'crop' or 'adjust'
  let dragging = null; // null | 'tl' | 'tr' | 'bl' | 'br' | 'move'
  let dragStart = null;
  let cropStart = null;
  let rafPending = false;

  // Build preview image (downscaled for fast slider response)
  const PREVIEW_MAX = 800;
  const scale = Math.min(1, PREVIEW_MAX / Math.max(img.width, img.height));
  const previewCanvas = document.createElement('canvas');
  previewCanvas.width = Math.round(img.width * scale);
  previewCanvas.height = Math.round(img.height * scale);
  previewCanvas.getContext('2d').drawImage(img, 0, 0, previewCanvas.width, previewCanvas.height);

  // --- Build DOM ---
  const overlay = document.createElement('div');
  overlay.className = 'editor-overlay';

  overlay.innerHTML = `
    <div class="editor-toolbar">
      <button class="editor-btn-cancel" id="editor-cancel">Cancel</button>
      <span class="editor-toolbar-title">Edit Photo</span>
      <button class="editor-btn-save" id="editor-save">Save</button>
    </div>
    <div class="editor-canvas-wrap">
      <canvas id="editor-canvas"></canvas>
    </div>
    <div class="editor-controls">
      <div class="editor-tabs">
        <button class="editor-tab active" data-mode="crop" id="tab-crop">Crop</button>
        <button class="editor-tab" data-mode="adjust" id="tab-adjust">Adjust</button>
      </div>
      <div class="editor-tab-content" id="editor-panel">
        <div class="editor-hint">Drag corners to adjust crop</div>
      </div>
    </div>`;

  document.body.appendChild(overlay);

  const canvas = document.getElementById('editor-canvas');
  const ctx = canvas.getContext('2d');
  const panelEl = document.getElementById('editor-panel');

  // --- Canvas sizing ---
  function sizeCanvas() {
    const wrap = canvas.parentElement;
    const maxW = wrap.clientWidth;
    const maxH = wrap.clientHeight;
    const imgRatio = img.width / img.height;
    let cw, ch;
    if (maxW / maxH > imgRatio) {
      ch = maxH;
      cw = Math.round(ch * imgRatio);
    } else {
      cw = maxW;
      ch = Math.round(cw / imgRatio);
    }
    canvas.width = cw;
    canvas.height = ch;
    canvas.style.width = cw + 'px';
    canvas.style.height = ch + 'px';
  }

  // --- Drawing ---
  function drawCanvas() {
    sizeCanvas();
    const cw = canvas.width;
    const ch = canvas.height;
    const sx = cw / img.width;
    const sy = ch / img.height;

    // Draw the image (or adjusted preview)
    if (mode === 'adjust' && (adjust.brightness !== 0 || adjust.contrast !== 0 || adjust.saturation !== 0)) {
      // Draw adjusted preview
      const previewSx = cw / previewCanvas.width;
      const previewSy = ch / previewCanvas.height;
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = previewCanvas.width;
      tempCanvas.height = previewCanvas.height;
      const tempCtx = tempCanvas.getContext('2d');
      tempCtx.drawImage(previewCanvas, 0, 0);

      const imageData = tempCtx.getImageData(0, 0, tempCanvas.width, tempCanvas.height);
      applyAdjustmentsToPixels(imageData.data, tempCanvas.width * tempCanvas.height, adjust);
      tempCtx.putImageData(imageData, 0, 0);
      ctx.drawImage(tempCanvas, 0, 0, cw, ch);
    } else {
      ctx.drawImage(img, 0, 0, cw, ch);
    }

    // Draw crop overlay
    const cx = crop.x * sx;
    const cy = crop.y * sy;
    const cWidth = crop.w * sx;
    const cHeight = crop.h * sy;

    // Darkened area outside crop
    ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
    // Top
    ctx.fillRect(0, 0, cw, cy);
    // Bottom
    ctx.fillRect(0, cy + cHeight, cw, ch - cy - cHeight);
    // Left
    ctx.fillRect(0, cy, cx, cHeight);
    // Right
    ctx.fillRect(cx + cWidth, cy, cw - cx - cWidth, cHeight);

    // Gold border
    ctx.strokeStyle = '#e2b714';
    ctx.lineWidth = 2;
    ctx.strokeRect(cx, cy, cWidth, cHeight);

    // Corner handles (only in crop mode)
    if (mode === 'crop') {
      const handleSize = 14;
      ctx.fillStyle = '#e2b714';
      const corners = [
        [cx, cy],
        [cx + cWidth, cy],
        [cx, cy + cHeight],
        [cx + cWidth, cy + cHeight]
      ];
      for (const [hx, hy] of corners) {
        ctx.beginPath();
        ctx.arc(hx, hy, handleSize, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  function applyAdjustmentsToPixels(pixels, pixelCount, adj) {
    const contrastFactor = (259 * (adj.contrast + 255)) / (255 * (259 - adj.contrast));
    for (let i = 0; i < pixelCount; i++) {
      const idx = i * 4;
      let r = contrastFactor * (pixels[idx] + adj.brightness - 128) + 128;
      let g = contrastFactor * (pixels[idx + 1] + adj.brightness - 128) + 128;
      let b = contrastFactor * (pixels[idx + 2] + adj.brightness - 128) + 128;

      if (adj.saturation !== 0) {
        const hsl = rgbToHsl(clamp(r), clamp(g), clamp(b));
        const satMul = 1 + adj.saturation / 100;
        hsl[1] = Math.min(1, Math.max(0, hsl[1] * satMul));
        const rgb = hslToRgb(hsl[0], hsl[1], hsl[2]);
        r = rgb[0]; g = rgb[1]; b = rgb[2];
      }

      pixels[idx] = clamp(r);
      pixels[idx + 1] = clamp(g);
      pixels[idx + 2] = clamp(b);
    }
  }

  // --- Crop interaction (Pointer Events) ---
  function canvasToImage(px, py) {
    const sx = img.width / canvas.width;
    const sy = img.height / canvas.height;
    return { x: px * sx, y: py * sy };
  }

  function getCornerHit(px, py) {
    const sx = canvas.width / img.width;
    const sy = canvas.height / img.height;
    const threshold = 30;
    const corners = {
      tl: { x: crop.x * sx, y: crop.y * sy },
      tr: { x: (crop.x + crop.w) * sx, y: crop.y * sy },
      bl: { x: crop.x * sx, y: (crop.y + crop.h) * sy },
      br: { x: (crop.x + crop.w) * sx, y: (crop.y + crop.h) * sy }
    };

    for (const [key, corner] of Object.entries(corners)) {
      const dist = Math.sqrt((px - corner.x) ** 2 + (py - corner.y) ** 2);
      if (dist <= threshold) return key;
    }
    return null;
  }

  function isInsideCrop(px, py) {
    const sx = canvas.width / img.width;
    const sy = canvas.height / img.height;
    const cx = crop.x * sx;
    const cy = crop.y * sy;
    return px >= cx && px <= cx + crop.w * sx && py >= cy && py <= cy + crop.h * sy;
  }

  function onPointerDown(e) {
    if (mode !== 'crop') return;
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;

    const corner = getCornerHit(px, py);
    if (corner) {
      dragging = corner;
    } else if (isInsideCrop(px, py)) {
      dragging = 'move';
    } else {
      return;
    }

    dragStart = { x: px, y: py };
    cropStart = { x: crop.x, y: crop.y, w: crop.w, h: crop.h };
    canvas.setPointerCapture(e.pointerId);
  }

  function onPointerMove(e) {
    if (!dragging) return;
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    const imgPt = canvasToImage(px, py);
    const startImgPt = canvasToImage(dragStart.x, dragStart.y);
    const dx = imgPt.x - startImgPt.x;
    const dy = imgPt.y - startImgPt.y;
    const MIN_CROP = 100;

    if (dragging === 'move') {
      crop.x = Math.max(0, Math.min(img.width - crop.w, cropStart.x + dx));
      crop.y = Math.max(0, Math.min(img.height - crop.h, cropStart.y + dy));
    } else {
      // Corner drag — opposite corner stays fixed, enforce 5:7
      let fixedX, fixedY, freeX, freeY;

      if (dragging === 'tl') {
        fixedX = cropStart.x + cropStart.w;
        fixedY = cropStart.y + cropStart.h;
        freeX = cropStart.x + dx;
        freeY = cropStart.y + dy;
      } else if (dragging === 'tr') {
        fixedX = cropStart.x;
        fixedY = cropStart.y + cropStart.h;
        freeX = cropStart.x + cropStart.w + dx;
        freeY = cropStart.y + dy;
      } else if (dragging === 'bl') {
        fixedX = cropStart.x + cropStart.w;
        fixedY = cropStart.y;
        freeX = cropStart.x + dx;
        freeY = cropStart.y + cropStart.h + dy;
      } else { // br
        fixedX = cropStart.x;
        fixedY = cropStart.y;
        freeX = cropStart.x + cropStart.w + dx;
        freeY = cropStart.y + cropStart.h + dy;
      }

      // Enforce aspect ratio based on width
      let newW = Math.abs(freeX - fixedX);
      let newH = newW / CARD_ASPECT_RATIO;

      // Enforce minimum size
      if (newW < MIN_CROP) {
        newW = MIN_CROP;
        newH = newW / CARD_ASPECT_RATIO;
      }

      // Determine new origin
      let newX = freeX < fixedX ? fixedX - newW : fixedX;
      let newY = freeY < fixedY ? fixedY - newH : fixedY;

      // Clamp to image bounds
      newX = Math.max(0, Math.min(img.width - newW, newX));
      newY = Math.max(0, Math.min(img.height - newH, newY));
      newW = Math.min(newW, img.width - newX);
      newH = newW / CARD_ASPECT_RATIO;

      if (newY + newH > img.height) {
        newH = img.height - newY;
        newW = newH * CARD_ASPECT_RATIO;
      }

      crop.x = Math.round(newX);
      crop.y = Math.round(newY);
      crop.w = Math.round(newW);
      crop.h = Math.round(newH);
    }

    if (!rafPending) {
      rafPending = true;
      requestAnimationFrame(() => {
        rafPending = false;
        drawCanvas();
      });
    }
  }

  function onPointerUp(e) {
    if (dragging) {
      canvas.releasePointerCapture(e.pointerId);
      dragging = null;
      dragStart = null;
      cropStart = null;
    }
  }

  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointercancel', onPointerUp);

  // --- Mode tabs ---
  function switchMode(newMode) {
    mode = newMode;
    document.getElementById('tab-crop').classList.toggle('active', mode === 'crop');
    document.getElementById('tab-adjust').classList.toggle('active', mode === 'adjust');
    renderPanel();
    drawCanvas();
  }

  function renderPanel() {
    if (mode === 'crop') {
      panelEl.innerHTML = '<div class="editor-hint">Drag corners to adjust crop</div>';
    } else {
      panelEl.innerHTML = `
        <div class="editor-slider-group">
          <div class="editor-slider-label"><span>Brightness</span><span class="editor-slider-value" id="val-brightness">${adjust.brightness}</span></div>
          <input type="range" min="-100" max="100" value="${adjust.brightness}" id="slider-brightness">
        </div>
        <div class="editor-slider-group">
          <div class="editor-slider-label"><span>Contrast</span><span class="editor-slider-value" id="val-contrast">${adjust.contrast}</span></div>
          <input type="range" min="-100" max="100" value="${adjust.contrast}" id="slider-contrast">
        </div>
        <div class="editor-slider-group">
          <div class="editor-slider-label"><span>Saturation</span><span class="editor-slider-value" id="val-saturation">${adjust.saturation}</span></div>
          <input type="range" min="-100" max="100" value="${adjust.saturation}" id="slider-saturation">
        </div>
        <div class="editor-adjust-actions">
          <button id="editor-auto">Auto</button>
          <button id="editor-reset">Reset</button>
        </div>`;

      // Wire slider events
      for (const key of ['brightness', 'contrast', 'saturation']) {
        const slider = document.getElementById('slider-' + key);
        const valEl = document.getElementById('val-' + key);
        slider.addEventListener('input', () => {
          adjust[key] = parseInt(slider.value, 10);
          valEl.textContent = adjust[key];
          if (!rafPending) {
            rafPending = true;
            requestAnimationFrame(() => {
              rafPending = false;
              drawCanvas();
            });
          }
        });
      }

      // Auto button
      document.getElementById('editor-auto').addEventListener('click', () => {
        const auto = computeAutoAdjustments(img, crop);
        adjust.brightness = auto.brightness;
        adjust.contrast = auto.contrast;
        adjust.saturation = auto.saturation;
        updateSliders();
        drawCanvas();
      });

      // Reset button
      document.getElementById('editor-reset').addEventListener('click', () => {
        adjust.brightness = 0;
        adjust.contrast = 0;
        adjust.saturation = 0;
        updateSliders();
        drawCanvas();
      });
    }
  }

  function updateSliders() {
    for (const key of ['brightness', 'contrast', 'saturation']) {
      const slider = document.getElementById('slider-' + key);
      const valEl = document.getElementById('val-' + key);
      if (slider && valEl) {
        slider.value = adjust[key];
        valEl.textContent = adjust[key];
      }
    }
  }

  // Tab clicks
  document.getElementById('tab-crop').addEventListener('click', () => switchMode('crop'));
  document.getElementById('tab-adjust').addEventListener('click', () => switchMode('adjust'));

  // --- Save / Cancel ---
  function cleanup() {
    overlay.remove();
  }

  document.getElementById('editor-cancel').addEventListener('click', () => {
    cleanup();
    resolve(null);
  });

  document.getElementById('editor-save').addEventListener('click', async () => {
    // Apply edits using the already-loaded image (no need to re-read the file)
    const edited = applyManualEdits(img, crop, adjust);
    const photoBlob = await compressCanvas(edited, PHOTO_MAX_WIDTH, PHOTO_QUALITY);
    const thumbnailBlob = await compressCanvas(edited, THUMB_MAX_WIDTH, THUMB_QUALITY);
    cleanup();
    resolve({ photoBlob, thumbnailBlob });
  });

  // Initial draw
  drawCanvas();
}
