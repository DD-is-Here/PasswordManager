document.addEventListener('DOMContentLoaded', async () => {
    // State
    let passwords = [];
    let isLocked = true;
    let isSetup = false;

    // Elements
    const views = {
        list: document.getElementById('view-list'),
        form: document.getElementById('view-form'),
        generator: document.getElementById('view-generator'),
        auth: document.getElementById('view-auth'),
        settings: document.getElementById('view-settings')
    };

    const headerActions = document.querySelector('.actions');
    const container = document.getElementById('password-list-container');
    const searchInput = document.getElementById('search-input');
    const form = document.getElementById('password-form');

    // Auth Elements
    const authForm = document.getElementById('auth-form');
    const authPassword = document.getElementById('auth-password');
    const authTitle = document.getElementById('auth-title');
    const authDesc = document.getElementById('auth-desc');
    const authSubmit = document.getElementById('auth-submit');

    // Navigation
    const switchView = (viewName) => {
        Object.values(views).forEach(el => el.classList.add('hidden'));
        views[viewName].classList.remove('hidden');

        // Hide header actions selectively
        if (viewName === 'auth') {
            // Only show 'Add' and 'Settings' (for setup) if needed, or just let them be
            // Let's keep Add visible so user can save while locked
            document.getElementById('nav-gen').classList.add('hidden');
            document.getElementById('btn-lock').classList.add('hidden');
            headerActions.classList.remove('hidden');
        } else {
            document.getElementById('nav-gen').classList.remove('hidden');
            document.getElementById('btn-lock').classList.remove('hidden');
            headerActions.classList.remove('hidden');
        }
    };

    // --- AUTH LOGIC ---
    const checkState = async () => {
        const isLocked = await Utils.storage.get('locked');
        const setup = await Utils.storage.get('masterPasswordHash');
        isSetup = !!setup;

        if (isLocked !== false) {
            if (!isSetup) {
                authTitle.innerText = "Setup ChromaPass";
                authDesc.innerText = "Create a master password to encrypt your vault.";
                authSubmit.innerText = "Create Vault";
            } else {
                authTitle.innerText = "Vault Locked";
                authDesc.innerText = "Enter your master password to unlock.";
                authSubmit.innerText = "Unlock Vault";
            }
            switchView('auth');
            return; // ⛔ STOP here
        }

        passwords = (await Utils.storage.get('passwords')) || [];
        renderList();
        switchView('list');
    };

    window.addEventListener('beforeunload', async () => {
        await chrome.runtime.sendMessage({ type: 'LOCK_VAULT' });
    });

    authForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const password = authPassword.value;
        // The provided snippet for 'cp-save' is syntactically incorrect and out of context here.
        // Assuming the intent was to add a save mechanism that might be triggered while locked,
        // but the snippet itself cannot be directly inserted as provided without causing syntax errors.
        // If 'cp-save' is a button that appears in an overlay when locked, its handler should be
        // defined when that overlay is created or shown, not within the authForm submit handler.
        // For now, I will proceed with the original logic of the authForm submit handler.
        // If you intended to add a specific 'cp-save' functionality here, please provide a syntactically
        // correct and contextually appropriate code block.

        if (!password) return;

        if (!isSetup) {
            await chrome.runtime.sendMessage({ type: 'SET_MASTER_PASSWORD', password });
        } else {
            const res = await chrome.runtime.sendMessage({ type: 'UNLOCK_VAULT', password });
            if (!res.success) {
                alert("Incorrect Password");
                return;
            }
        }
        authPassword.value = '';
        checkState();
    });

    document.getElementById('btn-lock').addEventListener('click', async () => {
        await chrome.runtime.sendMessage({ type: 'LOCK_VAULT' });
        checkState();
    });

    // --- NAVIGATION ---
    document.getElementById('nav-add').addEventListener('click', () => {
        form.reset();
        document.getElementById('entry-id').value = '';
        document.getElementById('form-title').innerText = 'Add Password';
        switchView('form');
    });

    document.getElementById('nav-gen').addEventListener('click', () => {
        generateAndShow();
        switchView('generator');
    });

    document.getElementById('nav-settings').addEventListener('click', () => {
        switchView('settings');
    });

    document.getElementById('btn-back').addEventListener('click', () => switchView('list'));
    document.getElementById('btn-back-gen').addEventListener('click', () => switchView('list'));
    document.getElementById('btn-back-settings').addEventListener('click', () => switchView('list'));

    // --- RENDER LIST ---
    const renderList = async (filterText = '') => {
        container.innerHTML = '';

        const filtered = passwords.filter(p =>
            p.site.toLowerCase().includes(filterText.toLowerCase()) ||
            p.username.toLowerCase().includes(filterText.toLowerCase())
        );

        if (filtered.length === 0) {
            container.innerHTML = '<div style="text-align:center; color: #888; margin-top:2rem;">No passwords found.</div>';
            return;
        }

        for (const p of filtered) {
            const el = document.createElement('div');
            el.className = 'password-item';

            el.innerHTML = `
                <div class="site-info">
                    <h3>${p.site}</h3>
                    <p>${p.username}</p>
                </div>
                <div class="item-actions">
                    <button class="btn-icon-small action-view" title="View Password">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
                    </button>
                    <button class="btn-icon-small action-copy" title="Copy Password">
                       <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                    </button>
                    <button class="btn-icon-small action-edit" title="Edit">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                    </button>
                    <button class="btn-icon-small action-delete" title="Delete" style="color:#ef4444;">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                    </button>
                </div>
                <div class="password-display hidden" id="pwd-${p.id}">
                    <code>••••••••</code>
                </div>
            `;

            // Handlers
            el.querySelector('.action-view').addEventListener('click', async () => {
                const res = await chrome.runtime.sendMessage({ type: 'DECRYPT_PASSWORD', encryptedData: p.password });
                const display = el.querySelector(`#pwd-${p.id}`);
                const btn = el.querySelector('.action-view');

                if (res.success) {
                    if (display.classList.contains('hidden')) {
                        display.querySelector('code').innerText = res.password;
                        display.classList.remove('hidden');
                        btn.style.color = 'var(--primary)';
                    } else {
                        display.classList.add('hidden');
                        btn.style.color = '';
                    }
                } else {
                    alert("Failed to decrypt. Vault might be locked.");
                }
            });

            el.querySelector('.action-edit').addEventListener('click', async () => {
                const res = await chrome.runtime.sendMessage({ type: 'DECRYPT_PASSWORD', encryptedData: p.password });
                if (res.success) {
                    document.getElementById('entry-id').value = p.id;
                    document.getElementById('site').value = p.site;
                    document.getElementById('username').value = p.username;
                    document.getElementById('password').value = res.password;
                    document.getElementById('form-title').innerText = 'Edit Password';
                    switchView('form');
                } else {
                    alert("Failed to decrypt. Vault might be locked.");
                }
            });

            el.querySelector('.action-delete').addEventListener('click', async () => {
                if (confirm('Delete ' + p.site + '?')) {
                    passwords = passwords.filter(item => item.id !== p.id);
                    await Utils.storage.set('passwords', passwords);
                    renderList(searchInput.value);
                }
            });

            container.appendChild(el);
        }
    };

    searchInput.addEventListener('input', (e) => renderList(e.target.value));

    // --- FORM HANDLING ---
    const pwdInput = document.getElementById('password');
    document.getElementById('toggle-password').addEventListener('click', () => {
        pwdInput.type = pwdInput.type === 'password' ? 'text' : 'password';
    });

    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        const id = document.getElementById('entry-id').value;
        const site = document.getElementById('site').value;
        const username = document.getElementById('username').value;
        const passwordPlain = document.getElementById('password').value;

        // Use background to encrypt so we have the key
        const res = await chrome.runtime.sendMessage({
            type: 'CONFIRM_SAVE',
            payload: { site, username, password: passwordPlain }
        });

        if (res.success) {
            // If it was an edit, we need to remove the old one first if background just appends
            if (id) {
                // Remove old
                passwords = (await Utils.storage.get('passwords')) || [];
                passwords = passwords.filter(p => p.id != id);
                await Utils.storage.set('passwords', passwords);
            }

            passwords = (await Utils.storage.get('passwords')) || [];
            renderList();
            switchView('list');
        } else {
            alert("Error saving password.");
        }
    });

    // --- CHANGE PASSWORD ---
    document.getElementById('change-pass-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const oldPassword = document.getElementById('old-master-pass').value;
        const newPassword = document.getElementById('new-master-pass').value;

        const res = await chrome.runtime.sendMessage({
            type: 'CHANGE_MASTER_PASSWORD',
            oldPassword,
            newPassword
        });

        if (res.success) {
            alert("Master password changed successfully!");
            document.getElementById('change-pass-form').reset();
            switchView('list');
        } else {
            alert("Error: " + res.error);
        }
    });

    // --- GENERATOR ---
    const generateAndShow = () => {
        const length = parseInt(document.getElementById('len-slider').value);
        document.getElementById('len-val').innerText = length;

        const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()_+";
        let res = "";
        for (let i = 0; i < length; i++) res += chars.charAt(Math.floor(Math.random() * chars.length));

        document.getElementById('gen-result').innerText = res;
    }

    document.getElementById('len-slider').addEventListener('input', generateAndShow);
    document.getElementById('btn-regen').addEventListener('click', generateAndShow);

    document.getElementById('btn-copy-gen').addEventListener('click', () => {
        const res = document.getElementById('gen-result').innerText;
        navigator.clipboard.writeText(res);
        const btn = document.getElementById('btn-copy-gen');
        btn.innerText = "Copied!";
        setTimeout(() => btn.innerText = "Copy", 1000);
    });

    // Initial Start
    checkState();
});
