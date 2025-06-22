"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
class HackathonJudge {
    constructor() {
        this.projects = [];
        this.judges = [];
        this.evaluations = [];
        this.CLAUDE_API_SEED = 12345; // Fixed seed for consistency
        this.initializeDefaultJudges();
        this.renderJudges();
    }
    initializeDefaultJudges() {
        this.judges = [
            {
                id: 'technical',
                name: '🔧 Technical Excellence Judge',
                description: 'Evaluates code quality, architecture, and technical implementation',
                prompt: `You are a technical judge evaluating hackathon projects. Focus on:
                - Code quality, structure, and best practices
                - Technical complexity and innovation
                - Architecture and design patterns
                - Performance considerations
                - Use of technologies and frameworks
                
                Provide a detailed analysis of what you like and don't like about the technical aspects, then give an absolute score from 1-10.`
            },
            {
                id: 'innovation',
                name: '💡 Innovation Judge',
                description: 'Focuses on creativity, originality, and problem-solving approach',
                prompt: `You are an innovation judge evaluating hackathon projects. Focus on:
                - Originality and creativity of the solution
                - Problem-solving approach and methodology
                - Uniqueness compared to existing solutions
                - Creative use of technology
                - Novel features or implementations
                
                Provide a detailed analysis of the innovative aspects, what's creative vs conventional, then give an absolute score from 1-10.`
            },
            {
                id: 'user-experience',
                name: '👤 User Experience Judge',
                description: 'Evaluates usability, design, and overall user interaction',
                prompt: `You are a UX judge evaluating hackathon projects. Focus on:
                - User interface design and aesthetics
                - Usability and user flow
                - Accessibility considerations
                - Documentation quality for users
                - Overall user experience and ease of use
                
                Provide a detailed analysis of the user experience aspects, both positive and negative, then give an absolute score from 1-10.`
            }
        ];
    }
    renderJudges() {
        const judgesGrid = document.getElementById('judgesGrid');
        if (!judgesGrid)
            return;
        judgesGrid.innerHTML = this.judges.map(judge => {
            const summary = this.generateJudgeSummary(judge.description);
            const judgeId = judge.id.replace(/'/g, "\\'");
            return `
                <div class="judge-card" style="position: relative;">
                    <button 
                        onclick="removeJudge('${judgeId}')" 
                        style="position: absolute; top: 8px; right: 8px; background: transparent; color: #cc8b5c; border: none; border-radius: 50%; width: 24px; height: 24px; cursor: pointer; font-size: 16px; font-weight: bold; display: flex; align-items: center; justify-content: center; transition: all 0.2s ease; z-index: 10;"
                        onmouseover="this.style.background='rgba(255,255,255,0.2)'; this.style.color='white'"
                        onmouseout="this.style.background='transparent'; this.style.color='#cc8b5c'"
                        title="Remove judge"
                    >
                        ×
                    </button>
                    <h3>${judge.name}</h3>
                    <p class="judge-summary">${summary}</p>
                    <details class="judge-details">
                        <summary style="cursor: pointer; color: #cc8b5c; font-size: 14px; margin-top: 8px;">
                            📋 View full description
                        </summary>
                        <div style="margin-top: 8px; padding: 12px; background: #2a2a2a; border-radius: 6px; font-size: 13px; line-height: 1.4; color: #d1d1d1;">
                            ${judge.description.replace(/\n/g, '<br>')}
                        </div>
                    </details>
                </div>
            `;
        }).join('');
    }
    generateJudgeSummary(description) {
        // Extract key focus areas from the description
        const lines = description.split('\n').filter(line => line.trim());
        const firstLine = lines[0] || description;
        // Look for key phrases that indicate focus areas
        const focusKeywords = [
            'technical', 'innovation', 'creativity', 'user experience', 'design',
            'implementation', 'scalability', 'performance', 'security', 'accessibility',
            'business', 'market', 'impact', 'feasibility', 'presentation', 'code quality',
            'architecture', 'testing', 'documentation', 'team collaboration'
        ];
        const lowerDesc = description.toLowerCase();
        const foundKeywords = focusKeywords.filter(keyword => lowerDesc.includes(keyword)).slice(0, 3);
        if (foundKeywords.length > 0) {
            const keywordText = foundKeywords.join(', ');
            const truncatedFirst = firstLine.length > 100 ?
                firstLine.substring(0, 100) + '...' : firstLine;
            return `Focuses on: ${keywordText}. ${truncatedFirst}`;
        }
        // Fallback: just truncate the first line
        return firstLine.length > 120 ?
            firstLine.substring(0, 120) + '...' : firstLine;
    }
    renderProjects() {
        const projectList = document.getElementById('projectList');
        if (!projectList)
            return;
        projectList.innerHTML = this.projects.map(project => {
            const projectId = project.name.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase();
            const droppedInfo = project.droppedSummary && project.droppedSummary.length > 0 ?
                `<div style="font-size: 12px; color: #a8a8a8; width: 100%; overflow: hidden;">
                    <div 
                        onclick="toggleDroppedFiles('${projectId}')" 
                        style="cursor: pointer; color: #cc8b5c; padding: 4px 0; user-select: none;"
                        id="dropped-toggle-${projectId}"
                    >
                        ▶️ View excluded files (${project.droppedSummary.length} categories)
                    </div>
                    <div 
                        id="dropped-content-${projectId}" 
                        style="display: none; margin-top: 4px; padding: 8px 12px; background: #1e1e1e; border-radius: 4px; border-left: 3px solid #cc8b5c; word-wrap: break-word; overflow-wrap: break-word; max-width: 100%;"
                    >
                        ${project.droppedSummary.map(item => `<div style="margin: 2px 0; word-wrap: break-word;">• ${item}</div>`).join('')}
                    </div>
                </div>` :
                `<div style="font-size: 11px; color: #666;">
                    ✅ No files were excluded during processing
                </div>`;
            return `
                <div class="project-item">
                    <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 8px;">
                        <div style="flex: 1; min-width: 0;">
                            <h4>${project.name}</h4>
                            <p>${project.files.length} files uploaded</p>
                        </div>
                        <button 
                            class="btn" 
                            style="font-size: 12px; padding: 6px 12px; margin-left: 12px; flex-shrink: 0;"
                            onclick="downloadProject('${project.name.replace(/'/g, "\\'")}')"
                        >
                            📥 Download
                        </button>
                    </div>
                    <div style="width: 100%; overflow: hidden;">
                        ${droppedInfo}
                    </div>
                </div>
            `;
        }).join('');
    }
    downloadProject(projectName) {
        return __awaiter(this, void 0, void 0, function* () {
            const project = this.projects.find(p => p.name === projectName);
            if (!project) {
                this.showError('Project not found');
                return;
            }
            try {
                console.log(`📥 Downloading project: ${projectName} (${project.files.length} files)`);
                const response = yield fetch('http://localhost:3001/api/download', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        projectName: project.name,
                        files: project.files
                    })
                });
                if (!response.ok) {
                    throw new Error(`Download failed: ${response.statusText}`);
                }
                // Create download link for ZIP file
                const blob = yield response.blob();
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `${projectName}-processed.zip`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                window.URL.revokeObjectURL(url);
                this.showSuccess(`✅ Downloaded: ${projectName}-processed.zip (${project.files.length} files)`);
            }
            catch (error) {
                console.error('❌ Download error:', error);
                this.showError(`Download failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
            }
        });
    }
    uploadProject() {
        return __awaiter(this, void 0, void 0, function* () {
            const nameInput = document.getElementById('projectName');
            const folderInput = document.getElementById('folderUpload');
            const zipInput = document.getElementById('zipUpload');
            const uploadSection = document.querySelector('.upload-section');
            if (!nameInput.value.trim()) {
                this.showError('Please enter a project name');
                return;
            }
            // Check which upload method is active
            const folderMethod = document.getElementById('folderUploadMethod');
            const isZipUpload = folderMethod.style.display === 'none';
            if (isZipUpload) {
                // ZIP upload
                if (!zipInput.files || zipInput.files.length === 0) {
                    this.showError('Please select a ZIP file');
                    return;
                }
                return this.uploadZipFile(nameInput, zipInput, uploadSection);
            }
            else {
                // Folder upload
                if (!folderInput.files || folderInput.files.length === 0) {
                    this.showError('Please select a project folder');
                    return;
                }
                return this.uploadFolderFiles(nameInput, folderInput, uploadSection);
            }
        });
    }
    uploadZipFile(nameInput, zipInput, uploadSection) {
        return __awaiter(this, void 0, void 0, function* () {
            const zipFile = zipInput.files[0];
            // Show upload progress for ZIP
            uploadSection.innerHTML = `
            <div class="loading">
                <div class="spinner"></div>
                <p><strong>Uploading ZIP file: ${zipFile.name}</strong></p>
                <p style="font-size: 14px; color: #a8a8a8;">Size: ${(zipFile.size / 1024 / 1024).toFixed(2)}MB</p>
                <p style="font-size: 12px; color: #666; margin-top: 8px;">
                    Server will extract and filter files automatically
                </p>
            </div>
        `;
            try {
                const formData = new FormData();
                formData.append('projectName', nameInput.value.trim());
                formData.append('zipFile', zipFile);
                formData.append('uploadType', 'zip');
                const response = yield fetch('http://localhost:3001/api/upload', {
                    method: 'POST',
                    body: formData
                });
                const result = yield response.json();
                if (!result.success) {
                    throw new Error(result.error || 'ZIP upload failed');
                }
                // Add project to local list
                this.projects.push({
                    name: result.projectName,
                    files: result.files,
                    droppedSummary: result.droppedSummary
                });
                this.showSuccess(`✅ ZIP uploaded successfully! ${result.files.length} files processed`);
                // Show warnings and dropped files summary
                if (result.warnings && result.warnings.length > 0) {
                    setTimeout(() => {
                        this.showWarning(result.warnings.join('\n'));
                    }, 1000);
                }
                if (result.droppedSummary && result.droppedSummary.length > 0) {
                    setTimeout(() => {
                        this.showWarning('Files excluded during processing:\n' + result.droppedSummary.join('\n'));
                    }, 2000);
                }
                // Clear inputs
                nameInput.value = '';
                zipInput.value = '';
                this.renderProjects();
            }
            catch (error) {
                console.error('❌ ZIP upload error:', error);
                this.showError(`ZIP upload failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
            }
            finally {
                this.restoreUploadForm(uploadSection);
            }
        });
    }
    uploadFolderFiles(nameInput, fileInput, uploadSection) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a;
            const fileCount = fileInput.files.length;
            const isLargeUpload = fileCount > 1000;
            // Show immediate feedback with file count
            uploadSection.innerHTML = `
            <div class="loading">
                <div class="spinner"></div>
                <p><strong>Preparing ${fileCount.toLocaleString()} files for upload...</strong></p>
                <p style="font-size: 14px; color: #a8a8a8;">Processing and filtering files...</p>
                ${isLargeUpload ? `
                    <div style="background: #3d2914; border: 1px solid #cc8b5c; border-radius: 8px; padding: 12px; margin-top: 12px;">
                        <strong style="color: #cc8b5c;">Large Project Detected (${fileCount.toLocaleString()} files)</strong>
                        <p style="font-size: 12px; color: #a8a8a8; margin: 4px 0 0 0;">
                            This may take a while. Files like node_modules, .git, and hidden folders will be filtered out.
                        </p>
                    </div>
                ` : ''}
                <p style="font-size: 12px; color: #666; margin-top: 8px;">
                    Note: Large projects may be truncated to fit Claude's limits
                </p>
            </div>
        `;
            // Add a timeout warning for very large uploads
            let timeoutWarning = null;
            if (isLargeUpload) {
                timeoutWarning = setTimeout(() => {
                    const loadingDiv = document.querySelector('.loading p:last-child');
                    if (loadingDiv) {
                        loadingDiv.innerHTML = `
                        <strong style="color: #cc8b5c;">Still processing... This is taking longer than expected.</strong><br>
                        <span style="font-size: 11px; color: #666;">
                            Large projects with many files (especially node_modules) can take several minutes.
                        </span>
                    `;
                    }
                }, 10000); // Show warning after 10 seconds
            }
            try {
                // Update progress as we build FormData
                const progressDiv = uploadSection.querySelector('.loading p:nth-child(3)');
                if (progressDiv) {
                    progressDiv.textContent = 'Building upload data...';
                }
                const formData = new FormData();
                formData.append('projectName', nameInput.value.trim());
                // Pre-filter files on client side to reduce upload size dramatically
                const filteredFiles = [];
                let filteredCount = 0;
                const droppedFolders = new Set();
                const droppedFiles = [];
                const oversizedFiles = [];
                for (let i = 0; i < fileInput.files.length; i++) {
                    const file = fileInput.files[i];
                    const filePath = file.webkitRelativePath || file.name;
                    // Update progress every 5000 files during filtering
                    if (i % 5000 === 0 && progressDiv) {
                        progressDiv.textContent = `Filtering files... ${i.toLocaleString()} / ${fileCount.toLocaleString()} processed`;
                        // Allow DOM to update
                        yield new Promise(resolve => setTimeout(resolve, 0));
                    }
                    // Client-side filtering to match server logic
                    if (this.shouldFilterFile(filePath)) {
                        filteredCount++;
                        // Track which folders/files are being dropped
                        const pathParts = filePath.split('/');
                        let foundFolder = false;
                        // Remove the project root prefix to get relative path
                        let relativePath = filePath;
                        if (pathParts.length > 1) {
                            // Skip the first part (project root) if it's a common project name
                            const firstPart = pathParts[0];
                            if (firstPart.length > 3 && !firstPart.startsWith('.')) {
                                relativePath = pathParts.slice(1).join('/');
                            }
                        }
                        for (const part of pathParts) {
                            if (part.startsWith('.') ||
                                ['node_modules', 'bower_components', 'vendor', 'packages', 'deps', 'dependencies',
                                    'dist', 'build', 'target', 'bin', 'obj', 'out', 'lib', 'libs', '.next',
                                    '__pycache__', '.venv', 'venv', 'env', '.env', '.pytest_cache',
                                    'coverage', '.nyc_output', '.coverage', 'htmlcov',
                                    '.gradle', '.mvn', '.idea', '.vscode', '.vs',
                                    'tmp', 'temp', 'cache', '.cache', '.tmp',
                                    'logs', '.sass-cache', '.nuxt', '.output'].includes(part.toLowerCase())) {
                                droppedFolders.add(part);
                                foundFolder = true;
                                break;
                            }
                        }
                        // If not a known folder, track as individual file with relative path
                        if (!foundFolder) {
                            droppedFiles.push(relativePath);
                        }
                        continue;
                    }
                    // Skip files larger than 1MB
                    if (file.size > 1024 * 1024) {
                        filteredCount++;
                        // Remove the project root prefix to get relative path
                        let relativePath = filePath;
                        const pathParts = filePath.split('/');
                        if (pathParts.length > 1) {
                            const firstPart = pathParts[0];
                            if (firstPart.length > 3 && !firstPart.startsWith('.')) {
                                relativePath = pathParts.slice(1).join('/');
                            }
                        }
                        oversizedFiles.push({ name: relativePath, size: file.size });
                        continue;
                    }
                    filteredFiles.push(file);
                    // Stop if we have enough files (server limit)
                    if (filteredFiles.length >= 1000) {
                        filteredCount += (fileInput.files.length - i - 1);
                        break;
                    }
                }
                console.log(`📊 Client-side filtering complete: ${filteredFiles.length} files to upload, ${filteredCount} filtered out`);
                // Group dropped files by their parent directories
                const filesByDirectory = new Map();
                for (const filePath of droppedFiles) {
                    const pathParts = filePath.split('/');
                    if (pathParts.length > 1) {
                        // Group by parent directory
                        const dirPath = pathParts.slice(0, -1).join('/');
                        const fileName = pathParts[pathParts.length - 1];
                        if (!filesByDirectory.has(dirPath)) {
                            filesByDirectory.set(dirPath, []);
                        }
                        filesByDirectory.get(dirPath).push(fileName);
                    }
                    else {
                        // Root level file
                        if (!filesByDirectory.has('')) {
                            filesByDirectory.set('', []);
                        }
                        filesByDirectory.get('').push(filePath);
                    }
                }
                // Track client-side filtering stats to send to server
                const clientFilterStats = {
                    totalFiles: fileCount,
                    filteredFiles: filteredFiles.length,
                    filteredCount: filteredCount,
                    filterRatio: ((filteredCount / fileCount) * 100).toFixed(1),
                    droppedFolders: Array.from(droppedFolders),
                    droppedFiles: droppedFiles,
                    filesByDirectory: Object.fromEntries(filesByDirectory),
                    oversizedFiles: oversizedFiles
                };
                if (progressDiv) {
                    progressDiv.innerHTML = `
                    <strong>Adding ${filteredFiles.length.toLocaleString()} filtered files to upload...</strong><br>
                    <span style="font-size: 12px; color: #a8a8a8;">
                        ${filteredCount.toLocaleString()} files filtered out (${((filteredCount / fileCount) * 100).toFixed(1)}% reduction)
                    </span>
                `;
                }
                // Add filtered files to form data with path information
                for (let i = 0; i < filteredFiles.length; i++) {
                    const file = filteredFiles[i];
                    const filePath = file.webkitRelativePath || file.name;
                    // Debug logging for path information
                    if (i < 5) { // Log first 5 files
                        console.log(`📁 File ${i}: name="${file.name}", webkitRelativePath="${file.webkitRelativePath}", finalPath="${filePath}"`);
                    }
                    // Create a new File object with the path as the name to preserve structure
                    const fileWithPath = new File([file], filePath, {
                        type: file.type,
                        lastModified: file.lastModified
                    });
                    formData.append('files', fileWithPath);
                    // Update progress every 100 files during form building
                    if (i % 100 === 0 && progressDiv) {
                        progressDiv.textContent = `Building upload: ${i.toLocaleString()} / ${filteredFiles.length.toLocaleString()} files added...`;
                        // Allow DOM to update
                        yield new Promise(resolve => setTimeout(resolve, 0));
                    }
                }
                // Update to show we're now uploading
                if (progressDiv) {
                    progressDiv.innerHTML = `
                    <strong>Uploading to server...</strong><br>
                    <span style="font-size: 12px; color: #a8a8a8;">
                        Server will filter and process files
                    </span>
                `;
                }
                // Add client-side filtering stats to the request
                formData.append('clientFilterStats', JSON.stringify(clientFilterStats));
                const response = yield fetch('http://localhost:3001/api/upload', {
                    method: 'POST',
                    body: formData
                });
                // Clear timeout warning
                if (timeoutWarning) {
                    clearTimeout(timeoutWarning);
                }
                const result = yield response.json();
                if (!result.success) {
                    throw new Error(result.error || 'Upload failed');
                }
                // Add project to local list
                this.projects.push({
                    name: result.projectName,
                    files: result.files,
                    droppedSummary: result.droppedSummary
                });
                let message = `✅ Uploaded ${result.files.length} files successfully!`;
                if (result.skippedFiles && result.skippedFiles > 0) {
                    message += ` (${result.skippedFiles} files skipped due to size limits)`;
                }
                this.showSuccess(message);
                // Show warnings if any
                if (result.warnings && result.warnings.length > 0) {
                    setTimeout(() => {
                        var _a;
                        (_a = result.warnings) === null || _a === void 0 ? void 0 : _a.forEach((warning) => {
                            this.showWarning(warning);
                        });
                    }, 1000);
                }
                // Show dropped files summary
                if (result.droppedSummary && result.droppedSummary.length > 0) {
                    setTimeout(() => {
                        this.showWarning('Files excluded during processing:\n' + result.droppedSummary.join('\n'));
                    }, 2000);
                }
                nameInput.value = '';
                fileInput.value = '';
                this.renderProjects();
            }
            catch (error) {
                console.error('❌ Upload error details:', error);
                console.error('❌ Error type:', typeof error);
                console.error('❌ Error constructor:', (_a = error === null || error === void 0 ? void 0 : error.constructor) === null || _a === void 0 ? void 0 : _a.name);
                // Clear timeout warning
                if (timeoutWarning) {
                    clearTimeout(timeoutWarning);
                }
                let errorMessage = 'Upload failed: ';
                if (error instanceof TypeError && error.message.includes('fetch')) {
                    errorMessage += 'Cannot connect to server. Make sure the server is running on localhost:3001';
                    console.error('❌ Server connection failed. Please check if server is running with: npm run serve');
                }
                else if (error instanceof Error) {
                    errorMessage += error.message;
                }
                else {
                    errorMessage += 'Unknown error occurred';
                }
                console.error('❌ Final error message:', errorMessage);
                this.showError(errorMessage);
            }
            finally {
                this.restoreUploadForm(uploadSection);
            }
        });
    }
    restoreUploadForm(uploadSection) {
        uploadSection.innerHTML = `
            <div>
                <input type="text" id="projectName" class="upload-input" placeholder="Project Name" />
                
                <!-- Upload Method Tabs -->
                <div style="margin: 16px 0;">
                    <div style="display: flex; gap: 8px; margin-bottom: 12px; justify-content: center;">
                        <button class="tab-btn active" onclick="switchUploadMethod('folder')" id="folderTab">
                            📁 Upload Folder
                        </button>
                        <button class="tab-btn" onclick="switchUploadMethod('zip')" id="zipTab">
                            📦 Upload ZIP File
                        </button>
                    </div>
                    
                    <!-- Folder Upload -->
                    <div id="folderUploadMethod" class="upload-method">
                        <input type="file" id="folderUpload" webkitdirectory directory multiple class="upload-input" />
                        <div style="font-size: 12px; color: #a8a8a8; margin-top: 4px;">
                            ⚠️ Large projects may be slow. Consider using ZIP upload instead.
                        </div>
                    </div>
                    
                    <!-- ZIP Upload -->
                    <div id="zipUploadMethod" class="upload-method" style="display: none;">
                        <input type="file" id="zipUpload" accept=".zip" class="upload-input" />
                        <div style="font-size: 12px; color: #a8a8a8; margin-top: 4px;">
                            ✅ Recommended for large projects. Much faster than folder upload.
                        </div>
                    </div>
                </div>
                
                <button class="btn" onclick="uploadProject()">Upload Project</button>
            </div>
        `;
    }
    showWarning(message) {
        const warningDiv = document.createElement('div');
        warningDiv.style.cssText = `
            position: fixed; top: 20px; right: 20px; z-index: 1000;
            background: #ff9f43; color: white; padding: 15px 20px;
            border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.3);
            max-width: 400px; word-wrap: break-word;
        `;
        warningDiv.textContent = message;
        document.body.appendChild(warningDiv);
        setTimeout(() => warningDiv.remove(), 7000);
    }
    showError(message) {
        const errorDiv = document.createElement('div');
        errorDiv.style.cssText = `
            position: fixed; top: 20px; right: 20px; z-index: 1000;
            background: #ff6b6b; color: white; padding: 15px 20px;
            border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.3);
            max-width: 400px; word-wrap: break-word;
        `;
        errorDiv.textContent = message;
        document.body.appendChild(errorDiv);
        setTimeout(() => errorDiv.remove(), 5000);
    }
    shouldFilterFile(filePath) {
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
    showSuccess(message) {
        const successDiv = document.createElement('div');
        successDiv.style.cssText = `
            position: fixed; top: 20px; right: 20px; z-index: 1000;
            background: #51cf66; color: white; padding: 15px 20px;
            border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.3);
            max-width: 400px; word-wrap: break-word;
        `;
        successDiv.textContent = message;
        document.body.appendChild(successDiv);
        setTimeout(() => successDiv.remove(), 3000);
    }
    addCustomJudge() {
        const nameInput = document.getElementById('judgeName');
        const promptInput = document.getElementById('judgePrompt');
        if (!nameInput.value.trim() || !promptInput.value.trim()) {
            this.showError('Please fill in both judge name and prompt');
            return;
        }
        // Use the prompt as the description for the custom judge
        const customJudge = {
            id: `custom-${Date.now()}`,
            name: nameInput.value.trim(),
            description: promptInput.value.trim(), // Use the full prompt as description
            prompt: promptInput.value.trim()
        };
        this.judges.push(customJudge);
        // Clear the form
        nameInput.value = '';
        promptInput.value = '';
        // Show success message
        this.showSuccess(`✅ Added custom judge: ${customJudge.name}`);
        // Re-render the judges list
        this.renderJudges();
    }
    removeJudge(judgeId) {
        // Safety check: don't allow removing all judges
        if (this.judges.length <= 1) {
            this.showError('Cannot remove the last judge. You need at least one judge for the competition.');
            return;
        }
        // Find the judge to remove
        const judgeToRemove = this.judges.find(judge => judge.id === judgeId);
        if (!judgeToRemove) {
            this.showError('Judge not found');
            return;
        }
        // Confirm removal for default judges
        const isDefaultJudge = ['technical', 'innovation', 'user-experience'].includes(judgeId);
        if (isDefaultJudge) {
            const confirmed = confirm(`Are you sure you want to remove the default "${judgeToRemove.name}" judge?`);
            if (!confirmed) {
                return;
            }
        }
        this.judges = this.judges.filter(judge => judge.id !== judgeId);
        this.showSuccess(`✅ Removed judge: ${judgeToRemove.name}`);
        this.renderJudges();
    }
    callClaudeAPI(prompt) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const response = yield fetch('http://localhost:3001/api/claude', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        prompt: prompt,
                        seed: this.CLAUDE_API_SEED
                    })
                });
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
                const data = yield response.json();
                if (!data.success) {
                    throw new Error(data.error || 'API call failed');
                }
                return data.response;
            }
            catch (error) {
                console.error('Error calling Claude API:', error);
                // Fallback to mock response if API fails
                const mockResponse = {
                    summary: "API call failed - using mock evaluation. The project shows reasonable implementation but detailed analysis is not available.",
                    score: Math.floor(Math.random() * 4) + 6,
                    likes: [
                        "Project structure appears organized",
                        "Files are properly named",
                        "Basic functionality implemented"
                    ],
                    dislikes: [
                        "Unable to perform detailed analysis",
                        "API connection failed",
                        "Limited evaluation available"
                    ]
                };
                return JSON.stringify(mockResponse);
            }
        });
    }
    formatProjectForJudge(project) {
        let formatted = `Project: ${project.name}\n\nFiles and Contents:\n\n`;
        const maxSize = 7 * 1024 * 1024; // 7MB limit for formatted content
        let currentSize = formatted.length;
        let truncatedFiles = 0;
        const sortedFiles = [...project.files].sort((a, b) => {
            // Prioritize important files (README, main files, config files)
            const getPriority = (filename) => {
                const name = filename.toLowerCase();
                if (name.includes('readme'))
                    return 1;
                if (name.includes('main') || name.includes('index'))
                    return 2;
                if (name.includes('config') || name.includes('package.json'))
                    return 3;
                if (name.endsWith('.md'))
                    return 4;
                if (name.endsWith('.py') || name.endsWith('.js') || name.endsWith('.ts'))
                    return 5;
                return 10;
            };
            return getPriority(a.name) - getPriority(b.name);
        });
        for (const file of sortedFiles) {
            let fileContent = `--- ${file.name} (${file.type}) ---\n`;
            if (file.type.startsWith('text/') ||
                file.type === 'application/json' ||
                file.name.endsWith('.js') ||
                file.name.endsWith('.ts') ||
                file.name.endsWith('.py') ||
                file.name.endsWith('.html') ||
                file.name.endsWith('.css') ||
                file.name.endsWith('.md')) {
                let content = file.content;
                // Truncate very large files
                if (content.length > 50000) {
                    content = content.substring(0, 50000) + '\n... [FILE TRUNCATED - TOO LARGE] ...\n';
                }
                fileContent += content + '\n\n';
            }
            else {
                fileContent += `[Binary file - ${file.type}, ${file.size} bytes]\n\n`;
            }
            // Check if adding this file would exceed the limit
            if (currentSize + fileContent.length > maxSize) {
                truncatedFiles = sortedFiles.length - sortedFiles.indexOf(file);
                break;
            }
            formatted += fileContent;
            currentSize += fileContent.length;
        }
        if (truncatedFiles > 0) {
            formatted += `\n... [${truncatedFiles} files not included due to size limits] ...\n`;
        }
        return formatted;
    }
    startJudging() {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                if (this.projects.length === 0) {
                    this.showError('Please upload at least one project');
                    return;
                }
                if (this.judges.length === 0) {
                    this.showError('No judges available');
                    return;
                }
                const startButton = document.getElementById('startJudging');
                const progressDiv = document.getElementById('judgingProgress');
                startButton.disabled = true;
                progressDiv === null || progressDiv === void 0 ? void 0 : progressDiv.classList.remove('hidden');
                this.evaluations = [];
                console.log(`🏁 Starting judging process for ${this.projects.length} projects with ${this.judges.length} judges`);
                // Process each project with comprehensive error handling
                for (const project of this.projects) {
                    try {
                        const projectEvaluation = {
                            projectName: project.name,
                            judgeResults: []
                        };
                        console.log(`📊 Evaluating project: ${project.name}`);
                        const projectData = this.formatProjectForJudge(project);
                        // Get evaluations from all judges in parallel
                        const judgePromises = this.judges.map((judge) => __awaiter(this, void 0, void 0, function* () {
                            const basePrompt = `${judge.prompt}\n\nProject to evaluate:\n`;
                            const endPrompt = `\n\nPlease provide your evaluation in the following JSON format:
                {
                    "summary": "Your detailed analysis and reasoning",
                    "score": <number from 1-10>,
                    "likes": ["positive aspect 1", "positive aspect 2", ...],
                    "dislikes": ["negative aspect 1", "negative aspect 2", ...]
                }`;
                            // Calculate available space for project data (8MB limit with safety margin)
                            const maxPromptSize = 7.5 * 1024 * 1024; // 7.5MB safety margin
                            const baseSize = basePrompt.length + endPrompt.length;
                            const availableSize = maxPromptSize - baseSize;
                            let truncatedProjectData = projectData;
                            if (projectData.length > availableSize) {
                                truncatedProjectData = projectData.substring(0, availableSize - 200) + '\n\n... [PROJECT DATA TRUNCATED DUE TO SIZE LIMITS] ...';
                                console.log(`⚠️  Truncating project data from ${(projectData.length / 1024 / 1024).toFixed(2)}MB to ${(truncatedProjectData.length / 1024 / 1024).toFixed(2)}MB for judge ${judge.name}`);
                            }
                            const fullPrompt = basePrompt + truncatedProjectData + endPrompt;
                            try {
                                const response = yield this.callClaudeAPI(fullPrompt);
                                const evaluation = JSON.parse(response);
                                // Validate evaluation structure and provide defaults
                                return {
                                    judgeId: judge.id,
                                    judgeName: judge.name,
                                    summary: evaluation.summary || 'No summary provided',
                                    score: (evaluation.score >= 1 && evaluation.score <= 10) ? evaluation.score : 5,
                                    likes: Array.isArray(evaluation.likes) ? evaluation.likes : ['Evaluation completed'],
                                    dislikes: Array.isArray(evaluation.dislikes) ? evaluation.dislikes : []
                                };
                            }
                            catch (error) {
                                console.error(`❌ Error evaluating project ${project.name} with judge ${judge.name}:`, error);
                                // Always provide a meaningful fallback evaluation
                                return {
                                    judgeId: judge.id,
                                    judgeName: judge.name,
                                    summary: `Unable to complete detailed evaluation for ${project.name}. System encountered an error but judging process continued.`,
                                    score: 5, // Neutral score when evaluation fails
                                    likes: [
                                        'Project was submitted for evaluation',
                                        'File structure appears organized',
                                        'Standard naming conventions observed'
                                    ],
                                    dislikes: [
                                        'Could not perform detailed analysis due to system error',
                                        'Limited technical assessment available',
                                        'Manual review recommended for complete evaluation'
                                    ]
                                };
                            }
                        }));
                        projectEvaluation.judgeResults = yield Promise.all(judgePromises);
                        this.evaluations.push(projectEvaluation);
                    }
                    catch (projectError) {
                        console.error(`❌ Error processing project ${project.name}:`, projectError);
                        // Add project with fallback evaluation
                        const fallbackEvaluation = {
                            projectName: project.name,
                            judgeResults: this.judges.map(judge => ({
                                judgeId: judge.id,
                                judgeName: judge.name,
                                summary: `Error processing project ${project.name}. Unable to complete evaluation.`,
                                score: 3, // Low score for failed evaluation
                                likes: ['Project was submitted'],
                                dislikes: ['Evaluation failed due to processing error', 'Technical issues prevented analysis']
                            }))
                        };
                        this.evaluations.push(fallbackEvaluation);
                    }
                }
                console.log(`🎯 Completed individual evaluations, starting master judge ranking`);
                // Get final ranking from master judge with error handling
                try {
                    yield this.getFinalRanking();
                }
                catch (masterError) {
                    console.error(`❌ Master judge failed, using fallback ranking:`, masterError);
                    // Fallback ranking already handled in getFinalRanking
                }
                console.log(`🏆 Judging process completed successfully`);
            }
            catch (error) {
                console.error(`❌ Critical error in judging process:`, error);
                // Ensure we have some evaluations even if everything fails
                if (this.evaluations.length === 0 && this.projects.length > 0) {
                    this.evaluations = this.projects.map((project, index) => ({
                        projectName: project.name,
                        finalRank: index + 1,
                        judgeResults: [{
                                judgeId: 'fallback',
                                judgeName: 'System Fallback',
                                summary: 'Critical system error prevented normal evaluation. This is a placeholder result.',
                                score: 5,
                                likes: ['Project was submitted for evaluation'],
                                dislikes: ['System error prevented detailed analysis']
                            }]
                    }));
                }
                this.showError('Judging completed with errors. Results may be limited.');
            }
            finally {
                // Always re-enable UI and show results
                const startButton = document.getElementById('startJudging');
                const progressDiv = document.getElementById('judgingProgress');
                if (startButton)
                    startButton.disabled = false;
                progressDiv === null || progressDiv === void 0 ? void 0 : progressDiv.classList.add('hidden');
                // Always display results, even if partial/fallback
                this.displayResults();
            }
        });
    }
    getFinalRanking() {
        return __awaiter(this, void 0, void 0, function* () {
            const basePrompt = `You are the master judge for a hackathon. Below are the evaluations from individual judges for each project. Your task is to provide a final relative ranking of all projects based on these evaluations.

        Project Evaluations:`;
            const endPrompt = `
        
        Please provide a final ranking in JSON format:
        {
            "rankings": [
                {"projectName": "Project Name", "rank": 1, "reasoning": "Why this project ranked here"},
                ...
            ]
        }`;
            const evaluationsText = this.evaluations.map(evaluation => `
        Project: ${evaluation.projectName}
        Judge Evaluations:
        ${evaluation.judgeResults.map(result => `
        - ${result.judgeName} (Score: ${result.score}/10)
          Summary: ${result.summary}
          Likes: ${result.likes.join(', ')}
          Dislikes: ${result.dislikes.join(', ')}
        `).join('\n')}
        `).join('\n\n');
            // Calculate available space and truncate if necessary
            const maxPromptSize = 7.5 * 1024 * 1024; // 7.5MB safety margin
            const baseSize = basePrompt.length + endPrompt.length;
            const availableSize = maxPromptSize - baseSize;
            let truncatedEvaluations = evaluationsText;
            if (evaluationsText.length > availableSize) {
                truncatedEvaluations = evaluationsText.substring(0, availableSize - 200) + '\n\n... [EVALUATIONS TRUNCATED DUE TO SIZE LIMITS] ...';
                console.log(`⚠️  Truncating master judge evaluations from ${(evaluationsText.length / 1024 / 1024).toFixed(2)}MB to ${(truncatedEvaluations.length / 1024 / 1024).toFixed(2)}MB`);
            }
            const masterPrompt = basePrompt + truncatedEvaluations + endPrompt;
            try {
                const response = yield this.callClaudeAPI(masterPrompt);
                const masterEvaluation = JSON.parse(response);
                // Validate master evaluation structure
                if (masterEvaluation.rankings && Array.isArray(masterEvaluation.rankings)) {
                    // Apply final rankings
                    masterEvaluation.rankings.forEach((ranking) => {
                        const evaluation = this.evaluations.find(evalItem => evalItem.projectName === ranking.projectName);
                        if (evaluation && typeof ranking.rank === 'number') {
                            evaluation.finalRank = ranking.rank;
                        }
                    });
                    // Sort evaluations by final rank
                    this.evaluations.sort((a, b) => (a.finalRank || 999) - (b.finalRank || 999));
                }
                else {
                    throw new Error('Invalid master evaluation response structure');
                }
            }
            catch (error) {
                console.error('❌ Error getting final ranking, using fallback ranking by average score:', error);
                // Robust fallback: rank by average score with proper error handling
                try {
                    this.evaluations.forEach((evaluation, index) => {
                        let avgScore = 5; // Default neutral score
                        if (evaluation.judgeResults && evaluation.judgeResults.length > 0) {
                            const validScores = evaluation.judgeResults
                                .map(result => result.score)
                                .filter(score => typeof score === 'number' && score >= 1 && score <= 10);
                            if (validScores.length > 0) {
                                avgScore = validScores.reduce((sum, score) => sum + score, 0) / validScores.length;
                            }
                        }
                        evaluation.finalRank = index + 1; // Will be re-sorted below
                    });
                    // Sort by average score (highest first)
                    this.evaluations.sort((a, b) => {
                        const getAvgScore = (evaluation) => {
                            if (!evaluation.judgeResults || evaluation.judgeResults.length === 0)
                                return 0;
                            const validScores = evaluation.judgeResults
                                .map(result => result.score)
                                .filter(score => typeof score === 'number' && score >= 1 && score <= 10);
                            return validScores.length > 0 ?
                                validScores.reduce((sum, score) => sum + score, 0) / validScores.length : 0;
                        };
                        return getAvgScore(b) - getAvgScore(a);
                    });
                    // Assign final ranks after sorting
                    this.evaluations.forEach((evaluation, index) => {
                        evaluation.finalRank = index + 1;
                    });
                }
                catch (fallbackError) {
                    console.error('❌ Even fallback ranking failed, using project order:', fallbackError);
                    // Final fallback: just number them in order
                    this.evaluations.forEach((evaluation, index) => {
                        evaluation.finalRank = index + 1;
                    });
                }
            }
        });
    }
    displayResults() {
        try {
            const resultsSection = document.getElementById('resultsSection');
            const finalRankings = document.getElementById('finalRankings');
            if (!resultsSection || !finalRankings) {
                console.error('❌ Results display elements not found');
                return;
            }
            if (this.evaluations.length === 0) {
                finalRankings.innerHTML = '<p>No evaluation results to display.</p>';
                resultsSection.classList.remove('hidden');
                return;
            }
            resultsSection.classList.remove('hidden');
            finalRankings.innerHTML = this.evaluations.map(evaluation => {
                try {
                    // Calculate average score with error handling
                    let avgScore = 0;
                    if (evaluation.judgeResults && evaluation.judgeResults.length > 0) {
                        const validScores = evaluation.judgeResults
                            .map(result => typeof result.score === 'number' ? result.score : 0)
                            .filter(score => score > 0);
                        avgScore = validScores.length > 0 ?
                            validScores.reduce((sum, score) => sum + score, 0) / validScores.length : 0;
                    }
                    const sanitizedProjectName = evaluation.projectName.replace(/['"]/g, '');
                    return `
                        <div class="result-item">
                            <div class="result-header" onclick="toggleResult('${sanitizedProjectName}')">
                                <div>
                                    <span class="rank-badge">#${evaluation.finalRank || '?'}</span>
                                    <strong>${evaluation.projectName}</strong>
                                </div>
                                <div class="score">${avgScore.toFixed(1)}/10</div>
                            </div>
                            <div id="result-${sanitizedProjectName}" class="result-content">
                                ${evaluation.judgeResults && evaluation.judgeResults.length > 0 ? `
                                    <div class="tabs">
                                        ${evaluation.judgeResults.map((result, index) => `
                                            <div class="tab ${index === 0 ? 'active' : ''}" onclick="switchTab('${sanitizedProjectName}', ${index})">
                                                ${result.judgeName || 'Unknown Judge'}
                                            </div>
                                        `).join('')}
                                    </div>
                                    ${evaluation.judgeResults.map((result, index) => `
                                        <div id="tab-${sanitizedProjectName}-${index}" class="tab-content ${index === 0 ? 'active' : ''}">
                                            <h4>Score: ${result.score || 0}/10</h4>
                                            <h5>Summary:</h5>
                                            <p>${result.summary || 'No summary available'}</p>
                                            <h5>Likes:</h5>
                                            <ul>
                                                ${(result.likes || []).map(like => `<li>${like}</li>`).join('')}
                                            </ul>
                                            <h5>Dislikes:</h5>
                                            <ul>
                                                ${(result.dislikes || []).map(dislike => `<li>${dislike}</li>`).join('')}
                                            </ul>
                                        </div>
                                    `).join('')}
                                ` : '<p>No judge results available for this project.</p>'}
                            </div>
                        </div>
                    `;
                }
                catch (itemError) {
                    console.error(`❌ Error rendering result for ${evaluation.projectName}:`, itemError);
                    return `
                        <div class="result-item">
                            <div class="result-header">
                                <div>
                                    <span class="rank-badge">#${evaluation.finalRank || '?'}</span>
                                    <strong>${evaluation.projectName}</strong>
                                </div>
                                <div class="score">Error</div>
                            </div>
                            <div class="result-content">
                                <p>Error displaying results for this project.</p>
                            </div>
                        </div>
                    `;
                }
            }).join('');
            console.log(`✅ Results displayed for ${this.evaluations.length} projects`);
        }
        catch (error) {
            console.error('❌ Critical error in displayResults:', error);
            // Fallback display
            const finalRankings = document.getElementById('finalRankings');
            if (finalRankings) {
                finalRankings.innerHTML = '<p>Error displaying results. Please refresh and try again.</p>';
            }
        }
    }
}
// Global instance
const hackathonJudge = new HackathonJudge();
// Global functions for HTML onclick handlers
function uploadProject() {
    console.log('🚀 uploadProject() called');
    hackathonJudge.uploadProject().catch(error => {
        console.error('❌ Upload failed:', error);
    });
}
function toggleDroppedFiles(projectId) {
    var _a;
    const content = document.getElementById(`dropped-content-${projectId}`);
    const toggle = document.getElementById(`dropped-toggle-${projectId}`);
    if (content && toggle) {
        const categoriesText = toggle.innerHTML.includes('categories') ?
            ((_a = toggle.innerHTML.match(/\((\d+) categories\)/)) === null || _a === void 0 ? void 0 : _a[0]) || '' : '';
        if (content.style.display === 'none' || content.style.display === '') {
            content.style.display = 'block';
            toggle.innerHTML = `🔽 Hide excluded files ${categoriesText}`;
        }
        else {
            content.style.display = 'none';
            toggle.innerHTML = `▶️ View excluded files ${categoriesText}`;
        }
    }
}
function addCustomJudge() {
    hackathonJudge.addCustomJudge();
}
function removeJudge(judgeId) {
    hackathonJudge.removeJudge(judgeId);
}
function startJudging() {
    console.log('🚀 startJudging() called');
    hackathonJudge.startJudging().catch(error => {
        console.error('❌ Judging failed:', error);
    });
}
function downloadProject(projectName) {
    console.log('📥 downloadProject() called for:', projectName);
    hackathonJudge.downloadProject(projectName).catch(error => {
        console.error('❌ Download failed:', error);
    });
}
function toggleResult(projectName) {
    const resultContent = document.getElementById(`result-${projectName}`);
    if (resultContent) {
        resultContent.classList.toggle('active');
    }
}
function switchTab(projectName, tabIndex) {
    // Hide all tab contents for this project
    const tabContents = document.querySelectorAll(`[id^="tab-${projectName}-"]`);
    tabContents.forEach(content => content.classList.remove('active'));
    // Hide all tabs for this project
    const tabs = document.querySelectorAll(`[onclick*="${projectName}"]`);
    tabs.forEach(tab => {
        if (tab.classList.contains('tab')) {
            tab.classList.remove('active');
        }
    });
    // Show selected tab content
    const selectedContent = document.getElementById(`tab-${projectName}-${tabIndex}`);
    if (selectedContent) {
        selectedContent.classList.add('active');
    }
    // Activate selected tab
    const selectedTab = document.querySelector(`[onclick="switchTab('${projectName}', ${tabIndex})"]`);
    if (selectedTab) {
        selectedTab.classList.add('active');
    }
}
// Global function for switching upload methods
function switchUploadMethod(method) {
    const folderMethod = document.getElementById('folderUploadMethod');
    const zipMethod = document.getElementById('zipUploadMethod');
    const folderTab = document.getElementById('folderTab');
    const zipTab = document.getElementById('zipTab');
    if (method === 'folder') {
        folderMethod.style.display = 'block';
        zipMethod.style.display = 'none';
        folderTab.classList.add('active');
        zipTab.classList.remove('active');
    }
    else {
        folderMethod.style.display = 'none';
        zipMethod.style.display = 'block';
        folderTab.classList.remove('active');
        zipTab.classList.add('active');
    }
}
// Initialize the app when DOM is loaded and add file input listener
document.addEventListener('DOMContentLoaded', () => {
    console.log('🚀 Initializing file input listeners...');
    // Add file input change listener for immediate feedback
    const fileInput = document.getElementById('folderUpload');
    if (fileInput) {
        fileInput.addEventListener('change', (event) => {
            var _a;
            const target = event.target;
            const fileCount = ((_a = target.files) === null || _a === void 0 ? void 0 : _a.length) || 0;
            if (fileCount > 0) {
                console.log(`📁 Selected ${fileCount.toLocaleString()} files for upload`);
                // Show immediate feedback
                const uploadSection = document.querySelector('.upload-section');
                if (uploadSection && fileCount > 5000) {
                    const feedbackDiv = document.createElement('div');
                    feedbackDiv.style.cssText = `
                        background: #3d2914; 
                        border: 1px solid #cc8b5c; 
                        border-radius: 8px; 
                        padding: 12px; 
                        margin-top: 12px;
                        color: #cc8b5c;
                        font-size: 14px;
                    `;
                    feedbackDiv.innerHTML = `
                        <strong>📊 ${fileCount.toLocaleString()} files selected</strong><br>
                        <small style="color: #a8a8a8;">
                            Large project detected. Files will be filtered during upload.
                        </small>
                    `;
                    // Remove any existing feedback
                    const existingFeedback = uploadSection.querySelector('[data-feedback]');
                    if (existingFeedback) {
                        existingFeedback.remove();
                    }
                    feedbackDiv.setAttribute('data-feedback', 'true');
                    uploadSection.appendChild(feedbackDiv);
                }
            }
        });
    }
});
