# 🔐 ChromaPass Manager

ChromaPass is a **native, zero-dependency** Chrome Extension designed for high-security password management with a premium user experience. Built using modern browser-native cryptography, it provides a seamless and secure way to manage your digital life without relying on third-party servers.

---

## ✨ Key Features

- **🛡️ Hybrid Encryption System**: Combines **AES-GCM (256-bit)** for high-speed vault storage and **RSA-OAEP (2048-bit)** for secure "blind saving" while the vault is locked.
- **🚀 Advanced Autofill**: Automatically detects login fields and fills credentials as soon as a match is found on recognized domains.
- **🙈 Blind Saving**: Save new passwords or update existing ones even when the extension is in a locked state—fully encrypted with your unique public key.
- **⌛ Smart Auto-Lock**: Inactivity timer (30s) automatically wipes sensitive session keys from memory, ensuring your vault stays protected even if you leave your browser open.
- **⚡ Zero Dependency**: Built entirely with Vanilla JS, HTML, and CSS. No `node_modules`, no npm, just pure, fast, browser-native performance.
- **🎨 Premium Dark UI**: A sleek "Midnight Emerald" aesthetic featuring glassmorphism effects, smooth animations, and an intuitive user interface.
- **⚙️ Integrated Password Generator**: Securely create complex, high-entropy passwords with customizable length directly within the extension.

---

## 🔒 Security Architecture

ChromaPass takes security seriously by implementing a multi-layered cryptographic approach:

1.  **Master Password Derivation**: Uses **PBKDF2** with 100,000 iterations and a unique salt to derive your primary encryption key.
2.  **Vault Encryption**: All saved credentials are encrypted using **AES-GCM 256-bit** encryption.
3.  **Hybrid "Blind Save" Mechanism**: 
    - Upon setup, ChromaPass generates an RSA-OAEP key pair.
    - The **Public Key** remains available even while locked, allowing the extension to encrypt newly captured passwords "blindly."
    - The **Private Key** is only accessible when you provide your Master Password, ensuring only you can decrypt and view the saved data.
4.  **No Cloud Leakage**: Your data never leaves your browser. All encryption and storage happen locally on your machine via `chrome.storage.local`.

---

## 🚀 Installation

Since ChromaPass is currently in developer preview, follow these steps to install it manually:

1.  **Clone or Download**: Download the project folder to your local machine.
2.  **Open Extensions Page**: Open Google Chrome and navigate to `chrome://extensions`.
3.  **Enable Developer Mode**: Toggle the **Developer Mode** switch in the top-right corner.
4.  **Load Unpacked**: Click the **Load unpacked** button and select the root directory (`divyansh password manager`).
5.  **Pin for Easy Access**: Pin ChromaPass to your toolbar for quick access to your vault and generator.

---

## 📖 Usage

### Initial Setup
The first time you open ChromaPass, you will be prompted to create a **Master Password**. This password is the *only* key to your data. There is no password recovery—keep it safe!

### Saving Passwords
- **Automatic**: When you submit a login form on any website, ChromaPass will prompt you to save the credentials. You can confirm save even if the extension is locked.
- **Manual**: Use the `+` icon in the extension popup to manually add a new site, username, and password.

### Accessing & Managing
- **Unlock**: Enter your Master Password to reveal your saved list.
- **View/Copy**: Click the "Eye" icon to reveal a password or the "Copy" icon to send it to your clipboard.
- **Edit/Delete**: Quickly update or remove entries using the action icons.

---

## 🛠️ Technology Stack

- **Core**: JavaScript (ES6+), HTML5, CSS3
- **Crypto**: Web Crypto API (SubtleCrypto)
- **Storage**: Chrome Storage API (Local & Session)
- **Styling**: Vanilla CSS with CSS Variables and Google Fonts (Outfit)

---

## 🗺️ Roadmap
- [ ] Multi-device synchronization via encrypted export/import.
- [ ] Folder-based organization for credentials.
- [ ] More robust "Password Strength" analyzer.
- [ ] Internationalization (i18n) support.

---

*Developed with ❤️ by Divyansh*
