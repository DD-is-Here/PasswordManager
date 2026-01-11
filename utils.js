// Utility functions for Storage and Crypto
// Using PBKDF2 for key derivation from Master Password

const Utils = {
    // Basic wrapper for Chrome Storage
    storage: {
        get: (key) => new Promise((resolve) => {
            chrome.storage.local.get([key], (result) => resolve(result[key]));
        }),
        set: (key, value) => new Promise((resolve) => {
            chrome.storage.local.set({ [key]: value }, resolve);
        }),
        sessionGet: (key) => new Promise((resolve) => {
            if (!chrome.storage.session) return resolve(null);
            chrome.storage.session.get([key], (result) => resolve(result[key]));
        }),
        sessionSet: (key, value) => new Promise((resolve) => {
            if (!chrome.storage.session) return resolve();
            chrome.storage.session.set({ [key]: value }, resolve);
        })
    },

    crypto: {
        // Derive a key from a password and salt using PBKDF2
        deriveKey: async (password, salt) => {
            const encoder = new TextEncoder();
            const passwordKey = await crypto.subtle.importKey(
                "raw",
                encoder.encode(password),
                "PBKDF2",
                false,
                ["deriveBits", "deriveKey"]
            );

            return await crypto.subtle.deriveKey(
                {
                    name: "PBKDF2",
                    salt: salt,
                    iterations: 100000,
                    hash: "SHA-256"
                },
                passwordKey,
                { name: "AES-GCM", length: 256 },
                true,
                ["encrypt", "decrypt"]
            );
        },

        // Hash a password with a salt for verification
        hashPassword: async (password, salt) => {
            const encoder = new TextEncoder();
            const data = encoder.encode(password);
            const saltedData = new Uint8Array(data.length + salt.length);
            saltedData.set(data);
            saltedData.set(salt, data.length);

            const hashBuffer = await crypto.subtle.digest("SHA-256", saltedData);
            return btoa(String.fromCharCode(...new Uint8Array(hashBuffer)));
        },

        encrypt: async (text, key) => {
            const iv = crypto.getRandomValues(new Uint8Array(12));
            const encodedText = new TextEncoder().encode(text);

            const encrypted = await crypto.subtle.encrypt(
                { name: "AES-GCM", iv: iv },
                key,
                encodedText
            );

            const ivStr = btoa(String.fromCharCode(...iv));
            const dataStr = btoa(String.fromCharCode(...new Uint8Array(encrypted)));
            return `${ivStr}:${dataStr}`;
        },

        decrypt: async (encryptedPackage, key) => {
            try {
                const [ivStr, dataStr] = encryptedPackage.split(':');
                const iv = new Uint8Array(atob(ivStr).split('').map(c => c.charCodeAt(0)));
                const data = new Uint8Array(atob(dataStr).split('').map(c => c.charCodeAt(0)));

                const decrypted = await crypto.subtle.decrypt(
                    { name: "AES-GCM", iv: iv },
                    key,
                    data
                );

                return new TextDecoder().decode(decrypted);
            } catch (e) {
                console.error("Decryption failed", e);
                return null;
            }
        },

        // Helper to export/import key to/from JWK for background session storage
        exportKey: async (key) => {
            return await crypto.subtle.exportKey("jwk", key);
        },
        importKey: async (jwk) => {
            return await crypto.subtle.importKey(
                "jwk",
                jwk,
                { name: "AES-GCM" },
                true,
                ["encrypt", "decrypt"]
            );
        },

        // --- ASYMMETRIC (For blind saving) ---
        generateAsymKeys: async () => {
            return await crypto.subtle.generateKey(
                {
                    name: "RSA-OAEP",
                    modulusLength: 2048,
                    publicExponent: new Uint8Array([1, 0, 1]),
                    hash: "SHA-256",
                },
                true,
                ["encrypt", "decrypt"]
            );
        },

        encryptAsym: async (text, publicKey) => {
            const encoded = new TextEncoder().encode(text);
            const encrypted = await crypto.subtle.encrypt(
                { name: "RSA-OAEP" },
                publicKey,
                encoded
            );
            return btoa(String.fromCharCode(...new Uint8Array(encrypted)));
        },

        decryptAsym: async (encryptedBase64, privateKey) => {
            try {
                const data = new Uint8Array(atob(encryptedBase64).split('').map(c => c.charCodeAt(0)));
                const decrypted = await crypto.subtle.decrypt(
                    { name: "RSA-OAEP" },
                    privateKey,
                    data
                );
                return new TextDecoder().decode(decrypted);
            } catch (e) {
                console.error("Asymmetric decryption failed", e);
                return null;
            }
        }
    }
};
