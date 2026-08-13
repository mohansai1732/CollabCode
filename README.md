# 🚀 CollabCode

**CollabCode** is a high-performance, real-time collaborative code editor designed for teams to code together seamlessly from anywhere in the world. Built with a focus on interview integrity and low-latency synchronization.

## ⚙️ Working Mechanism

CollabCode uses a combination of **CRDTs** and **WebSockets** to ensure seamless synchronization across different environments.

### Data Flow
1. **The Editor (Monaco):** Captures user input and triggers events.
2. **The Brain (Yjs):** Converts edits into conflict-free operations (CRDTs).
3. **The Transport (y-websocket):** Broadcasts these operations to all connected peers via a Node.js backend.
4. **The Merge:** Every client receives the operation and merges it locally, ensuring the document state is identical for everyone.

## 👥 The Team
*   **Vinay Kumar** ([@Vinay50029](https://github.com/Vinay50029))
*   **Mohan Sai** ([@mohansai1732](https://github.com/mohansai1732))
*   **Ashish** ([@Ashish-altf6](https://github.com/Ashish-altf6))

## ✨ Key Features
*   **Real-Time Collaboration:** Multiple users can edit the same file simultaneously with zero latency.
*   **Conflict-Free Editing:** Powered by CRDTs (Conflict-free Replicated Data Types) to ensure code consistency.
*   **Presence Indicators:** Live cursor tracking and online user list.
*   **Syntax Highlighting:** Professional-grade highlighting for multiple programming languages.

## 🛡️ Interview Integrity (Anti-Cheating)
Designed for technical recruitment, CollabCode includes features to ensure authentic coding:
*   **Code Playback:** Replay sessions to observe the developer's step-by-step thought process.
*   **Tab Tracking:** Notifies the interviewer if the candidate switches to other windows or tabs.
*   **Paste Detection:** Identifies and flags large, instant code injections to prevent copy-pasting.

## 🛠️ Technology Stack
*   **Frontend:** React.js (Vite), Monaco Editor
*   **Backend:** Node.js, Express
*   **Real-Time:** WebSockets (`y-websocket`)
*   **State Sync:** Yjs (CRDT implementation)
*   **Styling:** Tailwind CSS / Modern CSS


phase 1