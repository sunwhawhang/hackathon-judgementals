// Upload-only page functionality

interface ProjectFile {
    name: string;
    content?: string;
    type: string;
    size: number;
    path: string;
    storageUrl?: string;
    storagePath?: string;
}

interface Project {
    name: string;
    files: ProjectFile[];
    droppedSummary?: string[];
}

interface SavedSession {
    id: string;
    name: string;
    projects: Project[];
    judges: any[];
    evaluations: any[];
    createdAt: number;
    updatedAt: number;
    expiresAt: number;
    // Share upload URL state
    shareUploadUrlGenerated?: boolean;
    shareUploadSectionExpanded?: boolean;
}

class UploadManager {
    private sessionId: string | null = null;
    private targetSessionId: string | null = null;
    private readonly API_BASE_URL: string;

    constructor() {
        this.API_BASE_URL = this.getApiBaseUrl();

        console.log('🔧 Upload page initialized');
        console.log(`🌐 Using API base URL: ${this.API_BASE_URL}`);

        // Wait for Firebase to be ready, then initialize
        this.waitForFirebaseAndInitialize();
    }

    private getApiBaseUrl(): string {
        if ((window as any).HACKJUDGE_API_URL) {
            return (window as any).HACKJUDGE_API_URL;
        }

        const isDev = window.location.hostname === 'localhost' ||
            window.location.hostname === '127.0.0.1' ||
            window.location.hostname.endsWith('.localhost');

        if (isDev) {
            const projectId = (window as any).HACKJUDGE_PROJECT_ID || 'hackathon-judgementals';
            const functionsPort = (window as any).HACKJUDGE_FUNCTIONS_PORT || '5001';
            return `http://${window.location.hostname}:${functionsPort}/${projectId}/us-central1`;
        } else {
            return '';
        }
    }

    private async waitForFirebaseAndInitialize(): Promise<void> {
        let attempts = 0;
        const maxAttempts = 50;

        while (attempts < maxAttempts) {
            if ((window as any).firebaseFirestore && (window as any).firebaseGetDoc) {
                console.log('🔥 Firebase initialized, checking session...');
                await this.initializeSession();
                return;
            }

            await new Promise(resolve => setTimeout(resolve, 100));
            attempts++;
        }

        console.warn('⚠️ Firebase failed to initialize');
        this.showError('Failed to initialize. Please refresh the page and try again.');
    }

    private async initializeSession(): Promise<void> {
        const urlParams = new URLSearchParams(window.location.search);
        const sessionId = urlParams.get('session');

        if (!sessionId) {
            this.showError('No session ID provided. This upload link may be invalid.');
            return;
        }

        this.targetSessionId = sessionId;

        try {
            // Verify the session exists
            const sessionDoc = await this.getFirestoreDoc('sessions', sessionId);

            if (!sessionDoc) {
                this.showError('Session not found. This upload link may have expired or been deleted.');
                return;
            }

            // Check if session has expired
            if (Date.now() > sessionDoc.expiresAt) {
                this.showError('This upload session has expired (maximum 7 days). Please contact the organizer for a new link.');
                return;
            }

            // Session is valid, show upload interface
            this.showUploadInterface(sessionDoc.name);
            console.log('✅ Session validated, upload interface ready');

        } catch (error) {
            console.error('❌ Error validating session:', error);
            this.showError('Error connecting to the session. Please try again later.');
        }
    }

    private async getFirestoreDoc(collection: string, docId: string): Promise<any> {
        try {
            const db = (window as any).firebaseFirestore;
            const docRef = (window as any).firebaseDoc(db, collection, docId);
            const docSnap = await (window as any).firebaseGetDoc(docRef);

            if (docSnap.exists()) {
                return docSnap.data();
            }
            return null;
        } catch (error) {
            console.error('Error getting document:', error);
            throw error;
        }
    }

    private showUploadInterface(sessionName: string): void {
        // Hide connection status
        const connectionStatus = document.getElementById('connectionStatus');
        if (connectionStatus) connectionStatus.style.display = 'none';

        // Update session info
        const sessionInfo = document.getElementById('sessionInfo');
        if (sessionInfo) {
            sessionInfo.textContent = `Upload your project to: ${sessionName}`;
        }

        // Show upload guidelines and section
        const guidelines = document.getElementById('uploadGuidelines');
        const uploadSection = document.getElementById('uploadSection');

        if (guidelines) guidelines.style.display = 'block';
        if (uploadSection) uploadSection.style.display = 'block';

        // Initialize file input listeners
        this.initializeFileInputListeners();
    }

    private showError(message: string): void {
        const connectionStatus = document.getElementById('connectionStatus');
        const errorMessage = document.getElementById('errorMessage');
        const errorText = document.getElementById('errorText');

        if (connectionStatus) connectionStatus.style.display = 'none';
        if (errorText) errorText.textContent = message;
        if (errorMessage) errorMessage.style.display = 'block';
    }

    private showSuccess(): void {
        const uploadSection = document.getElementById('uploadSection');
        const successMessage = document.getElementById('successMessage');
        const errorMessage = document.getElementById('errorMessage');
        const backToMainLink = document.getElementById('backToMainLink') as HTMLAnchorElement;

        if (uploadSection) uploadSection.style.display = 'none';
        if (errorMessage) errorMessage.style.display = 'none';
        if (successMessage) successMessage.style.display = 'block';

        // Set the back link to include the session ID
        if (backToMainLink && this.targetSessionId) {
            const mainUrl = new URL(window.location.origin);
            mainUrl.searchParams.set('session', this.targetSessionId);
            backToMainLink.href = mainUrl.toString();
        }
    }

    private initializeFileInputListeners(): void {
        // Add event listeners for file inputs
        const folderUpload = document.getElementById('folderUpload') as HTMLInputElement;
        const zipUpload = document.getElementById('zipUpload') as HTMLInputElement;

        if (folderUpload) {
            folderUpload.addEventListener('change', (event) => {
                const target = event.target as HTMLInputElement;
                if (target.files && target.files.length > 0) {
                    this.handleFolderUpload(target.files);
                }
            });
        }

        if (zipUpload) {
            zipUpload.addEventListener('change', (event) => {
                const target = event.target as HTMLInputElement;
                if (target.files && target.files.length > 0) {
                    this.handleZipUpload(target.files[0]);
                }
            });
        }
    }

    async handleFolderUpload(files: FileList): Promise<void> {
        try {
            const projectNameElement = document.getElementById('projectName') as HTMLInputElement;
            const projectName = projectNameElement.value.trim();
            if (!projectName) {
                alert('Please enter a project name first');
                return;
            }

            // Show processing progress
            this.showUploadStatus(`Processing ${files.length.toLocaleString()} files...`, false, true);

            // Filter valid files and track EXACTLY what was filtered with detailed lists
            const validFiles: File[] = [];
            const droppedFolders: Set<string> = new Set();
            const droppedFiles: string[] = [];
            const oversizedFiles: Array<{ name: string; size: number }> = [];
            const filesByDirectory: Record<string, string[]> = {};
            let totalFiles = 0;
            let filteredCount = 0;

            for (let i = 0; i < files.length; i++) {
                const file = files[i];
                const filePath = (file as any).webkitRelativePath || file.name;
                totalFiles++;

                // Update progress periodically for large uploads
                if (i % 1000 === 0 && i > 0) {
                    this.showUploadStatus(`Processing file ${i.toLocaleString()} of ${files.length.toLocaleString()}...`, false, true);
                    // Allow UI to update
                    await new Promise(resolve => setTimeout(resolve, 1));
                }

                // Track files by directory for organization
                const dir = filePath.substring(0, filePath.lastIndexOf('/')) || '.';
                if (!filesByDirectory[dir]) {
                    filesByDirectory[dir] = [];
                }
                filesByDirectory[dir].push(file.name);

                // Check if should be filtered by type/path
                if (this.shouldFilterFile(filePath)) {
                    // Track which folders/files were dropped
                    const pathParts = filePath.split('/');
                    let foundDroppedFolder = false;

                    // Check if this file is in a dropped folder (like node_modules)
                    for (let j = 0; j < pathParts.length - 1; j++) {
                        const partialPath = pathParts.slice(0, j + 1).join('/');
                        if (this.shouldFilterFile(partialPath + '/')) {
                            droppedFolders.add(partialPath);
                            foundDroppedFolder = true;
                            break;
                        }
                    }

                    // If not in a dropped folder, it's an individual dropped file
                    if (!foundDroppedFolder) {
                        droppedFiles.push(filePath);
                    }

                    filteredCount++;
                    continue;
                }

                // Check file size
                if (file.size > 10 * 1024 * 1024) { // 10MB limit
                    oversizedFiles.push({ name: filePath, size: file.size });
                    filteredCount++;
                    continue;
                }

                // Check file limit
                if (validFiles.length >= 500) {
                    droppedFiles.push(filePath + ' (file limit reached)');
                    filteredCount++;
                    continue;
                }

                validFiles.push(file);
            }

            // Create detailed dropped summary with actual folder/file lists
            const droppedSummary: string[] = [];
            if (filteredCount > 0) {
                droppedSummary.push(`📊 Processing Summary: ${filteredCount} files excluded from ${totalFiles} total files`);

                // Find common prefix for ALL paths first
                let commonPrefix = '';
                const allPaths = [...Array.from(droppedFolders), ...Object.keys(droppedFiles.length > 0 ? (() => {
                    const filesByDir: Record<string, string[]> = {};
                    droppedFiles.forEach(file => {
                        const dir = file.substring(0, file.lastIndexOf('/')) || '.';
                        if (!filesByDir[dir]) filesByDir[dir] = [];
                    });
                    return filesByDir;
                })() : {})];

                if (allPaths.length > 1) {
                    commonPrefix = allPaths[0];
                    for (const path of allPaths) {
                        while (commonPrefix && !path.startsWith(commonPrefix)) {
                            commonPrefix = commonPrefix.substring(0, commonPrefix.lastIndexOf('/'));
                        }
                    }
                    if (commonPrefix) commonPrefix += '/';
                }

                // Show dropped folders
                if (droppedFolders.size > 0) {
                    droppedSummary.push(`📁 Excluded folders:`);
                    const folders = Array.from(droppedFolders).sort();
                    folders.forEach(folder => {
                        const cleanFolder = commonPrefix ? folder.replace(commonPrefix, '') : folder;
                        const displayFolder = cleanFolder || folder;
                        droppedSummary.push(`    ${displayFolder}`);
                    });
                }

                // Show dropped files with directory grouping and clean formatting
                if (droppedFiles.length > 0) {
                    const filesByDir: Record<string, string[]> = {};

                    droppedFiles.forEach(file => {
                        const dir = file.substring(0, file.lastIndexOf('/')) || '.';
                        const fileName = file.substring(file.lastIndexOf('/') + 1);
                        if (!filesByDir[dir]) filesByDir[dir] = [];
                        filesByDir[dir].push(fileName);
                    });

                    droppedSummary.push(`📄 Excluded files:`);
                    Object.keys(filesByDir).sort().forEach(dir => {
                        const files = filesByDir[dir];
                        const cleanDir = commonPrefix ? dir.replace(commonPrefix, '') : dir;
                        const displayDir = cleanDir || '.';

                        droppedSummary.push(`    ${displayDir}:`);
                        files.forEach(file => {
                            droppedSummary.push(`        ${file}`);
                        });
                    });
                }

                // Show oversized files  
                if (oversizedFiles.length > 0) {
                    droppedSummary.push(`📏 Oversized files:`);
                    oversizedFiles.forEach(f => {
                        const cleanName = commonPrefix ? f.name.replace(commonPrefix, '') : f.name;
                        const displayName = cleanName || f.name;
                        droppedSummary.push(`    ${displayName} (${(f.size / 1024 / 1024).toFixed(1)}MB)`);
                    });
                }
            }

            console.log(`📊 Filtered to ${validFiles.length} files for upload`);

            // Upload files to Firebase Storage with progress (same as app.ts)
            const uploadedFiles = await this.uploadFilesToFirebaseStorageWithProgress(validFiles, projectName);

            this.showUploadStatus('💾 Adding project to session...', false, true);

            // Then save to Firestore and add to target session with dropped summary
            await this.saveProjectToFirestore(projectName, uploadedFiles, droppedSummary.length > 0 ? droppedSummary : undefined);

            this.showSuccess();
            console.log('✅ Project uploaded successfully');

        } catch (error) {
            console.error('❌ Folder upload failed:', error);
            let errorMessage = 'Folder upload failed';

            if (error instanceof Error) {
                if (error.message.includes('unauthorized') || error.message.includes('permission')) {
                    errorMessage = 'Upload permission denied. Please try again or contact the organizer.';
                } else if (error.message.includes('storage/')) {
                    errorMessage = 'Storage error occurred. Please try again.';
                } else {
                    errorMessage = `Upload failed: ${error.message}`;
                }
            }

            this.showError(errorMessage);
        }
    }

    async handleZipUpload(file: File): Promise<void> {
        try {
            this.showUploadStatus('Processing ZIP upload...', false, true);

            const projectNameElement = document.getElementById('projectName') as HTMLInputElement;
            const projectName = projectNameElement.value.trim();
            if (!projectName) {
                alert('Please enter a project name first');
                return;
            }

            // For ZIP files, we'll upload to storage first, then process
            const storage = (window as any).firebaseStorage;
            const storageRef = (window as any).firebaseRef(storage, `temp-uploads/${Date.now()}-${file.name}`);

            await (window as any).firebaseUploadBytes(storageRef, file);
            const downloadURL = await (window as any).firebaseGetDownloadURL(storageRef);

            // Call the API to process the ZIP from storage
            const response = await fetch(`${this.API_BASE_URL}/api/upload`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    uploadType: 'zip',
                    projectName: projectName,
                    zipPath: storageRef.fullPath,
                    fileName: file.name,
                    targetSessionId: this.targetSessionId
                })
            });

            const result = await response.json();

            if (result.success) {
                this.showSuccess();
                console.log('✅ Project uploaded successfully');
            } else {
                throw new Error(result.error || 'Upload failed');
            }

        } catch (error) {
            console.error('❌ ZIP upload failed:', error);
            let errorMessage = 'ZIP upload failed';

            if (error instanceof Error) {
                if (error.message.includes('unauthorized') || error.message.includes('permission')) {
                    errorMessage = 'Upload permission denied. Please refresh the page and try again.';
                } else if (error.message.includes('storage/')) {
                    errorMessage = 'Storage error occurred. Please try again.';
                } else {
                    errorMessage = `Upload failed: ${error.message}`;
                }
            }

            this.showError(errorMessage);
        }
    }

    async handleGitHubUpload(githubUrl: string): Promise<void> {
        try {
            this.showUploadStatus('Cloning GitHub repository...', false, true);

            const projectNameElement = document.getElementById('projectName') as HTMLInputElement;
            const projectName = projectNameElement.value.trim();
            if (!projectName) {
                alert('Please enter a project name first');
                return;
            }

            const response = await fetch(`${this.API_BASE_URL}/api/upload`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    uploadType: 'github',
                    projectName: projectName,
                    githubUrl: githubUrl,
                    targetSessionId: this.targetSessionId
                })
            });

            const result = await response.json();

            if (result.success) {
                this.showSuccess();
                console.log('✅ Project uploaded successfully');
            } else {
                throw new Error(result.error || 'Upload failed');
            }

        } catch (error) {
            console.error('❌ GitHub upload failed:', error);
            let errorMessage = 'GitHub upload failed';

            if (error instanceof Error) {
                if (error.message.includes('unauthorized') || error.message.includes('permission')) {
                    errorMessage = 'Upload permission denied. Please contact the organizer.';
                } else if (error.message.includes('GitHub')) {
                    errorMessage = `GitHub error: ${error.message}`;
                } else {
                    errorMessage = `Upload failed: ${error.message}`;
                }
            }

            this.showError(errorMessage);
        }
    }

    showUploadStatus(message: string, isError: boolean = false, showSpinner: boolean = false): void {
        const statusElement = document.getElementById('uploadStatus');
        if (statusElement) {
            statusElement.style.display = 'block';
            statusElement.style.color = isError ? '#ff6b6b' : '#a8a8a8';
            statusElement.innerHTML = showSpinner ?
                `<div class="spinner" style="width: 16px; height: 16px; display: inline-block; margin-right: 8px;"></div>${message}` :
                message;
        }
    }

    private async uploadFilesToFirebaseStorage(files: File[], projectName: string): Promise<ProjectFile[]> {
        const storage = (window as any).firebaseStorage;
        const uploadedFiles: ProjectFile[] = [];

        for (const file of files) {
            const fileName = (file as any).webkitRelativePath || file.name;
            const storageRef = (window as any).firebaseRef(storage, `projects/${projectName}/${fileName}`);

            await (window as any).firebaseUploadBytes(storageRef, file);
            const downloadURL = await (window as any).firebaseGetDownloadURL(storageRef);

            uploadedFiles.push({
                name: fileName,
                type: file.type || 'application/octet-stream',
                size: file.size,
                path: fileName,
                storageUrl: downloadURL,
                storagePath: storageRef.fullPath
            });
        }

        return uploadedFiles;
    }

    private async uploadFilesToFirebaseStorageWithProgress(files: File[], projectName: string): Promise<ProjectFile[]> {
        const storage = (window as any).firebaseStorage;
        const uploadedFiles: ProjectFile[] = [];
        const totalFiles = files.length;

        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            const fileName = (file as any).webkitRelativePath || file.name;
            const storageRef = (window as any).firebaseRef(storage, `projects/${projectName}/${fileName}`);

            // Show progress
            this.showUploadStatus(`📤 Uploading ${i + 1}/${totalFiles}: ${fileName}`, false, true);

            await (window as any).firebaseUploadBytes(storageRef, file);
            const downloadURL = await (window as any).firebaseGetDownloadURL(storageRef);

            uploadedFiles.push({
                name: fileName,
                type: file.type || 'application/octet-stream',
                size: file.size,
                path: fileName,
                storageUrl: downloadURL,
                storagePath: storageRef.fullPath
            });

            console.log(`✅ Uploaded ${i + 1}/${totalFiles}: ${fileName}`);
        }

        this.showUploadStatus(`✅ All ${totalFiles} files uploaded successfully`, false, false);

        return uploadedFiles;
    }

    private async saveProjectToFirestore(projectName: string, files: ProjectFile[], droppedSummary?: string[]): Promise<void> {
        const project: Project = {
            name: projectName,
            files: files,
            droppedSummary: droppedSummary
        };

        // Add project to target session
        if (this.targetSessionId) {
            await this.addProjectToSession(this.targetSessionId, project);
        }
    }

    private shouldFilterFile(filePath: string): boolean {
        const lowerPath = filePath.toLowerCase();

        // Filter out common directories that should be ignored
        const ignoredDirs = [
            'node_modules', '.git', '.next', 'dist', 'build', 'target', 'bin', 'obj',
            '__pycache__', '.venv', 'venv', 'env', '.env', 'coverage', '.nyc_output',
            'vendor', 'bower_components', '.gradle', '.mvn', 'out', 'lib', 'libs',
            'packages', 'deps', 'dependencies', 'tmp', 'temp', 'cache', '.cache',
            '.svn', '.hg', '.bzr', '.idea', '.vscode', '.vs', '.pytest_cache',
            '.coverage', 'htmlcov', '.sass-cache', '.nuxt', '.output', 'logs'
        ];

        // Check if path contains any ignored directory
        for (const dir of ignoredDirs) {
            if (lowerPath.includes(`/${dir}/`) || lowerPath.startsWith(`${dir}/`) || lowerPath.endsWith(`/${dir}`)) {
                return true;
            }
        }

        // Filter out hidden files and directories (starting with .)
        const pathParts = filePath.split('/');
        for (const part of pathParts) {
            if (part.startsWith('.') && part !== '.' && part !== '..') {
                // Allow some important dotfiles
                const allowedDotFiles = ['.env.example', '.gitignore', '.gitattributes', '.editorconfig', '.babelrc', '.eslintrc', '.prettierrc'];
                if (!allowedDotFiles.some(allowed => part === allowed || part.startsWith(allowed.split('.')[1]))) {
                    return true;
                }
            }
        }

        // Filter out binary file extensions
        const ignoredExtensions = [
            '.zip', '.tar', '.gz', '.rar', '.7z', '.exe', '.dll', '.so', '.dylib',
            '.class', '.jar', '.war', '.ear', '.deb', '.rpm', '.dmg', '.iso',
            '.mp4', '.avi', '.mov', '.wmv', '.mp3', '.wav', '.flac', '.aac',
            '.min.js', '.min.css', '.bundle.js', '.chunk.js', '.woff', '.woff2',
            '.ttf', '.eot', '.map', '.lock',
            '.png', '.jpg', '.jpeg', '.gif', '.bmp', '.tiff', '.svg', '.webp',
            '.ico', '.cur', '.psd', '.ai', '.sketch', '.fig'
        ];

        const ext = filePath.toLowerCase().substring(filePath.lastIndexOf('.'));
        return ignoredExtensions.includes(ext);
    }

    private async addProjectToSession(sessionId: string, project: Project): Promise<void> {
        try {
            console.log(`📡 Adding project "${project.name}" to session: ${sessionId}`);

            const db = (window as any).firebaseFirestore;
            console.log(`🔥 Firestore instance:`, db);
            console.log(`🎯 Database app:`, db.app);

            const sessionRef = (window as any).firebaseDoc(db, 'sessions', sessionId);
            console.log(`📄 Session ref created:`, sessionRef.path);

            const sessionDoc = await (window as any).firebaseGetDoc(sessionRef);
            console.log(`📖 Session doc fetched, exists:`, sessionDoc.exists());

            if (!sessionDoc.exists()) {
                throw new Error(`Session ${sessionId} not found`);
            }

            const sessionData = sessionDoc.data() as SavedSession;
            if (!sessionData) {
                throw new Error(`Session ${sessionId} has no data`);
            }

            // Check if session has expired
            if (Date.now() > sessionData.expiresAt) {
                throw new Error(`Session ${sessionId} has expired`);
            }

            // Add the project to the session's projects array
            const currentProjects = sessionData.projects || [];
            currentProjects.push(project);

            // Debug the update operation step by step
            console.log(`📝 About to update session ${sessionId}`);
            console.log(`📊 Current projects count: ${currentProjects.length}`);
            console.log(`📄 Project being added:`, {
                name: project.name,
                fileCount: project.files.length,
                droppedSummaryLength: project.droppedSummary?.length || 0
            });
            console.log(`🔍 Session ref path:`, sessionRef.path);
            console.log(`🎯 Update data:`, {
                projects: currentProjects.map((p: any) => ({ name: p.name, fileCount: p.files?.length || 0 })),
                updatedAt: Date.now()
            });

            try {
                const updateResult = await (window as any).firebaseUpdateDoc(sessionRef, {
                    projects: currentProjects,
                    updatedAt: Date.now()
                });
                console.log(`✅ updateDoc completed, result:`, updateResult);
            } catch (updateError) {
                console.error(`❌ updateDoc failed:`, updateError);
                throw updateError;
            }

            console.log(`✅ Successfully added project to session ${sessionId}. Total projects: ${currentProjects.length}`);

            // Verify the write by reading it back IMMEDIATELY
            console.log(`🔍 Verifying write to session ${sessionId}...`);
            const verifyDoc = await (window as any).firebaseGetDoc(sessionRef);
            if (verifyDoc.exists()) {
                const verifyData = verifyDoc.data();
                console.log(`✅ Verification: Session now has ${verifyData.projects?.length || 0} projects`);
                console.log(`📊 All projects:`, verifyData.projects?.map((p: any) => p.name) || []);
                console.log(`🕐 Verification timestamp:`, new Date().toISOString());

                // Check if our specific project is there
                const ourProject = verifyData.projects?.find((p: any) => p.name === project.name);
                if (ourProject) {
                    console.log(`✅ Our project "${project.name}" found in verification!`);
                } else {
                    console.error(`❌ Our project "${project.name}" NOT found in verification!`);
                }
            } else {
                console.error(`❌ Verification failed: Session ${sessionId} not found after update`);
            }

            // Wait 2 seconds and check again
            setTimeout(async () => {
                console.log(`🔍 Delayed verification (2s later) for session ${sessionId}...`);
                const delayedDoc = await (window as any).firebaseGetDoc(sessionRef);
                if (delayedDoc.exists()) {
                    const delayedData = delayedDoc.data();
                    console.log(`🕐 Delayed verification: Session has ${delayedData.projects?.length || 0} projects`);
                    console.log(`📊 Delayed projects:`, delayedData.projects?.map((p: any) => p.name) || []);
                } else {
                    console.error(`❌ Delayed verification: Session ${sessionId} not found`);
                }
            }, 2000);

        } catch (error) {
            console.error(`❌ Error adding project to session ${sessionId}:`, error);
            throw error;
        }
    }
}

// Initialize the upload manager
let uploadManager: UploadManager;

// Global functions for HTML onclick handlers
function triggerFolderUpload(): void {
    const folderTab = document.getElementById('folderTab');
    const folderUpload = document.getElementById('folderUpload') as HTMLInputElement;

    if (folderTab && folderUpload) {
        resetUploadTabs();
        folderTab.classList.add('active');
        uploadManager.showUploadStatus('Opening folder picker...', false, true);
        folderTab.innerHTML = '⏳ Opening...';

        setTimeout(() => {
            folderUpload.click();
            folderTab.innerHTML = '📁 Upload Folder';
            uploadManager.showUploadStatus('Select files to upload', false, false);
        }, 100);
    }
}

function triggerZipUpload(): void {
    const zipTab = document.getElementById('zipTab');
    const zipUpload = document.getElementById('zipUpload') as HTMLInputElement;

    if (zipTab && zipUpload) {
        resetUploadTabs();
        zipTab.classList.add('active');
        uploadManager.showUploadStatus('Opening file picker...', false, true);
        zipTab.innerHTML = '⏳ Opening...';

        setTimeout(() => {
            zipUpload.click();
            zipTab.innerHTML = '📦 Upload ZIP File';
            uploadManager.showUploadStatus('Select ZIP file to upload', false, false);
        }, 100);
    }
}

function triggerGithubUpload(): void {
    const githubTab = document.getElementById('githubTab');
    const githubMethod = document.getElementById('githubUploadMethod');

    if (githubTab && githubMethod) {
        resetUploadTabs();
        githubTab.classList.add('active');
        githubMethod.style.display = 'block';
        uploadManager.showUploadStatus('Enter GitHub repository URL below', false, false);
    }
}

function resetUploadTabs(): void {
    const tabs = document.querySelectorAll('.tab-btn');
    tabs.forEach(tab => tab.classList.remove('active'));

    const githubMethod = document.getElementById('githubUploadMethod');
    if (githubMethod) githubMethod.style.display = 'none';

    const mainUploadBtn = document.getElementById('mainUploadBtn');
    if (mainUploadBtn) mainUploadBtn.style.display = 'none';

    const uploadStatus = document.getElementById('uploadStatus');
    if (uploadStatus) uploadStatus.style.display = 'none';
}

function uploadProject(): void {
    const projectNameElement = document.getElementById('projectName') as HTMLInputElement;
    const projectName = projectNameElement.value.trim();
    if (!projectName) {
        alert('Please enter a project name first');
        return;
    }

    // Check which upload method is active
    const githubMethod = document.getElementById('githubUploadMethod');
    if (githubMethod && githubMethod.style.display !== 'none') {
        const githubUrlElement = document.getElementById('githubUrl') as HTMLInputElement;
        const githubUrl = githubUrlElement.value.trim();
        if (!githubUrl) {
            alert('Please enter a GitHub URL');
            return;
        }
        uploadManager.handleGitHubUpload(githubUrl);
    }
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    console.log('🚀 Initializing upload page...');
    uploadManager = new UploadManager();
});

// Expose functions to global scope
(window as any).triggerFolderUpload = triggerFolderUpload;
(window as any).triggerZipUpload = triggerZipUpload;
(window as any).triggerGithubUpload = triggerGithubUpload;
(window as any).uploadProject = uploadProject;
(window as any).resetUploadTabs = resetUploadTabs;