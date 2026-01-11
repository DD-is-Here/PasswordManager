// Background Script
// Handles secure credential management and master password session
importScripts('utils.js');

let vaultKey = null; // Key in memory (ephemeral)
let lockTimer = null;
const LOCK_TIMEOUT = 30000; // 30 seconds

const lockVault = async () => {
    vaultKey = null;
    await Utils.storage.sessionSet('vaultKeyJwk', null);
    await Utils.storage.set('locked', true);
    console.log("Vault auto-locked due to inactivity.");
};

const resetLockTimer = () => {
    if (lockTimer) clearTimeout(lockTimer);
    lockTimer = setTimeout(lockVault, LOCK_TIMEOUT);
};

let pendingSaveCandidate = null;

let asymPrivateKey = null;

const getAsymPrivateKey = async () => {
    if (asymPrivateKey) return asymPrivateKey;
    const jwk = await Utils.storage.sessionGet('asymPrivateKeyJwk');
    if (jwk) {
        asymPrivateKey = await crypto.subtle.importKey("jwk", jwk, { name: "RSA-OAEP", hash: "SHA-256" }, true, ["decrypt"]);
        return asymPrivateKey;
    }
    return null;
};

// --- Persistence Helper ---
const getVaultKey = async () => {
    if (vaultKey) {
        resetLockTimer();
        return vaultKey;
    }
    // Try to get from session storage (MV3)
    const jwk = await Utils.storage.sessionGet('vaultKeyJwk');
    if (jwk) {
        vaultKey = await Utils.crypto.importKey(jwk);
        resetLockTimer();
        return vaultKey;
    }
    return null;
};

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    // Standard async pattern
    const handleMessage = async () => {
        // 0. LOCK STATE & AUTH
        if (request.type === 'CHECK_LOCK_STATE') {
            const setup = await Utils.storage.get('masterPasswordHash');
            const unlocked = !!(await getVaultKey());
            return { setup: !!setup, unlocked };
        }

        if (request.type === 'SET_MASTER_PASSWORD') {
            const { password } = request;
            const salt = crypto.getRandomValues(new Uint8Array(16));
            const saltStr = btoa(String.fromCharCode(...salt));

            const hash = await Utils.crypto.hashPassword(password, salt);
            const key = await Utils.crypto.deriveKey(password, salt);
            const jwk = await Utils.crypto.exportKey(key);

            await Utils.storage.set('masterPasswordHash', hash);
            await Utils.storage.set('masterPasswordSalt', saltStr);
            await Utils.storage.sessionSet('vaultKeyJwk', jwk);
            await Utils.storage.set('locked', false);

            // Generate RSA keys for blind saving
            const asymKeys = await Utils.crypto.generateAsymKeys();
            const pubJwk = await crypto.subtle.exportKey("jwk", asymKeys.publicKey);
            const privJwk = await crypto.subtle.exportKey("jwk", asymKeys.privateKey);
            const privJwkStr = JSON.stringify(privJwk);

            // Encrypt private key JWK with master key (AES)
            const encryptedPrivKey = await Utils.crypto.encrypt(privJwkStr, key);

            await Utils.storage.set('asymPublicKeyJwk', pubJwk);
            await Utils.storage.set('asymPrivateKeyEncrypted', encryptedPrivKey);
            await Utils.storage.sessionSet('asymPrivateKeyJwk', privJwk);
            asymPrivateKey = asymKeys.privateKey;

            vaultKey = key;
            resetLockTimer();
            return { success: true };
        }

        if (request.type === 'UNLOCK_VAULT') {
            const { password } = request;
            const hashStored = await Utils.storage.get('masterPasswordHash');
            const saltStr = await Utils.storage.get('masterPasswordSalt');
            if (!hashStored || !saltStr) return { success: false, error: 'Not setup' };

            const salt = new Uint8Array(atob(saltStr).split('').map(c => c.charCodeAt(0)));
            const hash = await Utils.crypto.hashPassword(password, salt);

            if (hash === hashStored) {
                const key = await Utils.crypto.deriveKey(password, salt);
                const jwk = await Utils.crypto.exportKey(key);
                await Utils.storage.sessionSet('vaultKeyJwk', jwk);
                await Utils.storage.set('locked', false);

                // Decrypt and load RSA Private Key
                let encryptedPrivKey = await Utils.storage.get('asymPrivateKeyEncrypted');

                // MIGRATION: Generate keys for existing users if missing
                if (!encryptedPrivKey) {
                    const asymKeys = await Utils.crypto.generateAsymKeys();
                    const pubJwk = await crypto.subtle.exportKey("jwk", asymKeys.publicKey);
                    const privJwk = await crypto.subtle.exportKey("jwk", asymKeys.privateKey);
                    const privJwkStr = JSON.stringify(privJwk);
                    encryptedPrivKey = await Utils.crypto.encrypt(privJwkStr, key);

                    await Utils.storage.set('asymPublicKeyJwk', pubJwk);
                    await Utils.storage.set('asymPrivateKeyEncrypted', encryptedPrivKey);
                    await Utils.storage.sessionSet('asymPrivateKeyJwk', privJwk);
                    asymPrivateKey = asymKeys.privateKey;
                } else {
                    const privJwkStr = await Utils.crypto.decrypt(encryptedPrivKey, key);
                    if (privJwkStr) {
                        const privJwk = JSON.parse(privJwkStr);
                        asymPrivateKey = await crypto.subtle.importKey("jwk", privJwk, { name: "RSA-OAEP", hash: "SHA-256" }, true, ["decrypt"]);
                        await Utils.storage.sessionSet('asymPrivateKeyJwk', privJwk);
                    }
                }

                vaultKey = key;
                resetLockTimer();
                return { success: true };
            } else {
                return { success: false, error: 'Incorrect password' };
            }
        }

        if (request.type === 'LOCK_VAULT') {
            if (lockTimer) clearTimeout(lockTimer);
            vaultKey = null;
            asymPrivateKey = null;
            await Utils.storage.sessionSet('vaultKeyJwk', null);
            await Utils.storage.sessionSet('asymPrivateKeyJwk', null);
            await Utils.storage.set('locked', true);
            return { success: true };
        }

        if (request.type === 'CHANGE_MASTER_PASSWORD') {
            const { oldPassword, newPassword } = request;
            const hashStored = await Utils.storage.get('masterPasswordHash');
            const saltStr = await Utils.storage.get('masterPasswordSalt');

            const salt = new Uint8Array(atob(saltStr).split('').map(c => c.charCodeAt(0)));
            const hashOld = await Utils.crypto.hashPassword(oldPassword, salt);

            if (hashOld !== hashStored) return { success: false, error: 'Incorrect old password' };

            // Decrypt all existing passwords with OLD key, then encrypt with NEW key
            const oldKey = await Utils.crypto.deriveKey(oldPassword, salt);
            const passwords = await Utils.storage.get('passwords') || [];

            const newSalt = crypto.getRandomValues(new Uint8Array(16));
            const newSaltStr = btoa(String.fromCharCode(...newSalt));
            const newKey = await Utils.crypto.deriveKey(newPassword, newSalt);

            const updatedPasswords = [];
            for (const item of passwords) {
                const plain = await Utils.crypto.decrypt(item.password, oldKey);
                if (plain) {
                    const encrypted = await Utils.crypto.encrypt(plain, newKey);
                    updatedPasswords.push({ ...item, password: encrypted });
                } else {
                    // If decryption fails for one, we might have a problem. 
                    // But for now, just keep it as is or skip.
                    updatedPasswords.push(item);
                }
            }

            const newHash = await Utils.crypto.hashPassword(newPassword, newSalt);
            const jwk = await Utils.crypto.exportKey(newKey);

            await Utils.storage.set('passwords', updatedPasswords);
            await Utils.storage.set('masterPasswordHash', newHash);
            await Utils.storage.set('masterPasswordSalt', newSaltStr);
            await Utils.storage.sessionSet('vaultKeyJwk', jwk);
            vaultKey = newKey;

            return { success: true };
        }

        // 1. GET CREDENTIALS
        if (request.type === 'GET_CREDENTIALS') {
            const domain = request.domain;
            const passwords = await Utils.storage.get('passwords') || [];
            const matches = passwords.filter(p => p.site.toLowerCase().includes(domain.toLowerCase()));

            const response = { success: matches.length > 0, matches: matches };

            if (matches.length > 0) {
                const key = await getVaultKey();
                if (key) {
                    const match = matches[0];
                    const decrypted = await Utils.crypto.decrypt(match.password, key);
                    response.username = match.username;
                    response.password = decrypted;
                }
            }
            return response;
        }

        // 2. DECRYPT SINGLE PASSWORD
        if (request.type === 'DECRYPT_PASSWORD') {
            const data = request.encryptedData;
            if (typeof data === 'object' && data.type === 'rsa') {
                const privKey = await getAsymPrivateKey();
                if (!privKey) return { success: false, error: 'Locked' };
                const decrypted = await Utils.crypto.decryptAsym(data.payload, privKey);
                return { success: !!decrypted, password: decrypted };
            } else {
                const key = await getVaultKey();
                if (!key) return { success: false, error: 'Locked' };
                const encryptedString = typeof data === 'object' ? data.payload : data;
                const decrypted = await Utils.crypto.decrypt(encryptedString, key);
                return { success: !!decrypted, password: decrypted };
            }
        }

        // 3. SAVE CANDIDATE
        if (request.type === 'SAVE_CANDIDATE') {
            pendingSaveCandidate = request.payload;
            return { success: true };
        }

        // 4. CHECK PENDING
        if (request.type === 'CHECK_PENDING_SAVE') {
            return pendingSaveCandidate;
        }

        // 5. CONFIRM SAVE
        if (request.type === 'CONFIRM_SAVE') {
            const { site, username, password } = request.payload;
            const key = await getVaultKey();
            let encrypted;

            if (key) {
                // Save while UNLOCKED (AES)
                encrypted = { type: 'aes', payload: await Utils.crypto.encrypt(password, key) };
            } else {
                // Save while LOCKED (RSA Public Key)
                const pubJwk = await Utils.storage.get('asymPublicKeyJwk');
                if (!pubJwk) return { success: false, error: 'Vault not initialized' };
                const pubKey = await crypto.subtle.importKey("jwk", pubJwk, { name: "RSA-OAEP", hash: "SHA-256" }, true, ["encrypt"]);
                encrypted = { type: 'rsa', payload: await Utils.crypto.encryptAsym(password, pubKey) };
            }

            const newEntry = {
                id: Date.now().toString(),
                site: site,
                username: username,
                password: encrypted,
                created: Date.now()
            };

            let passwords = await Utils.storage.get('passwords') || [];

            // DUPLICATE CHECK & UPDATE
            const index = passwords.findIndex(p => p.site.toLowerCase() === site.toLowerCase() && p.username === username);
            if (index !== -1) {
                passwords[index] = { ...passwords[index], password: encrypted, updated: Date.now() };
            } else {
                passwords.push(newEntry);
            }

            await Utils.storage.set('passwords', passwords);
            pendingSaveCandidate = null;
            return { success: true };
        }

        // 6. CLEAR CANDIDATE
        if (request.type === 'CLEAR_CANDIDATE') {
            pendingSaveCandidate = null;
            return { success: true };
        }

        return { error: 'Unknown request type' };
    };

    handleMessage().then(sendResponse);
    return true; // Async
});
