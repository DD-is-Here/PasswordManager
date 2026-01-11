// Content Script: Autofill, Auto-Save, and In-Page UI
const domain = window.location.hostname.replace('www.', '');

// 1. Inject Styles
const style = document.createElement('style');
style.textContent = `
  .chromapass-icon {
    position: absolute;
    width: 22px;
    height: 22px;
    cursor: pointer;
    z-index: 2147483646;
    opacity: 0.6;
    transition: all 0.2s ease;
    filter: drop-shadow(0 2px 4px rgba(0,0,0,0.3));
    pointer-events: auto;
  }
  .chromapass-icon:hover { opacity: 1; transform: scale(1.1); }
  
  .chromapass-dropdown {
    position: absolute;
    background: #18181b;
    border: 1px solid #27272a;
    border-radius: 12px;
    padding: 6px;
    z-index: 2147483647;
    box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.4);
    min-width: 200px;
    color: white;
    font-family: 'Outfit', 'Segoe UI', sans-serif;
    font-size: 14px;
    animation: cpFadeIn 0.2s ease-out;
  }
  @keyframes cpFadeIn { from { opacity: 0; transform: translateY(-5px); } to { opacity: 1; transform: translateY(0); } }

  .chromapass-item {
    padding: 10px 12px;
    cursor: pointer;
    border-radius: 8px;
    display: flex;
    flex-direction: column;
    transition: background 0.2s;
  }
  .chromapass-item:hover { background: #27272a; }
  .chromapass-username { font-weight: 500; color: #fff; }
  .chromapass-locked { color: #a1a1aa; font-size: 12px; padding: 12px; text-align: center; }

  /* Save Prompt Modal */
  .chromaps-modal-overlay {
    position: fixed; top: 0; left: 0; width: 100%; height: 100%;
    background: rgba(0,0,0,0.4); z-index: 2147483647;
    display: flex; justify-content: flex-end; align-items: flex-start;
    padding: 20px; pointer-events: none;
  }
  .chromaps-modal {
    pointer-events: auto;
    background: #09090b; color: white; padding: 20px;
    border-radius: 16px; border: 1px solid #27272a;
    box-shadow: 0 20px 25px -5px rgba(0,0,0,0.5);
    width: 320px; font-family: 'Outfit', sans-serif;
    animation: cpSlideIn 0.3s cubic-bezier(0, 0, 0.2, 1);
  }
  @keyframes cpSlideIn { from { transform: translateX(30px); opacity: 0; } to { transform: translateX(0); opacity: 1; } }

  .chromaps-title { font-size: 18px; font-weight: 600; margin-bottom: 8px; color: #8b5cf6; display: flex; align-items: center; gap: 10px; }
  .chromaps-text { font-size: 14px; margin-bottom: 20px; color: #a1a1aa; line-height: 1.5; }
  .chromaps-buttons { display: flex; justify-content: flex-end; gap: 10px; }
  .chromaps-btn {
    padding: 8px 16px; border-radius: 8px; border: none; cursor: pointer; font-size: 14px; font-weight: 500; transition: all 0.2s;
  }
  .chromaps-save { background: #8b5cf6; color: white; }
  .chromaps-save:hover { opacity: 0.9; transform: translateY(-1px); }
  .chromaps-cancel { background: #27272a; color: #a1a1aa; }
  .chromaps-cancel:hover { background: #3f3f46; color: white; }
`;
document.head.appendChild(style);

// --- HELPER: Fill Logic ---
const fillForm = (userField, passField, username, password) => {
    if (userField) {
        userField.value = username;
        userField.dispatchEvent(new Event('input', { bubbles: true }));
        userField.dispatchEvent(new Event('change', { bubbles: true }));
    }
    if (passField) {
        passField.value = password;
        passField.dispatchEvent(new Event('input', { bubbles: true }));
        passField.dispatchEvent(new Event('change', { bubbles: true }));

        // Trigger blur/focus to satisfy some site validations
        passField.focus();
        setTimeout(() => passField.blur(), 50);
    }
};

// --- In-Page Autofill Suggestions ---
const attachInputListeners = (passwords) => {
    const passFields = document.querySelectorAll('input[type="password"]');

    passFields.forEach(passField => {
        if (passField.dataset.cpAttached) return;
        passField.dataset.cpAttached = "true";

        const icon = document.createElement('img');
        icon.src = chrome.runtime.getURL('icons/icon128.png');
        icon.className = 'chromapass-icon';
        document.body.appendChild(icon);

        const updateIconPos = () => {
            const rect = passField.getBoundingClientRect();
            if (rect.width === 0 || rect.height === 0 || getComputedStyle(passField).display === 'none') {
                icon.style.display = 'none';
                return;
            }
            icon.style.display = 'block';
            icon.style.top = (rect.top + window.scrollY + (rect.height / 2) - 11) + 'px';
            icon.style.left = (rect.right + window.scrollX - 28) + 'px';
        };

        updateIconPos();
        window.addEventListener('scroll', updateIconPos, { passive: true });
        window.addEventListener('resize', updateIconPos, { passive: true });

        // Re-check position when field is focused or clicked (handles dynamic layouts)
        passField.addEventListener('focus', updateIconPos);
        passField.addEventListener('click', updateIconPos);

        icon.addEventListener('click', async (e) => {
            e.preventDefault();
            e.stopPropagation();

            document.querySelectorAll('.chromapass-dropdown').forEach(d => d.remove());

            const dropdown = document.createElement('div');
            dropdown.className = 'chromapass-dropdown';
            const rect = icon.getBoundingClientRect();
            dropdown.style.top = (rect.bottom + window.scrollY + 8) + 'px';
            dropdown.style.left = (rect.left + window.scrollX - 170) + 'px';

            const state = await chrome.runtime.sendMessage({ type: 'CHECK_LOCK_STATE' });

            if (!state.unlocked) {
                dropdown.innerHTML = '<div class="chromapass-locked">Vault Locked.<br>Unlock via extension popup.</div>';
            } else if (passwords.length === 0) {
                dropdown.innerHTML = '<div class="chromapass-locked">No passwords saved for this site.</div>';
            } else {
                passwords.forEach(cred => {
                    const item = document.createElement('div');
                    item.className = 'chromapass-item';
                    item.innerHTML = `<span class="chromapass-username">${cred.username}</span>`;
                    item.onclick = () => {
                        let userField = null;
                        if (passField.form) {
                            const inputs = Array.from(passField.form.querySelectorAll('input'));
                            const idx = inputs.indexOf(passField);
                            for (let i = idx - 1; i >= 0; i--) {
                                const t = inputs[i].type;
                                if ((t === 'text' || t === 'email' || t === 'tel') && !inputs[i].hidden) {
                                    userField = inputs[i];
                                    break;
                                }
                            }
                        }

                        chrome.runtime.sendMessage({
                            type: 'DECRYPT_PASSWORD',
                            encryptedData: cred.password
                        }, (res) => {
                            if (res && res.success) {
                                fillForm(userField, passField, cred.username, res.password);
                            }
                        });
                        dropdown.remove();
                    };
                    dropdown.appendChild(item);
                });
            }
            document.body.appendChild(dropdown);

            const closer = (evt) => {
                if (!dropdown.contains(evt.target) && evt.target !== icon) {
                    dropdown.remove();
                    document.removeEventListener('click', closer);
                }
            };
            setTimeout(() => document.addEventListener('click', closer), 10);
        });
    });
};

// --- Auto-Save Detection ---
document.addEventListener('submit', (e) => {
    const form = e.target;
    const passField = form.querySelector('input[type="password"]');
    if (!passField || !passField.value) return;

    let userField = form.querySelector('input[type="text"], input[type="email"], input[type="tel"]');
    if (!userField) {
        const inputs = Array.from(form.querySelectorAll('input'));
        const idx = inputs.indexOf(passField);
        for (let i = idx - 1; i >= 0; i--) {
            if (inputs[i].type !== 'hidden' && inputs[i].value && inputs[i].type !== 'password') {
                userField = inputs[i];
                break;
            }
        }
    }

    const username = userField ? userField.value : '';
    const password = passField.value;

    if (password) {
        chrome.runtime.sendMessage({
            type: 'SAVE_CANDIDATE',
            payload: { site: domain, username, password }
        });
    }
}, true);


// --- STARTUP ---
chrome.runtime.sendMessage({ type: 'CHECK_PENDING_SAVE' }, (candidate) => {
    if (candidate && candidate.site === domain) {
        showSaveModal(candidate);
    }
});

chrome.runtime.sendMessage({ type: 'GET_CREDENTIALS', domain: domain }, (response) => {
    if (response && response.matches) {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => {
                attachInputListeners(response.matches);
                // Automatic Autofill logic
                if (response.success && response.password) {
                    const inputs = document.querySelectorAll('input');
                    const usernameField = [...inputs].find(i => i.type === 'email' || i.name.toLowerCase().includes('user'));
                    const passwordField = [...inputs].find(i => i.type === 'password');
                    if (passwordField) {
                        if (usernameField && !usernameField.value) usernameField.value = response.username;
                        if (!passwordField.value) passwordField.value = response.password;
                    }
                }
            });
        } else {
            attachInputListeners(response.matches);
            // Automatic Autofill logic
            if (response.success && response.password) {
                const inputs = document.querySelectorAll('input');
                const usernameField = [...inputs].find(i => i.type === 'email' || i.name.toLowerCase().includes('user'));
                const passwordField = [...inputs].find(i => i.type === 'password');
                if (passwordField) {
                    if (usernameField && !usernameField.value) usernameField.value = response.username;
                    if (!passwordField.value) passwordField.value = response.password;
                }
            }
        }
    }
});

const showSaveModal = (data) => {
    const overlay = document.createElement('div');
    overlay.className = 'chromaps-modal-overlay';
    overlay.innerHTML = `
        <div class="chromaps-modal">
            <div class="chromaps-title">
                <img src="${chrome.runtime.getURL('icons/icon128.png')}" style="width:24px;height:24px;">
                Save Password?
            </div>
            <div class="chromaps-text">
                Do you want to save the password for <b>${data.username || domain}</b> in ChromaPass?
            </div>
            <div class="chromaps-buttons">
                 <button class="chromaps-btn chromaps-cancel" id="cp-cancel">Ignore</button>
                 <button class="chromaps-btn chromaps-save" id="cp-save">Save Password</button>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);

    document.getElementById('cp-save').onclick = async () => {
        await chrome.runtime.sendMessage({ type: 'CONFIRM_SAVE', payload: data });
        overlay.remove();
    };
    document.getElementById('cp-cancel').onclick = () => {
        chrome.runtime.sendMessage({ type: 'CLEAR_CANDIDATE' });
        overlay.remove();
    };
};
