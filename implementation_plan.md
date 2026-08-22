# Implementation Plan: Multi-File Workspace Support

Replace the hardcoded single-file limitation in collaborative rooms with full multi-file management, allowing users to create, switch between, edit, delete, and execute multiple files simultaneously in real-time.

## User Review Required

> [!IMPORTANT]
> - All room files will be stored in Firestore in the root collection `files/{fileId}` with field `roomId: roomId`.
> - Each file will have its own collaborative real-time synchronization buffer via Yjs (`doc.getText(file.id)`), allowing users in the same room to collaborate on the same file or work on different files concurrently.
> - Default behavior: When a new room is loaded or has no files, an initial file (`main.js` or `main.py`) will automatically be initialized.

---

## Proposed Changes

### Backend Components

#### [MODIFY] [backend/controllers/fileController.js](file:///c:/Mohan/CollabCode/backend/controllers/fileController.js)
- Convert commented CommonJS code into clean ES Modules (`import`/`export`).
- Implement Firestore CRUD operations:
  - `listFiles`: Query `rooms/{roomId}/files`. If empty, automatically create and return a default starting file (`main.py` / `main.js`).
  - `createFile`: Validate unique filenames within the room, set timestamp, create document in `rooms/{roomId}/files`, and return the file.
  - `updateFile`: Update filename, language, and/or content with updated timestamps.
  - `deleteFile`: Delete the specified file from `rooms/{roomId}/files`.

#### [MODIFY] [backend/routes/fileRoutes.js](file:///c:/Mohan/CollabCode/backend/routes/fileRoutes.js)
- Uncomment and convert to ES Modules:
  - `GET /api/files?roomId=...` $\rightarrow$ `listFiles`
  - `POST /api/files` $\rightarrow$ `createFile`
  - `PUT /api/files/:id` $\rightarrow$ `updateFile`
  - `DELETE /api/files/:id?roomId=...` $\rightarrow$ `deleteFile`

#### [MODIFY] [backend/routes/index.js](file:///c:/Mohan/CollabCode/backend/routes/index.js)
- Uncomment `import fileRoutes from './fileRoutes.js';` and mount `router.use('/files', fileRoutes);`.

---

### Frontend Components

#### [MODIFY] [frontend/src/services/filesApi.js](file:///c:/Mohan/CollabCode/frontend/src/services/filesApi.js)
- Uncomment and export API client functions:
  - `fetchFiles(roomId)`
  - `createFile({ roomId, filename, language, content })`
  - `updateFile(id, roomId, payload)`
  - `deleteFile(id, roomId)`

#### [MODIFY] [frontend/src/pages/EditorWorkspace.jsx](file:///c:/Mohan/CollabCode/frontend/src/pages/EditorWorkspace.jsx)
- Remove hardcoded `ACTIVE_FILENAME = 'main.js'`.
- Add file management state:
  - `files`: list of room files fetched from Firestore (`filesApi.fetchFiles`).
  - `activeFile`: currently selected file object.
  - `isCreatingFile`, `newFileName`, `newFileLanguage`: state for modal/inline file creation.
- Update Yjs & Monaco binding:
  - Switch Monaco model & Yjs Text buffer dynamically when `activeFile` changes.
  - Bind Monaco language according to `activeFile.language` or file extension.
- Update Left Sidebar UI:
  - Display a clean **Files Explorer** section listing all files in the room with language icons, active file indicator, and delete buttons.
  - Add **+ New File** button that opens a creation dialog with filename input and language picker.
- Update Execution Engine (`handleRun`):
  - Run the code of the currently active file using its specific language runner.

---

## Verification Plan

### Automated & API Verification
1. Test backend files API endpoints via a node script:
   - Create a new file in a room (`POST /api/files`).
   - List files for the room (`GET /api/files?roomId=...`).
   - Update file properties (`PUT /api/files/:id`).
   - Delete a file (`DELETE /api/files/:id?roomId=...`).
2. Build frontend (`npm run build`) to ensure zero syntax/bundle errors.

### Manual Verification
- Open room in browser $\rightarrow$ Verify files list renders in sidebar.
- Click "+ New File" $\rightarrow$ Create `utils.js` or `script.py` $\rightarrow$ Verify it appears in the list and can be switched to.
- Edit `utils.js`, switch back to `main.js`, switch back to `utils.js` $\rightarrow$ Verify content persists in both files.
- Run code in the active file $\rightarrow$ Verify output panel executes active file content.
