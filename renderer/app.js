// ─── State ──────────────────────────────────────────────────────────────
let clips = [];

// ─── DOM References ────────────────────────────────────────────────────
const clipList = document.getElementById('clip-list');
const emptyState = document.getElementById('empty-state');

// ─── Helpers ───────────────────────────────────────────────────────────
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ─── Render ────────────────────────────────────────────────────────────
function render() {
  if (clips.length === 0) {
    emptyState.style.display = 'flex';
    clipList.innerHTML = '';
    return;
  }
  emptyState.style.display = 'none';

  let html = '';
  for (const clip of clips) {
    let contentHtml = '';
    if (clip.type === 'text') {
      contentHtml = `<div class="clip-text">${escapeHtml(clip.text_content)}</div>`;
    } else if (clip.type === 'image' && clip.image_url) {
      contentHtml = `<img class="clip-image-preview" src="${clip.image_url}" alt="剪贴板图片">`;
    }

    html += `<div class="clip-card" data-id="${clip.id}">
      <div class="clip-content">${contentHtml}</div>
    </div>`;
  }
  clipList.innerHTML = html;
}

// ─── Event Handlers ───────────────────────────────────────────────────
clipList.addEventListener('click', (e) => {
  const card = e.target.closest('.clip-card');
  if (!card) return;
  window.clipboardAPI.pasteClip(card.dataset.id);
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    window.clipboardAPI.hideWindow();
  }
});

// ─── Load Data ─────────────────────────────────────────────────────────
async function loadClips() {
  try {
    clips = await window.clipboardAPI.getClips();
    render();
  } catch (err) {
    console.error('Failed to load clips:', err);
  }
}

// ─── Init ──────────────────────────────────────────────────────────────
window.clipboardAPI.onWindowShown(() => {
  loadClips();
});

loadClips();
