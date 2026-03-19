// Photo capture, auto-crop, color normalization, and compression
// Processes phone camera photos to look uniform in the binder

const PHOTO_MAX_WIDTH = 800;
const PHOTO_QUALITY = 0.7;
const THUMB_MAX_WIDTH = 150;
const THUMB_QUALITY = 0.6;
const CARD_ASPECT_RATIO = 5 / 7; // Standard card proportions (width / height)

// --- Auto-crop: detect card edges and crop tightly ---

function autoCropCard(img) {
  const canvas = document.createElement('canvas');
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0);

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const pixels = imageData.data;
  const w = canvas.width;
  const h = canvas.height;

  // Convert to grayscale brightness values
  const gray = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const r = pixels[i * 4];
    const g = pixels[i * 4 + 1];
    const b = pixels[i * 4 + 2];
    gray[i] = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
  }

  // Compute average brightness to set a dynamic threshold
  let totalBrightness = 0;
  for (let i = 0; i < gray.length; i++) {
    totalBrightness += gray[i];
  }
  const avgBrightness = totalBrightness / gray.length;

  // Threshold: pixels brighter than this are considered "card"
  // Use a value between the average and dark — biased toward detecting the card
  const threshold = Math.max(avgBrightness * 0.6, 40);

  // Scan from each edge inward to find where the card starts
  // A row/column "has card" if enough of its pixels are above threshold
  const edgeFraction = 0.3; // 30% of pixels must be bright to count as card

  // Find top edge
  let top = 0;
  for (let y = 0; y < h; y++) {
    let brightCount = 0;
    for (let x = 0; x < w; x++) {
      if (gray[y * w + x] > threshold) brightCount++;
    }
    if (brightCount / w >= edgeFraction) {
      top = y;
      break;
    }
  }

  // Find bottom edge
  let bottom = h - 1;
  for (let y = h - 1; y >= 0; y--) {
    let brightCount = 0;
    for (let x = 0; x < w; x++) {
      if (gray[y * w + x] > threshold) brightCount++;
    }
    if (brightCount / w >= edgeFraction) {
      bottom = y;
      break;
    }
  }

  // Find left edge
  let left = 0;
  for (let x = 0; x < w; x++) {
    let brightCount = 0;
    for (let y = 0; y < h; y++) {
      if (gray[y * w + x] > threshold) brightCount++;
    }
    if (brightCount / h >= edgeFraction) {
      left = x;
      break;
    }
  }

  // Find right edge
  let right = w - 1;
  for (let x = w - 1; x >= 0; x--) {
    let brightCount = 0;
    for (let y = 0; y < h; y++) {
      if (gray[y * w + x] > threshold) brightCount++;
    }
    if (brightCount / h >= edgeFraction) {
      right = x;
      break;
    }
  }

  // Validate detected bounds — if the crop is too small or nonsensical, center-crop instead
  let cropX = left;
  let cropY = top;
  let cropW = right - left + 1;
  let cropH = bottom - top + 1;

  const minCropFraction = 0.2; // Card must be at least 20% of the image in each dimension
  if (cropW < w * minCropFraction || cropH < h * minCropFraction || cropW <= 0 || cropH <= 0) {
    // Fallback: center-crop to 5:7 aspect ratio
    return centerCrop(img, w, h);
  }

  // Add a small margin (2% of detected size) but stay within bounds
  const marginX = Math.round(cropW * 0.02);
  const marginY = Math.round(cropH * 0.02);
  cropX = Math.max(0, cropX - marginX);
  cropY = Math.max(0, cropY - marginY);
  cropW = Math.min(w - cropX, cropW + marginX * 2);
  cropH = Math.min(h - cropY, cropH + marginY * 2);

  // Force 5:7 aspect ratio
  return applyAspectRatio(img, cropX, cropY, cropW, cropH, w, h);
}

function centerCrop(img, w, h) {
  // Center-crop to 5:7 aspect ratio
  let cropW, cropH, cropX, cropY;
  if (w / h > CARD_ASPECT_RATIO) {
    // Image is wider than 5:7 — constrain by height
    cropH = h;
    cropW = Math.round(h * CARD_ASPECT_RATIO);
    cropX = Math.round((w - cropW) / 2);
    cropY = 0;
  } else {
    // Image is taller than 5:7 — constrain by width
    cropW = w;
    cropH = Math.round(w / CARD_ASPECT_RATIO);
    cropX = 0;
    cropY = Math.round((h - cropH) / 2);
  }

  const out = document.createElement('canvas');
  out.width = cropW;
  out.height = cropH;
  const outCtx = out.getContext('2d');
  outCtx.drawImage(img, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);
  return out;
}

function applyAspectRatio(img, cropX, cropY, cropW, cropH, imgW, imgH) {
  // Adjust crop region to 5:7 aspect ratio, expanding if possible
  const currentRatio = cropW / cropH;

  if (currentRatio > CARD_ASPECT_RATIO) {
    // Too wide — increase height or decrease width
    const targetH = Math.round(cropW / CARD_ASPECT_RATIO);
    if (targetH <= imgH) {
      const extraH = targetH - cropH;
      cropY = Math.max(0, cropY - Math.round(extraH / 2));
      cropH = targetH;
      if (cropY + cropH > imgH) cropY = imgH - cropH;
    } else {
      // Can't expand height enough — shrink width instead
      cropH = imgH;
      cropY = 0;
      const targetW = Math.round(cropH * CARD_ASPECT_RATIO);
      const extraW = cropW - targetW;
      cropX = cropX + Math.round(extraW / 2);
      cropW = targetW;
    }
  } else {
    // Too tall — increase width or decrease height
    const targetW = Math.round(cropH * CARD_ASPECT_RATIO);
    if (targetW <= imgW) {
      const extraW = targetW - cropW;
      cropX = Math.max(0, cropX - Math.round(extraW / 2));
      cropW = targetW;
      if (cropX + cropW > imgW) cropX = imgW - cropW;
    } else {
      // Can't expand width enough — shrink height instead
      cropW = imgW;
      cropX = 0;
      const targetH = Math.round(cropW / CARD_ASPECT_RATIO);
      const extraH = cropH - targetH;
      cropY = cropY + Math.round(extraH / 2);
      cropH = targetH;
    }
  }

  const out = document.createElement('canvas');
  out.width = cropW;
  out.height = cropH;
  const outCtx = out.getContext('2d');
  outCtx.drawImage(img, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);
  return out;
}

// --- Color normalization: auto-levels + saturation boost ---

function normalizeColors(canvas) {
  const ctx = canvas.getContext('2d');
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const pixels = imageData.data;
  const pixelCount = canvas.width * canvas.height;

  // Build brightness histogram
  const histogram = new Uint32Array(256);
  for (let i = 0; i < pixelCount; i++) {
    const r = pixels[i * 4];
    const g = pixels[i * 4 + 1];
    const b = pixels[i * 4 + 2];
    const brightness = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
    histogram[brightness]++;
  }

  // Find 1st and 99th percentile brightness values
  const pLow = Math.floor(pixelCount * 0.01);
  const pHigh = Math.floor(pixelCount * 0.99);
  let cumulative = 0;
  let lowVal = 0;
  let highVal = 255;

  for (let i = 0; i < 256; i++) {
    cumulative += histogram[i];
    if (cumulative >= pLow && lowVal === 0) {
      lowVal = i;
    }
    if (cumulative >= pHigh) {
      highVal = i;
      break;
    }
  }

  // Avoid division by zero if image is uniform
  const range = highVal - lowVal;
  if (range < 10) {
    // Image is nearly uniform — skip levels stretch, just do saturation
    applySaturationBoost(pixels, pixelCount);
    ctx.putImageData(imageData, 0, 0);
    return canvas;
  }

  // Apply auto-levels stretch and saturation boost in one pass
  for (let i = 0; i < pixelCount; i++) {
    const idx = i * 4;
    // Auto-levels: stretch each channel based on brightness range
    let r = clamp(((pixels[idx] - lowVal) / range) * 255);
    let g = clamp(((pixels[idx + 1] - lowVal) / range) * 255);
    let b = clamp(((pixels[idx + 2] - lowVal) / range) * 255);

    // Saturation boost: convert to HSL, increase S by 15%, convert back
    const hsl = rgbToHsl(r, g, b);
    hsl[1] = Math.min(1, hsl[1] * 1.15); // 15% boost
    const rgb = hslToRgb(hsl[0], hsl[1], hsl[2]);

    pixels[idx] = rgb[0];
    pixels[idx + 1] = rgb[1];
    pixels[idx + 2] = rgb[2];
    // Alpha unchanged
  }

  ctx.putImageData(imageData, 0, 0);
  return canvas;
}

function applySaturationBoost(pixels, pixelCount) {
  for (let i = 0; i < pixelCount; i++) {
    const idx = i * 4;
    const hsl = rgbToHsl(pixels[idx], pixels[idx + 1], pixels[idx + 2]);
    hsl[1] = Math.min(1, hsl[1] * 1.15);
    const rgb = hslToRgb(hsl[0], hsl[1], hsl[2]);
    pixels[idx] = rgb[0];
    pixels[idx + 1] = rgb[1];
    pixels[idx + 2] = rgb[2];
  }
}

function clamp(val) {
  return Math.max(0, Math.min(255, Math.round(val)));
}

function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0, s = 0;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
    else if (max === g) h = ((b - r) / d + 2) / 6;
    else h = ((r - g) / d + 4) / 6;
  }

  return [h, s, l];
}

function hslToRgb(h, s, l) {
  if (s === 0) {
    const v = clamp(l * 255);
    return [v, v, v];
  }

  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return [
    clamp(hueToRgb(p, q, h + 1/3) * 255),
    clamp(hueToRgb(p, q, h) * 255),
    clamp(hueToRgb(p, q, h - 1/3) * 255)
  ];
}

function hueToRgb(p, q, t) {
  if (t < 0) t += 1;
  if (t > 1) t -= 1;
  if (t < 1/6) return p + (q - p) * 6 * t;
  if (t < 1/2) return q;
  if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
  return p;
}

// --- Processing pipeline: crop → normalize → compress ---

function processAndCompressImage(file, maxWidth, quality) {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(url);

      // Step 1: Auto-crop to card edges
      const cropped = autoCropCard(img);

      // Step 2: Normalize colors
      normalizeColors(cropped);

      // Step 3: Resize to target dimensions
      let width = cropped.width;
      let height = cropped.height;

      if (width > maxWidth) {
        height = Math.round((height * maxWidth) / width);
        width = maxWidth;
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d');
      ctx.drawImage(cropped, 0, 0, width, height);

      // Step 4: Export as JPEG
      canvas.toBlob(
        (blob) => resolve(blob),
        'image/jpeg',
        quality
      );
    };

    img.src = url;
  });
}

async function processPhoto(file) {
  const photoBlob = await processAndCompressImage(file, PHOTO_MAX_WIDTH, PHOTO_QUALITY);
  const thumbnailBlob = await processAndCompressImage(file, THUMB_MAX_WIDTH, THUMB_QUALITY);
  return { photoBlob, thumbnailBlob };
}

function createPhotoInput(onFileSelected) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.capture = 'environment';
  input.style.display = 'none';

  input.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
      onFileSelected(file);
    }
    // Remove input after use
    input.remove();
  });

  document.body.appendChild(input);
  input.click();
}
