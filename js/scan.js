// Card scanning — OCR text recognition and auto-matching to card database

let scanWorker = null;

async function getScanWorker() {
  if (scanWorker) return scanWorker;
  if (typeof Tesseract === 'undefined') {
    throw new Error('OCR library not loaded. Please check your internet connection and try again.');
  }
  scanWorker = await Tesseract.createWorker('eng');
  return scanWorker;
}

async function scanCardImage(file) {
  const worker = await getScanWorker();
  const { data: { text } } = await worker.recognize(file);
  return text;
}

function matchCardFromText(ocrText) {
  if (!ocrText || !ocrText.trim()) return [];

  const text = ocrText.toLowerCase();
  const matches = [];

  // Strategy 1: Match card number
  // Look for number patterns: "#123", "No. 123", "No 123", standalone numbers
  const numberPatterns = text.match(/(?:#|no\.?\s*)(\d{1,3})/gi) || [];
  const standaloneNumbers = text.match(/\b(\d{1,3})\b/g) || [];
  const allNumbers = new Set();

  for (const match of numberPatterns) {
    const num = match.replace(/[^0-9]/g, '');
    if (num) allNumbers.add(num);
  }
  for (const num of standaloneNumbers) {
    allNumbers.add(num);
  }

  for (const num of allNumbers) {
    const card = CARDS.find(c => c.number === num);
    if (card) {
      matches.push({ card, confidence: 'number', score: 3 });
    }
  }

  // Strategy 2: Match player name
  // Normalize OCR text: remove special chars, extra spaces
  const cleanText = text.replace(/[^a-z\s]/g, ' ').replace(/\s+/g, ' ').trim();
  const words = cleanText.split(' ').filter(w => w.length >= 3);

  for (const card of CARDS) {
    if (card.name === 'Team Badge') continue;

    const cardName = card.name.toLowerCase();
    // Split card name into parts (handles "First Last" and "First/Second" partnership cards)
    const nameParts = cardName.split(/[\s/]+/).filter(p => p.length >= 3);

    // Check if surname (last meaningful part) appears in OCR text
    const surnames = nameParts.filter(p => !['de', 'van', 'den', 'le', 'la', 'el', 'di', 'da'].includes(p));
    let nameScore = 0;

    for (const part of surnames) {
      // Remove accents for matching
      const normalized = part.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      if (cleanText.includes(normalized) || cleanText.includes(part)) {
        nameScore++;
      }
    }

    if (nameScore > 0) {
      // Higher score for more name parts matched
      const alreadyMatched = matches.find(m => m.card.number === card.number);
      if (alreadyMatched) {
        // Boost score if both number and name match
        alreadyMatched.score += nameScore + 2;
        alreadyMatched.confidence = 'both';
      } else {
        matches.push({
          card,
          confidence: nameScore >= 2 ? 'name-strong' : 'name-weak',
          score: nameScore
        });
      }
    }
  }

  // Sort by score descending, return top 5
  matches.sort((a, b) => b.score - a.score);
  return matches.slice(0, 5);
}

// Render the scan screen
async function renderScanScreen() {
  contentEl().innerHTML = `
    <div class="screen-header">
      <h1>Scan Card</h1>
    </div>
    <div class="scan-screen">
      <div class="scan-instructions">
        Take a photo of a card or upload one from your gallery.
        The app will read the text and try to identify the player.
      </div>
      <div class="scan-buttons">
        <button class="btn btn-primary btn-large" onclick="handleScanCapture(true)">
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:middle;margin-right:8px">
            <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/>
            <circle cx="12" cy="13" r="4"/>
          </svg>
          Take Photo
        </button>
        <button class="btn btn-secondary btn-large" onclick="handleScanCapture(false)">
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:middle;margin-right:8px">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
            <circle cx="8.5" cy="8.5" r="1.5"/>
            <polyline points="21 15 16 10 5 21"/>
          </svg>
          Upload from Gallery
        </button>
      </div>
      <div id="scan-status"></div>
    </div>`;
}

function handleScanCapture(useCamera) {
  createPhotoInput(async (file) => {
    await processScanResult(file);
  }, useCamera);
}

async function processScanResult(file) {
  const statusEl = document.getElementById('scan-status');
  if (!statusEl) return;

  // Show scanning overlay
  statusEl.innerHTML = `
    <div class="scan-overlay">
      <div class="scan-spinner"></div>
      <div class="scan-message">Scanning card...</div>
      <div class="scan-submessage">Reading text from the image</div>
    </div>`;

  try {
    // Run OCR
    const ocrText = await scanCardImage(file);

    // Try to match
    const matches = matchCardFromText(ocrText);

    if (matches.length === 0) {
      // No match found
      statusEl.innerHTML = `
        <div class="scan-result">
          <div class="scan-no-match">
            <div class="scan-result-icon">?</div>
            <div class="scan-result-title">Couldn't identify this card</div>
            <div class="scan-result-sub">The text on the card wasn't clear enough to match.</div>
            <div class="scan-ocr-debug">Text found: "${ocrText.trim().slice(0, 100) || 'none'}"</div>
          </div>
          <div class="scan-retry-actions">
            <button class="btn btn-primary" onclick="handleScanCapture(true)">Try Again</button>
            <button class="btn btn-secondary" onclick="navigateTo('/search')">Search Manually</button>
          </div>
        </div>`;
      return;
    }

    // Store file for saving later
    window._scanFile = file;

    if (matches.length === 1 && matches[0].score >= 3) {
      // High confidence single match — show confirmation
      showScanMatch(matches[0], statusEl);
    } else {
      // Multiple possible matches — let user choose
      showScanChoices(matches, statusEl);
    }
  } catch (e) {
    statusEl.innerHTML = `
      <div class="scan-result">
        <div class="scan-no-match">
          <div class="scan-result-title">Scanning failed</div>
          <div class="scan-result-sub">${e.message}</div>
        </div>
        <div class="scan-retry-actions">
          <button class="btn btn-primary" onclick="handleScanCapture(true)">Try Again</button>
        </div>
      </div>`;
  }
}

function showScanMatch(match, container) {
  const card = match.card;
  const teamName = getTeamName(card.team);
  const collected = isCollected(card.number);

  container.innerHTML = `
    <div class="scan-result">
      <div class="scan-match">
        <div class="scan-result-icon scan-success">&#10003;</div>
        <div class="scan-result-title">${card.name}</div>
        <div class="scan-result-sub">#${card.number} · ${teamName}</div>
        ${collected ? '<div class="scan-already">Already in your collection</div>' : ''}
      </div>
      <div class="scan-retry-actions">
        <button class="btn btn-primary btn-large" onclick="handleScanConfirm('${card.number}')">
          ${collected ? 'Update Photo' : 'Add to Collection'}
        </button>
        <button class="btn btn-secondary" onclick="handleScanCapture(true)">Not this card — Scan Again</button>
      </div>
    </div>`;
}

function showScanChoices(matches, container) {
  const choicesHTML = matches.map(m => {
    const card = m.card;
    const teamName = getTeamName(card.team);
    const collected = isCollected(card.number);
    return `
      <div class="scan-choice" onclick="handleScanConfirm('${card.number}')">
        <div class="scan-choice-info">
          <div class="scan-choice-name">${card.name}</div>
          <div class="scan-choice-meta">#${card.number} · ${teamName}${collected ? ' · Collected' : ''}</div>
        </div>
        <div class="scan-choice-arrow">&rsaquo;</div>
      </div>`;
  }).join('');

  container.innerHTML = `
    <div class="scan-result">
      <div class="scan-match">
        <div class="scan-result-title">Possible matches</div>
        <div class="scan-result-sub">Tap the correct card:</div>
      </div>
      <div class="scan-choices">${choicesHTML}</div>
      <div class="scan-retry-actions">
        <button class="btn btn-secondary" onclick="handleScanCapture(true)">None of these — Scan Again</button>
        <button class="btn btn-secondary" onclick="navigateTo('/search')">Search Manually</button>
      </div>
    </div>`;
}

async function handleScanConfirm(cardNumber) {
  const file = window._scanFile;
  if (!file) return;

  // Open editor for crop & adjust, fall back to auto-processing if editor unavailable
  let photoResult;
  try {
    if (typeof openPhotoEditor === 'function') {
      photoResult = await openPhotoEditor(file);
      if (!photoResult) return; // User cancelled
    } else {
      photoResult = await processPhoto(file);
    }
  } catch (e) {
    console.error('Photo processing error:', e);
    photoResult = await processPhoto(file);
  }
  await savePhoto(cardNumber, photoResult.photoBlob, photoResult.thumbnailBlob);

  // Mark as collected if not already
  if (!isCollected(cardNumber)) {
    await markCollected(cardNumber);
    await refreshCollectedSet();
  }

  delete thumbCache[cardNumber];
  window._scanFile = null;

  // Navigate to the card detail
  navigateTo('/card/' + cardNumber);
}
